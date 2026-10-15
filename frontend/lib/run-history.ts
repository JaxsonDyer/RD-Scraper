export type RunResult = {
  accounts_scraped?: number;
  accounts?: { username: string; status: string }[];
  username?: string;
  posts_collected?: number;
  shortcode?: string;
} | null;

export type RunSummary = { kind: string; status: string; error: string | null; result?: RunResult };

export type RunStatus = {
  label: "Success" | "Warning" | "Failed" | "Running" | "Queued";
  variant: "success" | "warning" | "destructive" | "muted";
};

/** Success, Failed, or Warning for a scrape that collected some accounts but not all. */
export function getRunStatus(run: RunSummary): RunStatus {
  if (run.status === "queued") return { label: "Queued", variant: "muted" };
  if (run.status === "running") return { label: "Running", variant: "muted" };
  if (run.status === "error" || run.error) {
    return (run.result?.accounts_scraped ?? 0) > 0
      ? { label: "Warning", variant: "warning" }
      : { label: "Failed", variant: "destructive" };
  }
  return { label: "Success", variant: "success" };
}

const TASKS: Record<string, string> = {
  daily_scrape: "Scrape",
  deep_scrape: "Deep scrape",
  insights: "AI insights",
  rescrape: "Post refresh",
  analyze: "Post count check",
};

export function getRunTask(kind: string) {
  return TASKS[kind] ?? kind.replaceAll("_", " ");
}

/** The one detail worth a column for each task, or null when there is none. */
export function getRunDetail(run: RunSummary): string | null {
  const result = run.result;
  if (run.kind === "daily_scrape" && Array.isArray(result?.accounts)) {
    const total = result.accounts.length;
    return `${result.accounts_scraped ?? 0} of ${total} ${total === 1 ? "account" : "accounts"}`;
  }
  if (run.kind === "deep_scrape" && result?.username) {
    return `@${result.username} · ${(result.posts_collected ?? 0).toLocaleString()} posts`;
  }
  if (run.kind === "rescrape" && result?.shortcode) return `Post ${result.shortcode}`;
  return null;
}

/** "45s", "1m 39s", "1h 5m" */
export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function getRunErrorSummary(error: string | null): string {
  if (!error?.trim()) return "Run failed";
  const message = error.trim().replace(/\s+/g, " ");
  const accounts = message.match(/^(\d+) account\(s\) could not be scraped\./);
  if (accounts) {
    const count = Number(accounts[1]);
    return `${count} ${count === 1 ? "account" : "accounts"} couldn’t be scraped`;
  }
  const providerError = message.match(/^OpenRouter HTTP \d+:\s*([^.!?]+)[.!?]?/i);
  if (providerError) return `OpenRouter: ${providerError[1].trim()}`;
  const firstSentence = message.split(/\.\s+/)[0];
  return firstSentence.length > 80 ? `${firstSentence.slice(0, 79).trimEnd()}…` : firstSentence;
}
