"""Instagram collection tasks for the persistent Supabase worker."""
import os
import logging
import re
import threading
import time
from datetime import datetime, timezone
import requests
from dotenv import load_dotenv
from storage import Storage

load_dotenv()
RAPIDAPI_HOST = os.getenv('RAPIDAPI_HOST', 'instagram-looter2.p.rapidapi.com')
FEED_PAGE_SIZE = 50
cancelled = threading.Event()
log = logging.getLogger('rd.scraper')

class ScrapeError(RuntimeError):
    pass


def check_lease():
    if cancelled.is_set():
        raise ScrapeError('Worker stopped or lost its job lease.')


def pause(seconds):
    if cancelled.wait(seconds):
        check_lease()


def _api_get(endpoint, params):
    check_lease()
    key = os.getenv('RAPIDAPI_KEY')
    if not key:
        raise ScrapeError('RapidAPI key is not configured.')
    # Retry idempotent GETs only. Bound waits and allow lease cancellation.
    for attempt in range(3):
        check_lease()
        try:
            response = requests.get(f'https://{RAPIDAPI_HOST}/{endpoint}',
                headers={'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPIDAPI_HOST},
                params=params, timeout=30)
            if response.status_code in (429, 502, 503, 504) and attempt < 2:
                try:
                    retry_after = float(response.headers.get('Retry-After', 2 ** attempt))
                except ValueError:
                    retry_after = 2 ** attempt
                pause(max(1, min(retry_after, 60)))
                continue
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ScrapeError('Provider returned an invalid response.')
            return payload
        except (requests.RequestException, ValueError) as exc:
            if attempt < 2:
                pause(2 ** attempt)
                continue
            raise ScrapeError('Instagram provider request failed. Check the provider and API quota.') from exc
    raise ScrapeError('Instagram provider request failed.')


def _extract_user(payload):
    data = payload.get('data')
    return (data.get('user') if isinstance(data, dict) else None) or payload


def _fetch_profile(username):
    if not re.fullmatch(r'[A-Za-z0-9_.]{1,30}', username):
        raise ScrapeError('Invalid Instagram username.')
    user = _extract_user(_api_get('profile', {'username': username}))
    if not user.get('id'):
        raise ScrapeError('Profile not found.')
    return user


def _fetch_feed_page(user_id, count, end_cursor=None):
    params = {'id': user_id, 'count': count}
    if end_cursor:
        params['end_cursor'] = end_cursor
    user = _extract_user(_api_get('user-feeds2', params))
    timeline = user.get('edge_owner_to_timeline_media')
    if not isinstance(timeline, dict) or not isinstance(timeline.get('edges'), list):
        raise ScrapeError('Provider feed format changed or the feed is unavailable.')
    return timeline


def _filter_edges_by_age(edges, cutoff_timestamp):
    eligible, timestamps = [], []
    for edge in edges:
        timestamp = edge.get('node', {}).get('taken_at_timestamp')
        if timestamp:
            timestamps.append(timestamp)
        if not timestamp or timestamp >= cutoff_timestamp:
            eligible.append(edge)
    return eligible, bool(timestamps) and max(timestamps) < cutoff_timestamp


def process_account_data(store, data, total_posts_override=None):
    check_lease()
    now = datetime.now(timezone.utc)
    account_id = str(data['id'])
    store.upsert('accounts', {'internal_ig_id': account_id, 'username': data['username'],
        'full_name': data.get('full_name'), 'is_business': data.get('is_business_account')}, 'internal_ig_id')
    store.upsert('daily_stats', {'account_id': account_id, 'date_checked': now.date().isoformat(),
        'scraped_at': now.isoformat(), 'followers': data.get('edge_followed_by', {}).get('count'),
        'following': data.get('edge_follow', {}).get('count'),
        'total_posts': total_posts_override if total_posts_override is not None else data.get('edge_owner_to_timeline_media', {}).get('count')},
        'account_id,date_checked')


def _like_count(node):
    # A feed can report -1 even when the single-post endpoint has a real count.
    # Check each field's value; a truthy dictionary can still contain a sentinel.
    for field in ('edge_liked_by', 'edge_media_preview_like'):
        value = node.get(field)
        count = value.get('count') if isinstance(value, dict) else None
        if isinstance(count, int) and not isinstance(count, bool) and count >= 0:
            return count
    return None


def _fetch_post_details(shortcode):
    payload = _api_get('post', {'url': f'https://www.instagram.com/p/{shortcode}/'})
    if payload.get('status') is not True:
        raise ScrapeError(f'Provider could not refresh post {shortcode}.')
    return payload


def _require_post_likes(payload, shortcode):
    likes = _like_count(payload)
    if likes is None:
        raise ScrapeError(f'Like count is unavailable for post {shortcode}, including its single-post response. No invalid count was saved.')
    return likes


def bulk_insert_posts(store, account_id, edges):
    check_lease()
    posts = []
    observed_at = datetime.now(timezone.utc).isoformat()
    for edge in edges:
        node = edge.get('node', {})
        shortcode = node.get('shortcode')
        if not shortcode or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', shortcode):
            continue
        captions = node.get('edge_media_to_caption', {}).get('edges', [])
        timestamp = node.get('taken_at_timestamp')
        likes = _like_count(node)
        if likes is None:
            log.info('Feed like count unavailable for %s; fetching single-post details', shortcode)
            likes = _require_post_likes(_fetch_post_details(shortcode), shortcode)
        comments = node.get('edge_media_to_comment') or node.get('edge_media_to_parent_comment') or node.get('edge_media_preview_comment') or {}
        posts.append({'shortcode': shortcode, 'account_id': str(account_id),
            'caption': captions[0].get('node', {}).get('text', '') if captions else node.get('caption', ''),
            'likes': likes, 'comments': comments.get('count', 0) or 0,
            'views': node.get('video_view_count', 0) or 0, 'is_video': bool(node.get('is_video', False)),
            'posted_timestamp': datetime.fromtimestamp(timestamp, timezone.utc).isoformat() if timestamp else None,
            'scraped_timestamp': observed_at})
    if posts:
        store.rpc('store_posts', p_posts=posts)
    return len(posts)


def collect_account(store, username, limit, delay, days_back=None):
    user = _fetch_profile(username)
    account_id = str(user['id'])
    cutoff = int(time.time()) - days_back * 86400 if days_back else None
    cursor, seen, collected, processed = None, set(), 0, False
    while collected < limit:
        check_lease()
        timeline = _fetch_feed_page(account_id, min(FEED_PAGE_SIZE, limit - collected), cursor)
        if not processed:
            process_account_data(store, user, timeline.get('count'))
            processed = True
        edges = timeline['edges']
        before_cutoff = False
        if cutoff:
            edges, before_cutoff = _filter_edges_by_age(edges, cutoff)
        edges = edges[:limit - collected]
        collected += bulk_insert_posts(store, account_id, edges)
        page = timeline.get('page_info', {})
        next_cursor = page.get('end_cursor')
        if before_cutoff or not edges or not page.get('has_next_page') or not next_cursor or next_cursor in seen:
            break
        seen.add(next_cursor)
        cursor = next_cursor
        pause(delay)
    if not processed:
        process_account_data(store, user)
    return {'username': username, 'posts_collected': collected, 'status': 'success'}


def run_daily_scrape(store=None):
    store = store or Storage()
    config = store.config()
    results = []
    for username in config['target_accounts']:
        check_lease()
        try:
            log.info('Collecting @%s (last %s days, limit %s)', username,
                     config['post_lookback_days'], config['incremental_post_limit'])
            result = collect_account(store, username, config['incremental_post_limit'], 1, config['post_lookback_days'])
            results.append(result)
            log.info('Collected %s posts for @%s', result['posts_collected'], username)
        except ScrapeError as exc:
            check_lease()
            log.error('Collection failed for @%s: %s', username, exc)
            results.append({'username': username, 'status': 'error', 'error': str(exc)})
    return {'accounts_scraped': sum(r['status'] == 'success' for r in results), 'accounts': results}


def run_deep_scrape(username, limit, delay, days_back=None, store=None):
    if not 1 <= limit <= 5000 or not 1 <= delay <= 3600 or (days_back is not None and not 1 <= days_back <= 3650):
        raise ScrapeError('Invalid scrape limits.')
    return collect_account(store or Storage(), username, limit, delay, days_back)


def fetch_account_count(username):
    user = _fetch_profile(username)
    return {'count': _fetch_feed_page(user['id'], 1).get('count', 0)}


def rescrape_single_post(shortcode, store=None):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', shortcode):
        raise ScrapeError('Invalid post ID.')
    store = store or Storage()
    rows = store.select('posts', shortcode=f'eq.{shortcode}', select='*')
    if not rows:
        raise ScrapeError('Post not found in the database.')
    payload = _fetch_post_details(shortcode)
    post = rows[0]
    comments = payload.get('edge_media_to_parent_comment') or payload.get('edge_media_preview_comment') or {}
    post.update(likes=_require_post_likes(payload, shortcode),
                comments=comments.get('count', 0), views=payload.get('video_view_count', 0) or 0,
                scraped_timestamp=datetime.now(timezone.utc).isoformat())
    check_lease()
    store.rpc('store_post', p_post=post)
    return {'shortcode': shortcode}

if __name__ == '__main__':
    raise SystemExit('Start worker.py to run queued jobs, or use its --once flag for a single polling cycle.')
