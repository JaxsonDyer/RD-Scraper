# Supabase, Google sign-in, and Vercel

The Next.js application serves the UI, authentication callbacks, and API on Vercel.
Supabase stores analytics, settings, admin memberships, and durable jobs. Google login
is optional for public analytics; Manager and all paid collection actions require admin
membership. A persistent Python worker runs outside Vercel and polls Supabase for work.
No Google client secret or Supabase service-role key is needed in Vercel.

## 1. Create Supabase

1. Create a project at https://supabase.com/dashboard. Store the database password securely.
2. Apply `supabase/migrations/202610080001_initial.sql` using the project SQL editor.
   This schema migration creates tables, permissions, functions, and default settings;
   it does not import existing data. Accounts, posts, statistics, and insights start empty.
3. Get the project URL and **publishable key** from the project Connect dialog.
4. Copy `frontend/.env.example` to `frontend/.env.local` and fill in those two values.
5. For the private worker, create or update `backend/.env` using `backend/.env.example`
   as a reference, preserving existing API keys. Use the same
   project URL and its legacy **service_role** JWT key from Settings > API Keys > Legacy
   keys. Only the worker gets this privileged key. Add your RapidAPI and
   OpenRouter keys there too. Never commit any populated environment file.

A brand-new project has no admins and automatic scheduling is disabled. All visitors
can read the analytics tables; settings, job details, and worker status require an admin.
If analytics should become private, change the read policies and page guards together.

## 2. Configure Google OAuth

1. Create a Google Cloud project and configure its OAuth consent screen for this app.
2. Create an OAuth client of type **Web application**.
3. Copy the callback URL displayed under Supabase Authentication > Sign In / Providers >
   Google into Google's **Authorized redirect URIs**. It looks like
   `https://PROJECT_REF.supabase.co/auth/v1/callback`.
4. Enable Google in Supabase and enter Google's client ID and client secret **there**.
5. In Supabase Authentication > URL Configuration, set your production Site URL after
   Vercel assigns it. Add exact allowed redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR_APP.vercel.app/auth/callback`
   - Your custom domain's `/auth/callback`, if you use one.
6. Add your Google account as a test user while the consent screen is in testing mode.
   Before public launch, finish Google's publishing/verification steps if requested.

For preview deployments, prefer a separate development Supabase project and explicit
preview callback URLs. Don't allow arbitrary domains to receive production sessions.

## 3. Grant the first admin

Sign in with Google once so Supabase creates your Auth user. In the SQL editor, run:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'YOUR_GOOGLE_EMAIL'
on conflict do nothing;
```

Reload the app. Manager should appear. A Google login alone does not grant admin access;
roles come from this protected table, not editable user metadata or browser state.
Remove access by deleting the user's `admin_users` row; the next request rechecks it.

## 4. Deploy the dashboard to Vercel

1. Import the GitHub repository into Vercel.
2. Set **Root Directory** to `frontend`, Framework to Next.js, and Node.js to **24.x**.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Production.
   Use a separate Supabase project for Development/Preview when possible.
4. Build command: `npm run build`. Install command: `npm ci`. `frontend/vercel.json`
   already defines these. The Python worker is not part of this deployment.
5. Deploy and add the resulting callback URL and Site URL in Supabase.
6. If Vercel Deployment Protection is enabled, ensure approved users can reach the OAuth
   callback; test login on the actual deployment rather than only localhost.

Changing `NEXT_PUBLIC_*` settings requires a new frontend build. There is no localhost
Flask rewrite in production; Next.js API handlers query Supabase with the viewer's own
verified session. Database RLS provides an additional enforcement layer.

## 5. Run the collection worker

For development:

```sh
cd backend
uv sync
uv run python worker.py
```

Or build the worker container from the repository root:

```sh
docker build -t rd-scraper-worker backend
docker run --restart unless-stopped --env-file backend/.env rd-scraper-worker
```

Deploy this container as an always-on background worker on a host that supports persistent
processes (for example, a VPS or a background-worker service). It needs outbound HTTPS
access, no public inbound port, and the private environment variables listed above.
Vercel request handlers intentionally only enqueue jobs; deep pagination can outlast a
serverless request. Manager shows whether the worker has heartbeated in the last two minutes.

The database serializes claims to one running job. Workers heartbeat their job lease; an
expired job is marked failed rather than silently replaying costly work. Retry failed jobs
from Manager. Successful daily scrapes enqueue AI refreshes separately. Job history retains
partial account failures. Schedules use the timezone in `app_config` (America/Edmonton by
default), including daylight saving time. A worker started after today's scheduled time
queues one catch-up scrape for today; it does not invent historical daily snapshots.

## 6. Collect the first data

Supabase starts fresh; no MySQL connection or old-data import is used. In Manager, review
the default target accounts and collection settings, then run a daily scrape with the
worker online. That collects current account statistics and recent posts. Use a deep
scrape if you want more post history; historical follower and engagement observations
start accumulating from new collection runs. Automatic scheduling stays disabled until
you enable it in Manager.

## Development and release checks

Worker logs appear in the terminal running the worker. `./start.sh` also saves them to
`backend/logs/worker.log`, rotating at 2 MB with three backups. After changing worker code,
restart the worker; Python does not hot reload. To save logs when running it directly:

```sh
cd backend
uv run python worker.py --log-file logs/worker.log
```

From the repository root, follow the saved log with `tail -f backend/logs/worker.log`.
Container deployments log to stdout/stderr; use `docker logs -f CONTAINER_NAME` or the
worker host's log viewer. Vercel logs cover the web/API, not the separate Python worker.
When a feed returns a negative or missing like count, collection fetches that post's
single-post details automatically. Valid feed counts, including zero, do not trigger an
extra request. If both endpoints lack a valid count, collection reports the post ID as
an error instead of saving a negative count or inventing zero likes.
Run History retains job errors and per-account results in Supabase. Provider failures now
include their HTTP status and recovery details; unexpected failures include an exception
type and job ID, with stack locations in the worker log. Old failures are not rewritten.

`./start.sh` runs the local Next.js development server and worker. You can run the UI alone
with `cd frontend && npm run dev`; jobs will wait until a worker starts. Without Supabase
settings, sign-in is unavailable, analytics display a setup message, and admin access stays
closed. Do not use live production keys for routine development.

```sh
cd frontend
npm test
npm run lint
npx tsc --noEmit
RD_NEXT_DIST_DIR=.next-check npm run build
cd ../backend
uv run python -m unittest discover -s tests
```

The worker `requirements.txt` is exported from `uv.lock`, so Docker and CI install the
locked versions. Regenerate it with `uv export --locked --no-dev --no-emit-project
--no-hashes --output-file requirements.txt` after dependency changes.

`RD_NEXT_DIST_DIR` is only for isolated local build verification; do not set it in Vercel.
Supabase authorization fixtures under `supabase/tests/` are for a disposable PostgreSQL
instance, not a live project. Apply `bootstrap.sql`, the migration, then `authorization.sql`
with `psql -v ON_ERROR_STOP=1` to validate roles, queue ownership, and metric snapshots.

Before public launch, confirm Google sign-in/out and callback handling, viewer denial at
`/scraper` and admin APIs, successful worker jobs, newly collected data, configured database
backups and a restore drill, worker log monitoring, and provider spending limits. Set a
retention policy for old jobs and metrics appropriate for the data you want to keep.

Official references:
- https://supabase.com/docs/guides/auth/server-side/nextjs
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://vercel.com/docs/functions/limitations

The runtime npm audit is clean. Five advisories remain in development-only lint
dependencies (the braces/fast-glob dependency chain); upgrading them currently requires
a breaking lint-package change. Track those separately from the deployed runtime.
