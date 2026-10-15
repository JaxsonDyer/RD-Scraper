import unittest
import logging
import os
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch
import httpx
from openai import APIStatusError
import main as scraper
from datetime import datetime, timedelta, timezone
from insights import (validate_insights, generate_insights, provider_error, summarize_accounts, parse_json_reply,
                      score_posts, select_posts, engagement)

NOW = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)


def post(code, username, likes, comments=0, days_old=3, **extra):
    return {'shortcode': code, 'username': username, 'likes': likes, 'comments': comments, 'views': 0,
            'is_video': False, 'posted_timestamp': (NOW - timedelta(days=days_old)).isoformat(),
            'scraped_timestamp': NOW.isoformat(), **extra}


def insight_store(model='test/model'):
    """A store holding one recent post, enough for generate_insights to reach the model call."""
    store = Mock()
    store.config.return_value = {'target_accounts': ['a'],
                                 'llm_config': {'lookback_days': 7, 'max_posts': 10, 'model': model}}
    rows = {'post_overview': [post('p1', 'a', 10, days_old=2)], 'posts': [{'shortcode': 'p1', 'caption': 'test'}],
            'post_metrics': []}
    store.select.side_effect = lambda table, **params: rows[table]
    return store
from worker import execute_job, run_claimed, configure_logging

class WorkerTests(unittest.TestCase):
    def setUp(self):
        scraper.cancelled.clear()

    def test_pinned_old_post_does_not_stop_pagination(self):
        edges = [{'node': {'taken_at_timestamp': 10}}, {'node': {'taken_at_timestamp': 100}}]
        eligible, stop = scraper._filter_edges_by_age(edges, 50)
        self.assertEqual(len(eligible), 1)
        self.assertFalse(stop)

    def test_old_page_stops_collection(self):
        _, stop = scraper._filter_edges_by_age([{'node': {'taken_at_timestamp': 10}}], 50)
        self.assertTrue(stop)

    def test_store_batches_post_observations_in_utc(self):
        store = Mock()
        count = scraper.bulk_insert_posts(store, '123', [{'node': {'shortcode': 'abc', 'taken_at_timestamp': 0, 'edge_liked_by': {'count': 9}}}])
        self.assertEqual(count, 1)
        post = store.rpc.call_args.kwargs['p_posts'][0]
        self.assertEqual(post['likes'], 9)
        self.assertEqual(post['account_id'], '123')
        self.assertTrue(post['scraped_timestamp'].endswith('+00:00'))

    def test_lease_loss_prevents_writes(self):
        scraper.cancelled.set()
        store = Mock()
        with self.assertRaises(scraper.ScrapeError):
            scraper.bulk_insert_posts(store, '123', [])
        store.rpc.assert_not_called()

    @patch('main._api_get')
    def test_negative_feed_likes_use_single_post_count(self, api):
        api.return_value = {'status': True, 'edge_media_preview_like': {'count': 3}}
        store = Mock()
        scraper.bulk_insert_posts(store, '123', [{'node': {
            'shortcode': 'DeP78_ASO4B', 'edge_media_preview_like': {'count': -1},
            'edge_media_to_comment': {'count': 1}, 'video_view_count': 1532}}])
        post = store.rpc.call_args.kwargs['p_posts'][0]
        self.assertEqual(post['likes'], 3)
        self.assertEqual(post['comments'], 1)
        self.assertEqual(post['views'], 1532)
        api.assert_called_once_with('post', {'url': 'https://www.instagram.com/p/DeP78_ASO4B/'})

    @patch('main._api_get')
    def test_missing_feed_likes_use_single_post_count(self, api):
        api.return_value = {'status': True, 'edge_media_preview_like': {'count': 5}}
        store = Mock()
        scraper.bulk_insert_posts(store, '123', [{'node': {'shortcode': 'abc'}}])
        self.assertEqual(store.rpc.call_args.kwargs['p_posts'][0]['likes'], 5)

    @patch('main._api_get')
    def test_valid_zero_likes_do_not_trigger_extra_request(self, api):
        store = Mock()
        scraper.bulk_insert_posts(store, '123', [{'node': {
            'shortcode': 'abc', 'edge_liked_by': {'count': 0}, 'edge_media_preview_like': {'count': -1}}}])
        self.assertEqual(store.rpc.call_args.kwargs['p_posts'][0]['likes'], 0)
        api.assert_not_called()

    @patch('main._api_get')
    def test_invalid_primary_count_uses_valid_alternate_field(self, api):
        store = Mock()
        scraper.bulk_insert_posts(store, '123', [{'node': {
            'shortcode': 'abc', 'edge_liked_by': {'count': -1}, 'edge_media_preview_like': {'count': 12}}}])
        self.assertEqual(store.rpc.call_args.kwargs['p_posts'][0]['likes'], 12)
        api.assert_not_called()

    @patch('main._api_get')
    def test_unavailable_single_post_likes_do_not_overwrite_database(self, api):
        api.return_value = {'status': True, 'edge_media_preview_like': {'count': -1}}
        store = Mock()
        with self.assertRaisesRegex(scraper.ScrapeError, 'Like count is unavailable for post abc'):
            scraper.bulk_insert_posts(store, '123', [{'node': {
                'shortcode': 'abc', 'edge_media_preview_like': {'count': -1}}}])
        store.rpc.assert_not_called()

    @patch('main._api_get', side_effect=scraper.ScrapeError('Instagram provider request failed.'))
    def test_failed_single_post_request_does_not_save_negative_feed_count(self, api):
        store = Mock()
        with self.assertRaises(scraper.ScrapeError):
            scraper.bulk_insert_posts(store, '123', [{'node': {
                'shortcode': 'abc', 'edge_media_preview_like': {'count': -1}}}])
        store.rpc.assert_not_called()

    @patch('main._api_get')
    def test_rescrape_rejects_unavailable_likes_without_overwrite(self, api):
        api.return_value = {'status': True, 'edge_media_preview_like': {'count': -1}}
        store = Mock()
        store.select.return_value = [{'shortcode': 'abc', 'likes': 20}]
        with self.assertRaises(scraper.ScrapeError):
            scraper.rescrape_single_post('abc', store)
        store.rpc.assert_not_called()

    def test_invalid_like_values_are_not_real_counts(self):
        for value in (-1, None, True, 'unknown', 1.5):
            self.assertIsNone(scraper._like_count({'edge_media_preview_like': {'count': value}}))

    def test_ai_schema_rejects_invalid_bullets(self):
        with self.assertRaises(ValueError):
            validate_insights({'communityPulse': 'a', 'viralAnomaly': 'b', 'sectorMomentum': 'not a list'})

    def test_ai_schema_strips_unexpected_fields(self):
        result = validate_insights({'communityPulse': 'a', 'viralAnomaly': 'b', 'sectorMomentum': ['c'], 'extra': 'discard'})
        self.assertNotIn('extra', result)
        self.assertEqual(result['underperformers'], [])

    def test_ai_schema_keeps_only_supplied_underperformers(self):
        result = validate_insights({'communityPulse': 'a', 'viralAnomaly': 'b', 'sectorMomentum': ['c'],
                                    'underperformers': [{'shortcode': 'p1', 'reason': 'Off-topic.'},
                                                        {'shortcode': 'made-up', 'reason': 'Invented.'}]}, {'p1': 'a'})
        self.assertEqual(result['underperformers'], [{'shortcode': 'p1', 'username': 'a', 'reason': 'Off-topic.'}])

    @patch('worker.scraper.run_daily_scrape')
    def test_partial_scrape_is_not_success(self, scrape):
        scrape.return_value = {'accounts_scraped': 1, 'accounts': [{'status': 'success'}, {'status': 'error', 'username': 'missing', 'error': 'Profile not found.'}]}
        store = Mock()
        result, error = execute_job(store, {'kind': 'daily_scrape', 'payload': {}, 'id': 'abc'})
        self.assertEqual(result['accounts_scraped'], 1)
        self.assertIn('1 account', error)
        self.assertIn('@missing: Profile not found.', error)
        store.rpc.assert_called_once_with('enqueue_insights_after_scrape', p_request_key='insights:abc')

    @patch('worker.scraper.run_daily_scrape')
    def test_fully_failed_scrape_does_not_queue_insights(self, scrape):
        scrape.return_value = {'accounts_scraped': 0, 'accounts': [{'status': 'error', 'username': 'missing', 'error': 'Profile not found.'}]}
        store = Mock()
        _, error = execute_job(store, {'kind': 'daily_scrape', 'payload': {}, 'id': 'abc'})
        self.assertIn('1 account', error)
        store.rpc.assert_not_called()

    def test_posts_are_scored_against_their_own_account(self):
        scored, by_account = score_posts([post('a1', 'a', 100), post('a2', 'a', 200), post('a3', 'a', 300),
                                          post('b1', 'b', 10, comments=10), post('new', 'a', 5000, days_old=0.5)], NOW)
        ratios = {p['shortcode']: p['x_typical'] for p in scored}
        self.assertEqual(ratios, {'a1': 0.5, 'a2': 1.0, 'a3': 1.5, 'b1': 1.0})
        self.assertEqual(by_account['b'], [engagement({'likes': 10, 'comments': 10})])

    def test_posts_scraped_too_soon_after_posting_are_not_scored(self):
        stale = post('stale', 'a', 3, days_old=5, scraped_timestamp=(NOW - timedelta(days=5, hours=-4)).isoformat())
        scored, _ = score_posts([stale, post('a1', 'a', 100)], NOW)
        self.assertEqual([p['shortcode'] for p in scored], ['a1'])

    def test_selection_represents_every_account_and_finds_underperformers(self):
        posts = [post(f'big{i}', 'big', likes) for i, likes in enumerate([5000, 5200, 5400, 1000])]
        posts += [post(f'small{i}', 'small', likes) for i, likes in enumerate([40, 50, 200])]
        scored, by_account = score_posts(posts, NOW)
        standouts, weak = select_posts(scored, by_account, max_posts=2)
        # small2 is 4x its account's median; big's raw likes don't let it take both slots.
        self.assertEqual([p['shortcode'] for p in standouts], ['small2', 'big2'])
        self.assertEqual([p['shortcode'] for p in weak], ['big3'])

    def test_underperformers_need_an_account_baseline(self):
        scored, by_account = score_posts([post('a1', 'a', 10), post('a2', 'a', 1000)], NOW)
        self.assertEqual(select_posts(scored, by_account, max_posts=1)[1], [])

    def test_account_summary_compares_periods_and_includes_quiet_accounts(self):
        current = [post('a1', 'a', 10), post('a2', 'a', 30)]
        scored, by_account = score_posts(current, NOW)
        rows = summarize_accounts(['a', 'quiet'], current, [post('old', 'a', 50, days_old=10)], by_account)
        self.assertEqual(rows, [
            {'username': 'a', 'posts': 2, 'median_engagement': 20, 'previous_period': {'posts': 1, 'median_engagement': 50}},
            {'username': 'quiet', 'posts': 0, 'median_engagement': None, 'previous_period': {'posts': 0, 'median_engagement': None}}])

    def test_provider_error_preserves_cause_but_redacts_credentials(self):
        response = httpx.Response(401, request=httpx.Request('POST', 'https://openrouter.ai/api/v1/chat/completions'))
        error = APIStatusError('request failed', response=response,
            body={'error': {'message': 'Invalid key test-private-key and Bearer another-token'}})
        with patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test-private-key'}):
            message = provider_error(error)
        self.assertIn('HTTP 401', message)
        self.assertIn('Check the OpenRouter API key', message)
        self.assertNotIn('test-private-key', message)
        self.assertNotIn('another-token', message)

    @patch('insights.OpenAI')
    def test_provider_failure_reaches_job_error_without_writing_cache(self, client):
        response = httpx.Response(404, request=httpx.Request('POST', 'https://openrouter.ai/api/v1/chat/completions'))
        client.return_value.chat.completions.create.side_effect = APIStatusError(
            'request failed', response=response, body={'message': 'No endpoints support these parameters.'})
        store = insight_store()
        with patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test-key'}):
            with self.assertRaisesRegex(scraper.ScrapeError, 'OpenRouter HTTP 404: No endpoints support these parameters'):
                generate_insights(store)
        store.upsert.assert_not_called()

    def test_json_reply_tolerates_fences_and_prose(self):
        self.assertEqual(parse_json_reply('{"a": 1}'), {'a': 1})
        self.assertEqual(parse_json_reply('```json\n{"a": 1}\n```'), {'a': 1})
        self.assertEqual(parse_json_reply('Here is the summary:\n{"a": {"b": 2}}\nThanks'), {'a': {'b': 2}})
        with self.assertRaises(ValueError):
            parse_json_reply('no json here')

    @patch('insights.OpenAI')
    def test_malformed_ai_output_is_actionable(self, client):
        client.return_value.chat.completions.create.return_value.choices = [Mock(message=Mock(content='Sorry, I cannot help.'))]
        store = insight_store()
        with patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test-key'}):
            with self.assertRaisesRegex(scraper.ScrapeError, 'did not return the expected JSON'):
                generate_insights(store)
        store.upsert.assert_not_called()

    @patch('insights.OpenAI')
    def test_empty_ai_output_is_actionable(self, client):
        client.return_value.chat.completions.create.return_value.choices = []
        store = insight_store()
        with patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test-key'}):
            with self.assertRaisesRegex(scraper.ScrapeError, 'returned no summary text'):
                generate_insights(store)
        store.upsert.assert_not_called()

    @patch('worker.execute_job', side_effect=RuntimeError('private upstream body'))
    def test_unexpected_failure_logs_location_without_exception_body(self, execute):
        store = Mock()
        job = {'id': 'test-job', 'kind': 'insights'}
        with self.assertLogs('rd.worker', level='ERROR') as capture:
            run_claimed(store, job, 'test-worker')
        logs = '\n'.join(capture.output)
        self.assertIn('RuntimeError', logs)
        self.assertIn('worker.py', logs)
        self.assertNotIn('private upstream body', logs)
        error = store.rpc.call_args.kwargs['p_error']
        self.assertIn('test-job', error)

    def test_log_file_keeps_worker_failure_details(self):
        root = logging.getLogger()
        old_handlers, old_level = root.handlers[:], root.level
        try:
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / 'logs' / 'worker.log'
                configure_logging(str(path))
                logging.getLogger('rd.worker').error('Test failure: OpenRouter HTTP 429')
                self.assertIn('Test failure: OpenRouter HTTP 429', path.read_text())
        finally:
            for handler in root.handlers:
                handler.close()
            root.handlers = old_handlers
            root.setLevel(old_level)

if __name__ == '__main__':
    unittest.main()
