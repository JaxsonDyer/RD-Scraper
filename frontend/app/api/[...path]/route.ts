import { NextResponse } from 'next/server';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';
import { getAuth } from '@/lib/auth';
import { sameOrigin } from '@/lib/security';
import { InputError, configInput, jobInput } from '@/lib/validation';
import models from '@/lib/llm-models.json';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';
import { pollAfterMs } from '@/lib/poll-estimate';
import { MOMENTUM_SETTINGS, interactions, isScorable, rankMomentum, type MomentumPost } from '@/lib/momentum';

export const dynamic = 'force-dynamic';
// A dashboard tab polls about 6 reads a minute; leave room for paging and for
// many viewers sharing one network address, such as a campus.
const allowPublicRead = createRateLimiter(300);
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
class DatabaseError extends Error { constructor(public code: string) { super('Database request failed'); } }
function check(error: { code?: string } | null) { if (error) throw new DatabaseError(error.code ?? ''); }
// Tells the Manager page how long to wait before its next status check.
async function pollAfter(client: Awaited<ReturnType<typeof createClient>>, nextRunAt: number | null = null) {
  const { data, error } = await client.from('jobs').select('kind,status,payload,created_at,started_at,completed_at')
    .order('created_at', { ascending: false }).limit(50);
  check(error);
  return pollAfterMs(data ?? [], Date.now(), nextRunAt);
}

// PostgREST returns at most 1,000 rows per request; page through, with a hard stop.
const MOMENTUM_PAGE = 1000;
const MOMENTUM_MAX_PAGES = 10;
const RECENT_POSTS_SHOWN = 5;

async function momentumBoard(client: Awaited<ReturnType<typeof createClient>>) {
  const now = Date.now();
  const since = new Date(now - MOMENTUM_SETTINGS.baselineDays * 86_400_000).toISOString();
  const { data: accounts, error } = await client.from('account_overview').select('username,full_name,total_posts');
  check(error);
  const posts: MomentumPost[] = [];
  for (let page = 0; page < MOMENTUM_MAX_PAGES; page++) {
    const { data, error: postsError } = await client.from('post_overview')
      .select('shortcode,username,likes,comments,posted_timestamp,scraped_timestamp')
      .gte('posted_timestamp', since).order('posted_timestamp', { ascending: false }).order('shortcode')
      .range(page * MOMENTUM_PAGE, (page + 1) * MOMENTUM_PAGE - 1);
    check(postsError);
    posts.push(...(data ?? []));
    if ((data?.length ?? 0) < MOMENTUM_PAGE) break;
  }
  const board = rankMomentum(accounts ?? [], posts, now);
  const recentCutoff = now - MOMENTUM_SETTINGS.recentDays * 86_400_000;
  // Newest first already, from the query order.
  const recentByAccount = new Map<string, MomentumPost[]>();
  for (const post of posts) {
    const list = recentByAccount.get(post.username) ?? [];
    if (Date.parse(post.posted_timestamp) >= recentCutoff && list.length < RECENT_POSTS_SHOWN) recentByAccount.set(post.username, [...list, post]);
  }
  const shown = [...recentByAccount.values()].flat().map(post => post.shortcode);
  const { data: captions, error: captionError } = shown.length
    ? await client.from('posts').select('shortcode,caption').in('shortcode', shown)
    : { data: [], error: null };
  check(captionError);
  const captionOf = new Map((captions ?? []).map(row => [row.shortcode, (row.caption ?? '').slice(0, 160)]));
  return {
    generated_at: new Date(now).toISOString(),
    recent_days: MOMENTUM_SETTINGS.recentDays,
    baseline_days: MOMENTUM_SETTINGS.baselineDays,
    accounts: board.map(({ account, momentum, rank }) => ({
      username: account.username, full_name: account.full_name, rank, momentum,
      recent_posts: (recentByAccount.get(account.username) ?? []).map(post => ({
        shortcode: post.shortcode, posted_timestamp: post.posted_timestamp, likes: post.likes ?? 0, comments: post.comments ?? 0,
        interactions: interactions(post), scorable: isScorable(post), caption: captionOf.get(post.shortcode) ?? '',
      })),
    })),
  };
}

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const route = path.join('/');
  const reads = ['accounts', 'stats', 'posts', 'ai-insights', 'momentum'];
  const publicRead = request.method === 'GET' && (reads.includes(route) || (path[0] === 'account-history' && path.length === 2));
  if (request.method === 'POST' && !sameOrigin(request)) return json({ error: 'Request origin is not allowed.' }, 403);
  if (publicRead && !allowPublicRead(clientKey(request))) return json({ error: 'Too many requests. Please wait a minute.' }, 429);
  if (!publicRead) {
    const auth = await getAuth();
    if (!auth.user) return json({ error: 'Sign in required.' }, 401);
    if (!auth.isAdmin) return json({ error: 'Admin access required.' }, 403);
  }
  if (!supabaseConfigured()) return json({ error: 'Analytics are being set up. Please try again later.' }, 503);
  try {
    const client = await createClient();
    const url = new URL(request.url);
    if (request.method === 'GET') {
      if (route === 'accounts') {
        const { data, error } = await client.from('account_overview').select('*').order('followers', { ascending: false, nullsFirst: false });
        check(error); return json({ accounts: data });
      }
      if (route === 'momentum') return json(await momentumBoard(client));
      if (route === 'stats') {
        const { data, error } = await client.rpc('dashboard_stats'); check(error); return json(data);
      }
      if (path[0] === 'account-history' && path.length === 2) {
        const { data, error } = await client.rpc('account_history', { p_username: path[1] }); check(error); return json(data);
      }
      if (route === 'posts') {
        const rawPage = Number(url.searchParams.get('page') ?? 0);
        if (!Number.isInteger(rawPage) || rawPage < 0 || rawPage > 100000) throw new InputError('Invalid page.');
        let query = client.from('post_overview').select('*').order('posted_timestamp', { ascending: false, nullsFirst: false }).order('shortcode');
        if (url.searchParams.get('username')) query = query.eq('username', url.searchParams.get('username')!);
        const { data, error } = await query.range(rawPage * 100, rawPage * 100 + 100);
        check(error);
        const { data: users, error: usersError } = await client.from('accounts').select('username,internal_ig_id').order('username');
        check(usersError);
        return json({ posts: data?.slice(0, 100) ?? [], users, has_more: (data?.length ?? 0) > 100, page: rawPage });
      }
      if (route === 'ai-insights') {
        const { data, error } = await client.from('ai_cache').select('data,updated_at').eq('id', 1).maybeSingle();
        check(error);
        return data ? json({ ...data.data, _meta: { last_refreshed: data.updated_at } }) : json({ error: 'No insights generated yet.' }, 404);
      }
      if (route === 'llm-models') return json(models);
      if (route === 'config') {
        const { data, error } = await client.from('app_config').select('data').eq('id', 1).single(); check(error); if (!data) throw new DatabaseError('PGRST116'); return json(data.data);
      }
      if (route === 'scheduler-status') {
        const { data, error } = await client.rpc('scheduler_status'); check(error);
        const nextRunAt = data.next_run_time ? Date.parse(data.next_run_time) : null;
        return json({ ...data, poll_after_ms: await pollAfter(client, nextRunAt) });
      }
      if (route === 'ai-status') {
        const [config, job, cache, nextPoll] = await Promise.all([
          client.from('app_config').select('data').eq('id', 1).single(),
          client.from('jobs').select('*').eq('kind', 'insights').order('created_at', { ascending: false }).limit(1).maybeSingle(),
          client.from('ai_cache').select('updated_at').eq('id', 1).maybeSingle(),
          pollAfter(client),
        ]);
        check(config.error); check(job.error); check(cache.error);
        if (!config.data) throw new DatabaseError('PGRST116');
        return json({ state: job.data?.status === 'queued' ? 'queued' : job.data?.status ?? 'idle',
          configured_model: config.data.data.llm_config.model, active_model: job.data?.result?.model ?? null,
          started_at: job.data?.started_at ?? null, completed_at: job.data?.completed_at ?? null,
          error: job.data?.error ?? null, last_refreshed: cache.data?.updated_at ?? null, poll_after_ms: nextPoll });
      }
      if (path[0] === 'jobs' && path.length === 2) {
        if (!/^[0-9a-f-]{36}$/i.test(path[1])) throw new InputError('Invalid job ID.');
        const { data, error } = await client.from('jobs').select('id,kind,status,result,error,created_at,started_at,completed_at').eq('id', path[1]).maybeSingle();
        check(error); return data ? json(data) : json({ error: 'Job not found.' }, 404);
      }
    }
    if (request.method === 'POST') {
      if (route === 'config') {
        const input = configInput(await request.json());
        const { error } = await client.rpc('save_app_config', { p_config: input }); check(error); return json({ success: true });
      }
      const kinds: Record<string, string> = {
        'force-scrape': 'daily_scrape', 'deep-scrape': 'deep_scrape', 'rescrape-post': 'rescrape',
        'generate-insights': 'insights', 'analyze-account': 'analyze',
      };
      if (kinds[route]) {
        const body = ['force-scrape', 'generate-insights'].includes(route) ? {} : await request.json();
        const payload = jobInput(kinds[route], body);
        const { data, error } = await client.rpc('enqueue_job', { p_kind: kinds[route], p_payload: payload });
        check(error); return json({ success: true, id: data.id, status: data.status, message: 'Job queued.' }, 202);
      }
    }
    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    if (error instanceof InputError || error instanceof SyntaxError) return json({ error: error instanceof InputError ? error.message : 'Invalid JSON.' }, 400);
    if (error instanceof DatabaseError) {
      if (error.code === '23505') return json({ error: 'That job is already queued or running.' }, 409);
      if (error.code === '54000') return json({ error: 'Job limit reached. Try again later.' }, 429);
      if (error.code === '42501') return json({ error: 'Admin access required.' }, 403);
      if (error.code.startsWith('22')) return json({ error: 'Invalid input.' }, 400);
    }
    console.error('API request failed:', error instanceof DatabaseError ? error.code : error instanceof Error ? error.name : 'unknown');
    return json({ error: 'Could not load or save data. Please try again.' }, 503);
  }
}
export const GET = handle;
export const POST = handle;
