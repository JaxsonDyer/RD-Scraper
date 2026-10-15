"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { focusRing, tableFrameClass } from "@/components/ui/styles";
import { Monogram } from "@/components/monogram";
import { RelativeTime } from "@/components/relative-time";
import { MOMENTUM_SETTINGS, type Momentum } from "@/lib/momentum";
import { cn } from "@/lib/utils";

export type MomentumBoard = {
  generated_at: string;
  recent_days: number;
  baseline_days: number;
  accounts: {
    username: string;
    full_name: string | null;
    rank: number | null;
    momentum: Momentum;
    recent_posts: {
      shortcode: string;
      posted_timestamp: string;
      likes: number;
      comments: number;
      interactions: number;
      scorable: boolean;
      caption: string;
    }[];
  }[];
};

type Entry = MomentumBoard["accounts"][number];

const SIGNAL = {
  rising: { label: "Rising", Icon: ArrowUpRight, tone: "text-brand" },
  steady: { label: "Steady", Icon: ArrowRight, tone: "text-foreground/80" },
  fading: { label: "Fading", Icon: ArrowDownRight, tone: "text-muted-foreground" },
} as const;

function percentVsUsual(ratio: number) {
  const change = Math.round((ratio - 1) * 100);
  return change === 0 ? "Same as usual" : `${change > 0 ? "+" : "−"}${Math.abs(change)}% vs usual`;
}

function SignalCell({ momentum, recentDays }: { momentum: Momentum; recentDays: number }) {
  if (momentum.status === "ranked") {
    const { label, Icon, tone } = SIGNAL[momentum.signal];
    return (
      <div className="min-w-0">
        <p className={cn("flex items-center gap-1 text-sm font-medium", tone)}>
          <Icon aria-hidden="true" className="size-4 shrink-0" />{label}
        </p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">{percentVsUsual(momentum.ratio)}</p>
      </div>
    );
  }
  const [badge, note] = momentum.status === "new" ? [<Badge key="b">New</Badge>, "Just started posting"]
    : momentum.status === "quiet" ? [<Badge key="b" variant="muted">Quiet</Badge>, `No posts in ${recentDays} days`]
    : [<Badge key="b" variant="muted">Not enough data</Badge>, momentum.reason];
  return (
    <div className="min-w-0">
      {badge}
      <p className="mt-0.5 truncate text-xs text-muted-foreground" title={note}>{note}</p>
    </div>
  );
}

function KeyNumber({ entry }: { entry: Entry }) {
  const { momentum } = entry;
  if (momentum.status === "quiet") {
    return (
      <div className="hidden text-right sm:block">
        <p className="text-sm text-muted-foreground">{momentum.lastPostedAt ? <RelativeTime value={momentum.lastPostedAt} /> : "None in range"}</p>
        <p className="text-xs text-muted-foreground">last post</p>
      </div>
    );
  }
  return (
    <div className="hidden text-right sm:block">
      <p className="text-sm font-medium text-foreground tabular-nums">{momentum.recentTypical === null ? "—" : Math.round(momentum.recentTypical).toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{momentum.recentTypical === null ? "still collecting" : "median per post"}</p>
    </div>
  );
}

function Details({ entry, board }: { entry: Entry; board: MomentumBoard }) {
  const { momentum } = entry;
  const usual = momentum.status === "ranked" ? momentum.usualTypical : null;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  return (
    <div className="space-y-4 border-t border-border px-4 pb-5 pt-4 sm:pl-[4.75rem] sm:pr-6">
      <p className="max-w-prose text-sm text-muted-foreground">
        {momentum.status === "ranked" ? (
          <>A typical post in the last {board.recent_days} days drew <span className="font-medium text-foreground tabular-nums">{Math.round(momentum.recentTypical).toLocaleString()}</span> likes and comments
            ({plural(momentum.recentCount, "post")}), against <span className="font-medium text-foreground tabular-nums">{Math.round(momentum.usualTypical).toLocaleString()}</span> usually
            ({plural(momentum.usualCount, "post")} from the {board.recent_days}–{board.baseline_days} days before).</>
        ) : momentum.status === "new" ? (
          <>All {plural(momentum.postCount, "post")} on this account are from the last month, so there&apos;s no usual level to compare with yet.</>
        ) : momentum.status === "quiet" ? (
          <>No posts in the last {board.recent_days} days, so there&apos;s nothing recent to judge.</>
        ) : (
          <>Not enough data yet ({momentum.reason.toLowerCase()}). Judging momentum fairly needs at least 2 posts from the last {board.recent_days} days and 3 from the {board.recent_days}–{board.baseline_days} days before, each with counts captured a day or more after posting.</>
        )}
      </p>

      {entry.recent_posts.length > 0 && (
        <ul className="divide-y divide-border">
          {entry.recent_posts.map(post => (
            <li key={post.shortcode} className="flex items-center gap-3 py-2.5 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground/80">{post.caption || "No caption"}</p>
                <p className="text-xs text-muted-foreground"><RelativeTime value={post.posted_timestamp} className="inline-block first-letter:uppercase" /></p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-foreground tabular-nums">{post.interactions.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {!post.scorable ? "Still collecting" : usual ? `${(post.interactions / Math.max(usual, 1)).toFixed(1)}× usual` : "likes + comments"}
                </p>
              </div>
              <a href={`https://www.instagram.com/p/${encodeURIComponent(post.shortcode)}/`} target="_blank" rel="noopener noreferrer"
                aria-label="Open post on Instagram" className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground", focusRing)}>
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <Link href={`/posts?username=${encodeURIComponent(entry.username)}`}
        className={cn("inline-flex items-center gap-1 rounded-sm text-sm font-medium text-foreground underline decoration-brand/60 underline-offset-[3px] hover:decoration-brand", focusRing)}>
        All posts by @{entry.username} <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </div>
  );
}

function Row({ entry, board, expanded, onToggle }: { entry: Entry; board: MomentumBoard; expanded: boolean; onToggle: () => void }) {
  const name = entry.full_name || `@${entry.username}`;
  const panelId = `momentum-${entry.username}`;
  return (
    <li className="border-b border-border last:border-0">
      <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={panelId}
        className={cn("grid w-full grid-cols-[1.25rem_minmax(0,1fr)_7.5rem_1rem] items-center gap-x-2.5 px-4 py-3 text-left transition-colors focus-visible:ring-inset sm:grid-cols-[1.75rem_minmax(0,1fr)_10rem_7.5rem_1rem] sm:gap-x-3 sm:px-5",
          focusRing, expanded ? "bg-muted/30" : "hover:bg-muted/40")}>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {entry.rank ?? <span className="sr-only">Unranked</span>}
        </span>
        <span className="flex min-w-0 items-center gap-3">
          <Monogram name={name} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium leading-5 text-foreground">{name}</span>
            {entry.full_name && <span className="block truncate text-xs leading-4 text-muted-foreground">@{entry.username}</span>}
          </span>
        </span>
        <SignalCell momentum={entry.momentum} recentDays={board.recent_days} />
        <KeyNumber entry={entry} />
        {expanded ? <ChevronDown aria-hidden="true" className="size-4 text-brand" /> : <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />}
      </button>
      {expanded && <div id={panelId}><Details entry={entry} board={board} /></div>}
    </li>
  );
}

export function MomentumLeaderboard({ board, loading }: { board: MomentumBoard | null; loading: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const ranked = board?.accounts.filter(entry => entry.rank !== null) ?? [];
  const unranked = board?.accounts.filter(entry => entry.rank === null) ?? [];
  const toggle = (username: string) => setExpanded(current => current === username ? null : username);
  const rows = (entries: Entry[]) => entries.map(entry => (
    <Row key={entry.username} entry={entry} board={board!} expanded={expanded === entry.username} onToggle={() => toggle(entry.username)} />
  ));

  return (
    <Section title="Momentum" id="momentum-heading">
      <div className={tableFrameClass} aria-busy={loading}>
        {loading ? (
          <div className="divide-y divide-border" aria-hidden="true">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="ml-auto h-3.5 w-16" />
              </div>
            ))}
          </div>
        ) : !board || board.accounts.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No accounts yet. Momentum appears once accounts have been scraped.</p>
        ) : (
          <>
            <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_7.5rem_1rem] gap-x-2.5 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid-cols-[1.75rem_minmax(0,1fr)_10rem_7.5rem_1rem] sm:gap-x-3 sm:px-5">
              <span>#</span><span>Account</span><span>Trend</span><span className="hidden text-right sm:block">Likes + comments</span><span />
            </div>
            {ranked.length === 0 && (
              <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground sm:px-5">
                Not enough history to rank anyone yet. An account needs at least 2 recent posts and 3 earlier ones to compare with.
              </p>
            )}
            {ranked.length > 0 && <ol aria-label="Ranked accounts">{rows(ranked)}</ol>}
            {unranked.length > 0 && (
              <>
                <p className={cn("border-b border-border bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground sm:px-5", ranked.length > 0 && "border-t")}>
                  Not ranked
                </p>
                <ul aria-label="Accounts not ranked">{rows(unranked)}</ul>
              </>
            )}
          </>
        )}
      </div>
      {board && board.accounts.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Likes + comments</span> is the median for an account&apos;s posts in the last {board.recent_days} days.{" "}
          <span className="font-medium text-foreground/80">Trend</span> compares that with the account&apos;s own median post over the {board.recent_days}–{board.baseline_days} days before:
          rising is +{Math.round((MOMENTUM_SETTINGS.risingAt - 1) * 100)}% or more, fading is −{Math.round((1 - MOMENTUM_SETTINGS.fadingAt) * 100)}% or less. Posts under a day old are still collecting and aren&apos;t counted. Select an account to see its recent posts.
        </p>
      )}
    </Section>
  );
}
