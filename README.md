<img src="frontend/public/logo.png" alt="RDD logo" width="96" height="96">

# RD Scraper

Instagram collection and analytics dashboard for Red Deer area accounts.

**Live site:** [rd.jaxsondyer.com](https://rd.jaxsondyer.com)

- **Dashboard and API:** Next.js, deployed to Vercel.
- **Login:** optional Google OAuth through Supabase Auth.
- **Database:** Supabase PostgreSQL with public analytics reads and admin-only controls.
- **Collection:** persistent Python worker, with a durable Supabase job queue.

Manager and the Posts rescrape action require an admin account. The browser never receives
the Supabase service-role key. Long scraping tasks run outside Vercel.

See [deployment instructions](docs/deployment.md) to create a fresh Supabase database,
configure Google, grant admin access, and deploy to Vercel. Existing MySQL data is not imported.

## Local development

Configure `frontend/.env.local` and `backend/.env` from their `.env.example` files, then:

```sh
cd frontend
npm ci
cd ../backend
uv sync
cd ..
./start.sh
```

The dashboard runs at `http://localhost:3000`. Google callback URLs must be allowed in
Supabase. Production uses Vercel plus a separate persistent worker; development retains
hot reload and separate environment settings.

## Manager status polling

Manager does not poll on a fixed timer. The `ai-status` and `scheduler-status`
endpoints return `poll_after_ms`, and the page waits that long, between 2 seconds
and 2 minutes, before checking again.

**The estimate comes from the Next.js API, not the worker.** The worker does not
report progress. The API only knows when the running job started. It guesses the
job's length from the median of recent runs of that kind. For a deep scrape it
uses a fixed per-request time plus the configured delay. See
[`frontend/lib/poll-estimate.ts`](frontend/lib/poll-estimate.ts).

This guess can be completely wrong, for example when the provider's speed
changes, the account list grows, or the worker changes. A wrong guess only
delays or speeds up the next check. Statuses are always read from the database.
If accurate timing matters, have the worker write an ETA to the job row and use
it instead.

## Screenshots

![Overview dashboard](docs/screenshots/overview.png)
![Scraped posts browser](docs/screenshots/posts.png)
![Scraper manager](docs/screenshots/manager.png)

## Checks

```sh
cd frontend
npm test
npm run lint
npx tsc --noEmit
RD_NEXT_DIST_DIR=.next-check npm run build
cd ../backend
uv run python -m unittest discover -s tests
```

Runtime configuration lives in Supabase. The legacy JSON scraper settings are not loaded.
Analytics start empty and populate when an admin runs the first scrape from Manager.
