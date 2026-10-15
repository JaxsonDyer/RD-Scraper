// Momentum: is an account getting more or less attention per post than it usually does?
//
// Each account is compared only with itself, so a small account doubling its usual
// engagement outranks a large account having an ordinary week. Everything tunable lives
// in MOMENTUM_SETTINGS; scoreMomentum() is the one function to change or replace.

export const MOMENTUM_SETTINGS = {
  /** "Right now": posts from this many days. */
  recentDays: 14,
  /** "Usual": posts older than the recent window, back to this many days. */
  baselineDays: 90,
  /** Counts captured sooner than this after posting are still climbing, so they aren't scored. */
  minCaptureAgeDays: 1,
  /** Fewer scored posts than this and the comparison is too noisy to rank. */
  minRecentPosts: 2,
  minBaselinePosts: 3,
  /** Recent typical post vs usual typical post. */
  risingAt: 1.25,
  fadingAt: 0.8,
  /** An account whose every post is from this window has only just started posting. */
  newWithinDays: 30,
};
export type MomentumSettings = typeof MOMENTUM_SETTINGS;

export type MomentumPost = {
  shortcode: string;
  username: string;
  likes: number | null;
  comments: number | null;
  posted_timestamp: string;
  scraped_timestamp: string;
};

export type MomentumAccount = {
  username: string;
  full_name: string | null;
  /** The account's post count on Instagram at its last scrape. */
  total_posts: number | null;
};

export type Momentum =
  | { status: "ranked"; signal: "rising" | "steady" | "fading"; ratio: number; recentTypical: number; usualTypical: number; recentCount: number; usualCount: number }
  | { status: "new"; recentTypical: number | null; postCount: number }
  | { status: "quiet"; lastPostedAt: string | null }
  | { status: "insufficient"; reason: string; recentTypical: number | null };

const DAY = 86_400_000;

/** Likes plus comments: what the leaderboard calls interactions. */
export function interactions(post: Pick<MomentumPost, "likes" | "comments">) {
  return (post.likes ?? 0) + (post.comments ?? 0);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Whether a post's counts were captured late enough after posting to compare fairly. */
export function isScorable(post: MomentumPost, settings: MomentumSettings = MOMENTUM_SETTINGS) {
  return Date.parse(post.scraped_timestamp) - Date.parse(post.posted_timestamp) >= settings.minCaptureAgeDays * DAY;
}

/** posts: this account's posts from the last `baselineDays`, any order. */
export function scoreMomentum(account: MomentumAccount, posts: MomentumPost[], now: number,
  settings: MomentumSettings = MOMENTUM_SETTINGS): Momentum {
  const age = (post: MomentumPost) => now - Date.parse(post.posted_timestamp);
  const recent = posts.filter(post => age(post) <= settings.recentDays * DAY);
  const usual = posts.filter(post => age(post) > settings.recentDays * DAY && age(post) <= settings.baselineDays * DAY);
  const recentScored = recent.filter(post => isScorable(post, settings)).map(interactions);
  const usualScored = usual.filter(post => isScorable(post, settings)).map(interactions);
  const recentTypical = recentScored.length ? median(recentScored) : null;

  if (recent.length === 0) {
    const last = posts.reduce<string | null>((latest, post) => !latest || post.posted_timestamp > latest ? post.posted_timestamp : latest, null);
    return { status: "quiet", lastPostedAt: last };
  }
  // Every post the account has ever made is recent: there is no "usual" to compare against.
  const sinceNew = posts.filter(post => age(post) <= settings.newWithinDays * DAY).length;
  if (account.total_posts !== null && account.total_posts > 0 && account.total_posts <= sinceNew) {
    return { status: "new", recentTypical, postCount: account.total_posts };
  }
  if (usualScored.length < settings.minBaselinePosts) {
    return { status: "insufficient", recentTypical, reason: usualScored.length
      ? `Only ${usualScored.length} earlier ${usualScored.length === 1 ? "post" : "posts"}`
      : "No earlier posts yet" };
  }
  if (recentScored.length < settings.minRecentPosts) {
    const settling = recent.length - recentScored.length;
    return { status: "insufficient", recentTypical, reason: settling && !recentScored.length
      ? "Recent posts too new"
      : `Only ${recent.length} recent ${recent.length === 1 ? "post" : "posts"}` };
  }

  const usualTypical = median(usualScored);
  const ratio = recentTypical! / Math.max(usualTypical, 1);
  return {
    status: "ranked",
    signal: ratio >= settings.risingAt ? "rising" : ratio <= settings.fadingAt ? "fading" : "steady",
    ratio, recentTypical: recentTypical!, usualTypical, recentCount: recentScored.length, usualCount: usualScored.length,
  };
}

const UNRANKED_ORDER = { new: 0, insufficient: 1, quiet: 2 };

/** Ranked accounts by momentum, highest first; then New, not-enough-data and Quiet accounts, unranked. */
export function rankMomentum<A extends MomentumAccount>(accounts: A[], posts: MomentumPost[], now: number,
  settings: MomentumSettings = MOMENTUM_SETTINGS) {
  const byAccount = new Map<string, MomentumPost[]>();
  for (const post of posts) byAccount.set(post.username, [...(byAccount.get(post.username) ?? []), post]);
  const scored = accounts.map(account => ({ account, momentum: scoreMomentum(account, byAccount.get(account.username) ?? [], now, settings) }));
  const ranked = scored
    .filter((entry): entry is typeof entry & { momentum: Extract<Momentum, { status: "ranked" }> } => entry.momentum.status === "ranked")
    .sort((a, b) => b.momentum.ratio - a.momentum.ratio)
    .map((entry, index) => ({ ...entry, rank: (index + 1) as number | null }));
  const unranked = scored
    .filter(entry => entry.momentum.status !== "ranked")
    .sort((a, b) => UNRANKED_ORDER[a.momentum.status as keyof typeof UNRANKED_ORDER] - UNRANKED_ORDER[b.momentum.status as keyof typeof UNRANKED_ORDER]
      || a.account.username.localeCompare(b.account.username))
    .map(entry => ({ ...entry, rank: null }));
  return [...ranked, ...unranked];
}
