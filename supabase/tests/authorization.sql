begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','admin@example.test'),
 ('00000000-0000-4000-8000-000000000002','viewer@example.test');
insert into public.admin_users(user_id) values ('00000000-0000-4000-8000-000000000001');
insert into public.accounts values ('test','example','Test',false);
set role anon;
do $$ begin
  if public.is_admin() then raise exception 'Anonymous user became admin'; end if;
  perform public.dashboard_stats();
  begin
    perform public.enqueue_job('daily_scrape','{}');
    raise exception 'Anonymous user enqueued a job';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_job('00000000-0000-4000-8000-000000000003');
    raise exception 'Anonymous user claimed a job';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
set role authenticated;
do $$ begin
  if public.is_admin() then raise exception 'Viewer became admin'; end if;
  if exists(select 1 from public.admin_users) then raise exception 'Viewer read admin memberships'; end if;
  if exists(select 1 from public.app_config) then raise exception 'Viewer read configuration'; end if;
  begin
    perform public.enqueue_job('daily_scrape','{}');
    raise exception 'Viewer enqueued a job';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.admin_users values(auth.uid(),now());
    raise exception 'Viewer granted themselves admin';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set role authenticated;
do $$ declare job public.jobs; begin
  if not public.is_admin() then raise exception 'Admin was denied'; end if;
  perform public.save_app_config((select data from public.app_config where id = 1));
  select * into job from public.enqueue_job('daily_scrape','{}');
  if job.requested_by <> auth.uid() or job.status <> 'queued' then raise exception 'Invalid queued job'; end if;
  begin
    perform public.enqueue_job('daily_scrape','{}');
    raise exception 'Duplicate active job accepted';
  exception when unique_violation then null; end;
  begin
    perform public.enqueue_job('deep_scrape','{"username":"example","limit":5001,"delay":1}');
    raise exception 'Unbounded job accepted';
  exception when invalid_parameter_value then null; end;
  perform public.scheduler_status();
end $$;
reset role;
set role service_role;
do $$ declare job public.jobs; claimed integer; begin
  select * into job from public.claim_job('00000000-0000-4000-8000-000000000003');
  if job.status <> 'running' then raise exception 'Worker could not claim job'; end if;
  select count(*) into claimed from public.claim_job('00000000-0000-4000-8000-000000000004');
  if claimed <> 0 then raise exception 'Concurrent worker claimed another job'; end if;
  if public.finish_job(job.id,'00000000-0000-4000-8000-000000000004','{}',null) then raise exception 'Wrong worker completed job'; end if;
  if not public.heartbeat_job(job.id,'00000000-0000-4000-8000-000000000003') then raise exception 'Heartbeat failed'; end if;
  if not public.finish_job(job.id,'00000000-0000-4000-8000-000000000003','{"accounts_scraped":1}',null) then raise exception 'Finish failed'; end if;
  perform public.store_post('{"shortcode":"test","account_id":"test","caption":"Test","likes":10,"comments":2,"views":0,"is_video":false,"posted_timestamp":"2026-10-01T00:00:00Z","scraped_timestamp":"2026-10-01T01:00:00Z"}');
  perform public.store_post('{"shortcode":"test","account_id":"test","caption":"Test","likes":20,"comments":3,"views":0,"is_video":false,"posted_timestamp":"2026-10-01T00:00:00Z","scraped_timestamp":"2026-10-02T01:00:00Z"}');
  if (select count(*) from public.post_metrics where shortcode = 'test') <> 2 then raise exception 'Historical snapshots overwritten'; end if;
  if (select likes from public.posts where shortcode = 'test') <> 20 then raise exception 'Post not updated'; end if;
  perform public.store_posts('[]');
  perform public.schedule_daily();
end $$;
reset role;
rollback;
select 'Authorization, queue ownership, duplicate prevention, and snapshot checks passed' as result;
