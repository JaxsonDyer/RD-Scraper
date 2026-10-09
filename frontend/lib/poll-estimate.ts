// Tells the Manager page when its status is next likely to change, so it can
// wait that long instead of polling on a fixed timer.
//
// WARNING: this ETA is a guess made by the Next.js API, NOT reported by the
// Python worker. The worker does not share its progress. This only sees when
// a job started and assumes:
//   - daily_scrape, insights, rescrape, analyze: as long as the median of that
//     kind's last 5 successful runs (or DEFAULT_DURATION_MS before any exist);
//   - deep_scrape: REQUEST_MS per provider request (1 profile lookup plus 1 per
//     50 posts) plus the chosen delay between pages.
// It can be badly wrong. Examples: the provider speeds up or slows down,
// target_accounts changes size, or many posts need single-post like lookups.
// It also goes stale when the worker changes. Being wrong only changes WHEN
// the page checks: overdue jobs are re-checked every 5-15 seconds, and every
// wait is clamped to 2 seconds - 2 minutes. Status shown is always real.
// If accuracy matters, have the worker write its own ETA to the jobs row.
export const MIN_POLL_MS = 2_000;
export const MAX_POLL_MS = 120_000;
// The worker checks the queue every 10 seconds.
const QUEUED_POLL_MS = 5_000;
// Hardcoded from the worker log of 2026-10-08: roughly 5-10 seconds per
// provider request. Not measured live; update it if the provider changes.
const REQUEST_MS = 8_000;
const FEED_PAGE_SIZE = 50;
// Used until a job kind has completed runs to learn from. Also taken from the
// 2026-10-08 log (daily scrape about 100s for 5 accounts, insights about 40s).
const DEFAULT_DURATION_MS: Record<string, number> = {
  daily_scrape: 120_000, insights: 60_000, rescrape: 10_000, analyze: 15_000,
};

export type PollJob = {
  kind: string;
  status: string;
  payload?: { limit?: number; delay?: number } | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export function clampPoll(ms: unknown) {
  return typeof ms === 'number' && Number.isFinite(ms) ? Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.round(ms))) : MAX_POLL_MS;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Deep scrapes vary too much for history; estimate from pages and the chosen delay.
function estimateDuration(job: PollJob, jobs: PollJob[]) {
  if (job.kind === 'deep_scrape') {
    const pages = Math.max(1, Math.ceil((job.payload?.limit ?? FEED_PAGE_SIZE) / FEED_PAGE_SIZE));
    return REQUEST_MS * (pages + 1) + (pages - 1) * (job.payload?.delay ?? 1) * 1000;
  }
  const past = jobs
    .filter(j => j.kind === job.kind && j.status === 'success' && j.started_at && j.completed_at)
    .slice(0, 5)
    .map(j => Date.parse(j.completed_at!) - Date.parse(j.started_at!))
    .filter(ms => ms > 0);
  return past.length ? median(past) : DEFAULT_DURATION_MS[job.kind] ?? 60_000;
}

/** jobs: recent jobs, newest first. nextRunAt: the next scheduled scrape, if any. */
export function pollAfterMs(jobs: PollJob[], now: number, nextRunAt: number | null = null) {
  const running = jobs.find(j => j.status === 'running' && j.started_at);
  if (running) {
    const remaining = Date.parse(running.started_at!) + estimateDuration(running, jobs) - now;
    // Overdue: check often at first, then ease off for jobs that run long.
    if (remaining <= 0) return clampPoll(remaining > -60_000 ? 5_000 : 15_000);
    return clampPoll(remaining + 2_000);
  }
  if (jobs.some(j => j.status === 'queued')) return QUEUED_POLL_MS;
  // Idle: wake shortly after the scheduler should have queued its next run.
  if (nextRunAt !== null && nextRunAt - now < MAX_POLL_MS) return clampPoll(nextRunAt - now + 15_000);
  return MAX_POLL_MS;
}
