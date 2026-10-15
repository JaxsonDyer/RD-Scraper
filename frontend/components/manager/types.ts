import type { RunResult } from "@/lib/run-history";

export type Config = {
  target_accounts: string[];
  daily_run_time: string;
  scheduler_enabled: boolean;
  post_lookback_days: number;
  incremental_post_limit: number;
  llm_config: {
    lookback_days: number;
    max_posts: number;
    model: string;
  };
};

/**
 * Saves part of the configuration. The API replaces the whole document, so the change is
 * computed from the latest saved settings when the save runs, never from a stale copy.
 * Rejects with a readable message.
 */
export type SaveConfig = (change: (saved: Config) => Partial<Config>) => Promise<void>;

/** A row of Overview's account list: every account that has been scraped at least once. */
export type ScrapedAccount = {
  username: string;
  full_name: string | null;
  date_checked: string | null;
  total_posts: number | null;
};

export type Run = {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  result: RunResult;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type AiStatus = {
  state: "idle" | "queued" | "running" | "success" | "error";
  configured_model: string | null;
  active_model: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_refreshed: string | null;
  error: string | null;
};

// Prefer the API's explanation (e.g. "That job is already queued or running.") over a bare status code.
export async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return new Error(typeof data?.error === "string" ? data.error : `${fallback} (HTTP ${response.status})`);
}

export const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
