begin;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
create policy own_admin_membership on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.admin_users to authenticated;
revoke all on public.admin_users from anon;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

create table public.accounts (
  internal_ig_id text primary key,
  username text not null unique,
  full_name text,
  is_business boolean
);
create table public.daily_stats (
  account_id text not null references public.accounts(internal_ig_id),
  date_checked date not null,
  scraped_at timestamptz not null default now(),
  followers bigint,
  following bigint,
  total_posts bigint,
  primary key (account_id, date_checked)
);
create table public.posts (
  shortcode text primary key,
  account_id text not null references public.accounts(internal_ig_id),
  caption text,
  likes bigint not null default 0,
  comments bigint not null default 0,
  views bigint not null default 0,
  is_video boolean not null default false,
  posted_timestamp timestamptz,
  scraped_timestamp timestamptz not null default now()
);
create index posts_account_date on public.posts(account_id, posted_timestamp desc);
create table public.post_metrics (
  shortcode text not null references public.posts(shortcode),
  observed_date date not null,
  observed_at timestamptz not null,
  likes bigint not null,
  comments bigint not null,
  views bigint not null,
  primary key (shortcode, observed_date)
);
create index metrics_date on public.post_metrics(observed_date);
create table public.ai_cache (
  id integer primary key check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.app_config (
  id integer primary key check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_config(id, data) values (1, '{"target_accounts":["madhatters.rd","reddeer","reddeervibin","reddeervtv","reddeerpolytechnic"],"daily_run_time":"00:00","timezone":"America/Edmonton","scheduler_enabled":false,"post_lookback_days":30,"incremental_post_limit":250,"llm_config":{"lookback_days":7,"max_posts":10,"model":"google/gemini-3.5-flash-lite"}}');
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('daily_scrape','deep_scrape','rescrape','insights','analyze')),
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','success','error')),
  requested_by uuid references auth.users(id) on delete set null,
  request_key text unique,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  lease_until timestamptz,
  worker_id uuid,
  attempts integer not null default 0,
  result jsonb,
  error text
);
create index jobs_queue on public.jobs(created_at) where status = 'queued';
create unique index jobs_active_target on public.jobs(kind, (coalesce(payload->>'username', payload->>'shortcode', '')))
  where status in ('queued', 'running');
create table public.worker_status (
  id integer primary key check (id = 1),
  last_seen timestamptz not null,
  worker_id uuid not null
);

alter table public.accounts enable row level security;
alter table public.daily_stats enable row level security;
alter table public.posts enable row level security;
alter table public.post_metrics enable row level security;
alter table public.ai_cache enable row level security;
alter table public.app_config enable row level security;
alter table public.jobs enable row level security;
alter table public.worker_status enable row level security;
create policy public_accounts on public.accounts for select to anon, authenticated using (true);
create policy public_stats on public.daily_stats for select to anon, authenticated using (true);
create policy public_posts on public.posts for select to anon, authenticated using (true);
create policy public_metrics on public.post_metrics for select to anon, authenticated using (true);
create policy public_insights on public.ai_cache for select to anon, authenticated using (true);
create policy admin_config on public.app_config for select to authenticated using ((select public.is_admin()));
create policy admin_jobs on public.jobs for select to authenticated using ((select public.is_admin()));
create policy admin_worker on public.worker_status for select to authenticated using ((select public.is_admin()));
-- Anonymous visitors can read analytics; all writes go through checked RPCs or the worker.
revoke all on public.accounts, public.daily_stats, public.posts, public.post_metrics,
  public.ai_cache, public.app_config, public.jobs, public.worker_status from anon, authenticated;
grant select on public.accounts, public.daily_stats, public.posts, public.post_metrics, public.ai_cache to anon, authenticated;
grant select on public.app_config, public.jobs, public.worker_status to authenticated;
grant all on all tables in schema public to service_role;

create view public.account_overview with (security_invoker = true) as
select a.*, s.date_checked, s.followers, s.following, s.total_posts
from public.accounts a left join lateral (
  select * from public.daily_stats where account_id = a.internal_ig_id
  order by scraped_at desc, date_checked desc limit 1
) s on true;
create view public.post_overview with (security_invoker = true) as
select p.*, a.username from public.posts p join public.accounts a on a.internal_ig_id = p.account_id;
grant select on public.account_overview, public.post_overview to anon, authenticated;

create function public.dashboard_stats() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'totals', (select jsonb_build_object('total_posts', count(*), 'total_likes', coalesce(sum(likes),0),
      'total_comments', coalesce(sum(comments),0), 'total_views', coalesce(sum(views),0)) from public.posts),
    'by_account', coalesce((select jsonb_agg(t order by t.likes desc) from (
      select a.username, count(p.shortcode) as post_count, coalesce(sum(p.likes),0) as likes,
        coalesce(sum(p.comments),0) as comments, coalesce(sum(p.views),0) as views
      from public.accounts a left join public.posts p on p.account_id = a.internal_ig_id group by a.username
    ) t), '[]'::jsonb)
  );
$$;
create function public.account_history(p_username text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'profile_history', coalesce((select jsonb_agg(t order by t.date_checked) from (
      select s.date_checked, s.followers, s.following, s.total_posts from public.daily_stats s
      join public.accounts a on a.internal_ig_id = s.account_id where a.username = p_username
    ) t), '[]'::jsonb),
    'engagement_history', coalesce((select jsonb_agg(t order by t.scrape_date) from (
      select m.observed_date as scrape_date, sum(m.likes) as likes, sum(m.comments) as comments,
        sum(m.views) as views, count(*) as posts_scraped
      from public.post_metrics m join public.posts p on p.shortcode = m.shortcode
      join public.accounts a on a.internal_ig_id = p.account_id where a.username = p_username
      group by m.observed_date
    ) t), '[]'::jsonb)
  );
$$;
revoke all on function public.dashboard_stats(), public.account_history(text) from public;
grant execute on function public.dashboard_stats(), public.account_history(text) to anon, authenticated, service_role;

create function public.save_app_config(p_config jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare account text; current_config jsonb;
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Admin access required'; end if;
  if jsonb_typeof(p_config) <> 'object' or jsonb_typeof(p_config->'target_accounts') <> 'array'
    or jsonb_array_length(p_config->'target_accounts') > 50
    or coalesce(p_config->>'daily_run_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or jsonb_typeof(p_config->'scheduler_enabled') is distinct from 'boolean'
    or not coalesce((p_config->>'post_lookback_days')::integer between 1 and 3650, false)
    or not coalesce((p_config->>'incremental_post_limit')::integer between 1 and 5000, false)
    or not coalesce((p_config#>>'{llm_config,lookback_days}')::integer between 1 and 365, false)
    or not coalesce((p_config#>>'{llm_config,max_posts}')::integer between 1 and 250, false)
    or length(coalesce(p_config#>>'{llm_config,model}','')) not between 1 and 200
  then raise invalid_parameter_value using message = 'Invalid configuration'; end if;
  for account in select jsonb_array_elements_text(p_config->'target_accounts') loop
    if account !~ '^[A-Za-z0-9_.]{1,30}$' then raise invalid_parameter_value using message = 'Invalid account name'; end if;
  end loop;
  select data into current_config from public.app_config where id = 1 for update;
  p_config := jsonb_build_object(
    'target_accounts', p_config->'target_accounts', 'daily_run_time', p_config->'daily_run_time',
    'scheduler_enabled', p_config->'scheduler_enabled', 'timezone', current_config->'timezone',
    'post_lookback_days', p_config->'post_lookback_days', 'incremental_post_limit', p_config->'incremental_post_limit',
    'llm_config', p_config->'llm_config');
  update public.app_config set data = p_config, updated_at = now() where id = 1;
  return p_config;
end;
$$;
create function public.enqueue_job(p_kind text, p_payload jsonb default '{}') returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare job public.jobs;
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Admin access required'; end if;
  if p_kind not in ('daily_scrape','deep_scrape','rescrape','insights','analyze') or jsonb_typeof(p_payload) <> 'object'
    then raise invalid_parameter_value using message = 'Invalid job'; end if;
  if p_kind in ('deep_scrape','analyze') and coalesce(p_payload->>'username','') !~ '^[A-Za-z0-9_.]{1,30}$'
    then raise invalid_parameter_value using message = 'Invalid username'; end if;
  if p_kind = 'rescrape' and coalesce(p_payload->>'shortcode','') !~ '^[A-Za-z0-9_-]{1,64}$'
    then raise invalid_parameter_value using message = 'Invalid post id'; end if;
  if p_kind = 'deep_scrape' and (
    not coalesce((p_payload->>'limit')::integer between 1 and 5000,false)
    or not coalesce((p_payload->>'delay')::integer between 1 and 3600,false))
    then raise invalid_parameter_value using message = 'Invalid scrape limits'; end if;
  -- Serialize enqueue checks so simultaneous requests cannot bypass the limits.
  perform pg_advisory_xact_lock(810081);
  if (select count(*) from public.jobs where requested_by = auth.uid() and created_at > now() - interval '1 hour') >= 60
    or (select count(*) from public.jobs where status = 'queued') >= 100
    then raise program_limit_exceeded using message = 'Job limit reached. Try again later.'; end if;
  insert into public.jobs(kind,payload,requested_by) values(p_kind,p_payload,auth.uid()) returning * into job;
  return job;
end;
$$;
revoke all on function public.save_app_config(jsonb), public.enqueue_job(text,jsonb) from public;
grant execute on function public.save_app_config(jsonb), public.enqueue_job(text,jsonb) to authenticated;

-- Only the private worker can claim, heartbeat, finish, or schedule jobs.
create function public.claim_job(p_worker uuid) returns setof public.jobs
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(810082);
  update public.jobs set status = 'error', completed_at = now(), error = 'Worker lease expired; retry from Manager.'
    where status = 'running' and lease_until < now();
  if exists(select 1 from public.jobs where status = 'running') then return; end if;
  return query update public.jobs set status = 'running', started_at = now(), lease_until = now() + interval '5 minutes',
    worker_id = p_worker, attempts = attempts + 1
    where id = (select id from public.jobs where status = 'queued' order by created_at for update skip locked limit 1)
    returning *;
end;
$$;
create function public.heartbeat_job(p_job uuid, p_worker uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs set lease_until = now() + interval '5 minutes'
    where id = p_job and worker_id = p_worker and status = 'running' and lease_until > now();
  if not found then return false; end if;
  insert into public.worker_status(id,last_seen,worker_id) values (1,now(),p_worker)
    on conflict(id) do update set last_seen = excluded.last_seen, worker_id = excluded.worker_id;
  return true;
end;
$$;
create function public.finish_job(p_job uuid, p_worker uuid, p_result jsonb, p_error text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs set status = case when p_error is null then 'success' else 'error' end,
    completed_at = now(), lease_until = null, result = p_result, error = left(p_error,1000)
    where id = p_job and worker_id = p_worker and status = 'running' and lease_until > now();
  return found;
end;
$$;
create function public.schedule_daily() returns void
language plpgsql security definer set search_path = '' as $$
declare settings jsonb; local_now timestamp; run_key text;
begin
  select data into settings from public.app_config where id = 1;
  if not (settings->>'scheduler_enabled')::boolean then return; end if;
  local_now := now() at time zone (settings->>'timezone');
  if local_now::time < (settings->>'daily_run_time')::time then return; end if;
  run_key := 'daily:' || local_now::date::text;
  begin
    insert into public.jobs(kind, request_key) values ('daily_scrape', run_key) on conflict do nothing;
  exception when unique_violation then null;
  end;
end;
$$;
create function public.store_post(p_post jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare observation timestamptz := coalesce((p_post->>'scraped_timestamp')::timestamptz, now());
begin
  insert into public.posts(shortcode,account_id,caption,likes,comments,views,is_video,posted_timestamp,scraped_timestamp)
    values(p_post->>'shortcode',p_post->>'account_id',p_post->>'caption',
      (p_post->>'likes')::bigint,(p_post->>'comments')::bigint,(p_post->>'views')::bigint,
      (p_post->>'is_video')::boolean,(p_post->>'posted_timestamp')::timestamptz,observation)
    on conflict(shortcode) do update set caption = excluded.caption, likes = excluded.likes,
      comments = excluded.comments, views = excluded.views, is_video = excluded.is_video,
      scraped_timestamp = excluded.scraped_timestamp;
  insert into public.post_metrics(shortcode,observed_date,observed_at,likes,comments,views)
    values(p_post->>'shortcode',(observation at time zone 'UTC')::date,observation,
      (p_post->>'likes')::bigint,(p_post->>'comments')::bigint,(p_post->>'views')::bigint)
    on conflict(shortcode,observed_date) do update set observed_at = excluded.observed_at,
      likes = excluded.likes, comments = excluded.comments, views = excluded.views;
end;
$$;
revoke all on function public.claim_job(uuid), public.heartbeat_job(uuid,uuid),
  public.finish_job(uuid,uuid,jsonb,text), public.schedule_daily(), public.store_post(jsonb) from public, anon, authenticated;
grant execute on function public.claim_job(uuid), public.heartbeat_job(uuid,uuid),
  public.finish_job(uuid,uuid,jsonb,text), public.schedule_daily(), public.store_post(jsonb) to service_role;
create function public.scheduler_status() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare settings jsonb; next_run timestamptz; local_now timestamp; seen timestamptz;
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Admin access required'; end if;
  select data into settings from public.app_config where id = 1;
  select last_seen into seen from public.worker_status where id = 1;
  if (settings->>'scheduler_enabled')::boolean then
    local_now := now() at time zone (settings->>'timezone');
    next_run := (local_now::date + (settings->>'daily_run_time')::time) at time zone (settings->>'timezone');
    if next_run <= now() then next_run := ((local_now::date + 1) + (settings->>'daily_run_time')::time) at time zone (settings->>'timezone'); end if;
  end if;
  return jsonb_build_object('success',true,'next_run_time',next_run,'timezone',settings->>'timezone',
    'worker_online',coalesce(seen > now() - interval '2 minutes',false),'worker_last_seen',seen,
    'last_run_date',(select max(completed_at) from public.jobs where kind = 'daily_scrape' and status = 'success'),
    'scrape_runs',coalesce((select jsonb_agg(t order by t.created_at desc) from (
      select id,kind,status,error,result,created_at,created_at::date as run_date,started_at,completed_at,
        coalesce((result->>'accounts_scraped')::integer,0) as accounts_scraped
      from public.jobs order by created_at desc limit 60
    ) t),'[]'::jsonb));
end;
$$;
revoke all on function public.scheduler_status() from public;
grant execute on function public.scheduler_status() to authenticated, service_role;
create function public.store_posts(p_posts jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  if jsonb_typeof(p_posts) <> 'array' or jsonb_array_length(p_posts) > 100 then
    raise invalid_parameter_value using message = 'Invalid post batch';
  end if;
  for item in select jsonb_array_elements(p_posts) loop
    perform public.store_post(item);
  end loop;
end;
$$;
create function public.enqueue_insights_after_scrape(p_request_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.jobs(kind,request_key) values ('insights',p_request_key) on conflict do nothing;
end;
$$;
revoke all on function public.store_posts(jsonb), public.enqueue_insights_after_scrape(text) from public, anon, authenticated;
grant execute on function public.store_posts(jsonb), public.enqueue_insights_after_scrape(text) to service_role;
commit;
