"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { HeaderActions } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { formatDate, formatShortDate } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Section } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { TextSkeleton } from "@/components/ui/skeleton";
import { LoadingState } from "@/components/ui/spinner";
import { Stat, StatSkeleton } from "@/components/ui/stat";
import { Table, TableFrame, TableHead, Td, Th, Tr } from "@/components/ui/table";

// ─── Types ────────────────────────────────────────────────────────────────

type AccountStats = {
  username: string;
  full_name: string;
  is_business: boolean;
  date_checked: string;
  followers: number;
  following: number;
  total_posts: number;
};

type AggTotals = {
  total_posts: number;
  total_likes: number;
  total_comments: number;
  total_views: number;
};

type ProfilePoint = {
  date_checked: string;
  followers: number;
  following: number;
  total_posts: number;
};

type EngagementPoint = {
  scrape_date: string;
  likes: number;
  comments: number;
  views: number;
  posts_scraped: number;
};

type AccountHistory = {
  profile_history: ProfilePoint[];
  engagement_history: EngagementPoint[];
};

type AiInsights = {
  communityPulse: string;
  viralAnomaly: string;
  sectorMomentum: string[];
  // Missing from summaries generated before underperformers were added.
  underperformers?: { shortcode: string; username: string; reason: string }[];
  _meta?: {
    last_refreshed: string | null;
  };
};

// ─── Sub-components ───────────────────────────────────────────────────────

function Monogram({ name }: { name: string }) {
  const words = name.replace(/^@/, "").split(/[\s._]+/).filter(Boolean);
  // First and last word: "Red Deer VIBIN" and "Red Deer Polytechnic" share a prefix but not an ending.
  const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.replace(/^@/, "").slice(0, 2)).toUpperCase();
  return (
    <span aria-hidden="true" className="hidden size-8 sm:flex shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-semibold tracking-wide text-foreground/80">
      {initials}
    </span>
  );
}

const CHART_THEME = {
  grid: "var(--border)",
  text: "var(--muted-foreground)",
  // Blue -> indigo progression: chart-5 for the primary/strongest series
  // in each chart, chart-3 for the balanced secondary, chart-1 for the
  // least-emphasized tertiary series.
  followers: "var(--chart-5)",
  following: "var(--chart-3)",
  total_posts: "var(--chart-1)",
  likes: "var(--chart-5)",
  comments: "var(--chart-3)",
  views: "var(--chart-1)",
};

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: "12px",
};

function AccountCharts({ username }: { username: string }) {
  const [history, setHistory] = useState<AccountHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/account-history/${encodeURIComponent(username)}`)
      .then(r => r.json())
      .then(d => setHistory(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return <LoadingState label={`Loading history for @${username}...`} className="justify-start border-t border-border p-6" />;

  const hasProfile = history && history.profile_history.length > 0;
  const hasEngagement = history && history.engagement_history.length > 0;

  if (!hasProfile && !hasEngagement) return (
    <p className="border-t border-border p-6 text-sm text-muted-foreground">No historical data yet for @{username}.</p>
  );

  const profileData = (history?.profile_history ?? []).map(p => ({
    ...p,
    date: formatShortDate(p.date_checked),
  }));

  const engagementData = (history?.engagement_history ?? []).map(e => ({
    ...e,
    date: formatShortDate(e.scrape_date),
  }));

  return (
    <div className="border-t border-border">
      <div className="space-y-8 px-4 pt-5 pb-6 sm:px-6">

        {/* History sweep table */}
        {hasProfile && (
          <div>
            <h4 className="mb-3 text-sm font-medium text-foreground">All recorded sweeps</h4>
            <TableFrame className="max-h-48 overflow-auto">
              <Table className="whitespace-nowrap">
                <TableHead sticky>
                  <Th>Date</Th>
                  <Th align="right">Followers</Th>
                  <Th align="right">Following</Th>
                  <Th align="right">Total posts</Th>
                </TableHead>
                <tbody>
                  {[...history!.profile_history].reverse().map((row, i) => (
                    <Tr key={i}>
                      <Td className="py-2 text-muted-foreground">{formatDate(row.date_checked)}</Td>
                      <Td align="right" className="py-2 tabular-nums">{row.followers.toLocaleString()}</Td>
                      <Td align="right" className="py-2 tabular-nums">{row.following.toLocaleString()}</Td>
                      <Td align="right" className="py-2 tabular-nums">{row.total_posts.toLocaleString()}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableFrame>
          </div>
        )}

        {/* Profile growth chart */}
        {hasProfile && profileData.length > 1 && (
          <div>
            <h4 className="mb-4 text-sm font-medium text-foreground">Profile growth trend</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={profileData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} axisLine={false} tickLine={false} width={52} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: CHART_THEME.text }} />
                <Line type="monotone" dataKey="followers" stroke={CHART_THEME.followers} strokeWidth={2} dot={false} name="Followers" />
                <Line type="monotone" dataKey="following" stroke={CHART_THEME.following} strokeWidth={2} dot={false} name="Following" />
                <Line type="monotone" dataKey="total_posts" stroke={CHART_THEME.total_posts} strokeWidth={2} dot={false} name="Total Posts" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Engagement chart */}
        {hasEngagement && engagementData.length > 0 && (
          <div>
            <h4 className="mb-4 text-sm font-medium text-foreground">Scrape-day engagement</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={engagementData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} axisLine={false} tickLine={false} width={52} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: CHART_THEME.text }} />
                <Line type="monotone" dataKey="likes" stroke={CHART_THEME.likes} strokeWidth={2} dot={false} name="Likes" />
                <Line type="monotone" dataKey="comments" stroke={CHART_THEME.comments} strokeWidth={2} dot={false} name="Comments" />
                <Line type="monotone" dataKey="views" stroke={CHART_THEME.views} strokeWidth={2} dot={false} name="Views" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const [accounts, setAccounts] = useState<AccountStats[]>([]);
  const [totals, setTotals] = useState<AggTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  
  const [dataError, setDataError] = useState<string | null>(null);
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiLastRefreshed, setAiLastRefreshed] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => Promise.all([
      fetch("/api/accounts").then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "Could not load accounts."); return data; }),
      fetch("/api/stats").then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "Could not load statistics."); return data; }),
    ])
      .then(([accountData, statsData]) => {
        setAccounts(accountData.accounts || []);
        setTotals(statsData.totals || null);
        setDataError(null);
      })
      .catch(err => setDataError(err instanceof Error ? err.message : "Could not load analytics."))
      .finally(() => setLoading(false)), []);

  const loadAiInsights = useCallback(() => fetch("/api/ai-insights")
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setAiInsights(d);
          setAiLastRefreshed(d._meta?.last_refreshed || null);
        }
      })
      .catch(err => console.error("Failed to fetch AI insights", err))
      .finally(() => setAiLoading(false)), []);

  useEffect(() => {
    void loadData();
    void loadAiInsights();
    const aiPollInterval = setInterval(loadAiInsights, 10000);
    return () => clearInterval(aiPollInterval);
  }, [loadData, loadAiInsights]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), loadAiInsights()]);
    setRefreshing(false);
  };

  // A column where every row says the same thing carries no information.
  const showType = new Set(accounts.map(account => account.is_business)).size > 1;

  const toggleAccount = (username: string) => {
    setExpandedAccount(prev => prev === username ? null : username);
  };

  const insightBody = (content: React.ReactNode) => aiLoading ? <TextSkeleton /> : aiInsights ? content : (
    <p className="text-sm leading-relaxed text-destructive">Failed to generate intelligence data.</p>
  );

  return (
    <div className="space-y-10">
      <HeaderActions>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Insights updated{" "}
          {aiLastRefreshed ? <RelativeTime value={aiLastRefreshed} /> : "never"}
        </p>
        <Button onPress={() => void refresh()} loading={refreshing} icon={<RefreshCw className="text-muted-foreground" aria-hidden="true" />}
          aria-label="Refresh" className="px-2.5 sm:px-3.5">
          <span className="hidden sm:inline">{refreshing ? "Refreshing" : "Refresh"}</span>
        </Button>
      </HeaderActions>

      {dataError && (
        <Notice tone="error" action={<Button size="sm" variant="ghost" onPress={() => window.location.reload()}>Retry</Button>}>
          {dataError}
        </Notice>
      )}

      <section aria-label="Totals" aria-busy={loading}>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {loading ? [0, 1, 2, 3].map(i => <StatSkeleton key={i} />) : (
            <>
              <Stat label="Posts scraped" value={(totals?.total_posts ?? 0).toLocaleString()} />
              <Stat label="Total likes" value={(totals?.total_likes ?? 0).toLocaleString()} />
              <Stat label="Total comments" value={(totals?.total_comments ?? 0).toLocaleString()} />
              <Stat label="Total views" value={(totals?.total_views ?? 0).toLocaleString()} />
            </>
          )}
        </div>
      </section>

      <Section title="AI Local Area Intelligence" id="insights-heading">
        {/* Two independent columns so each card keeps its natural height. */}
        <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-3 sm:gap-4">
            <Card as="article">
              <CardHeader title="Trending Themes This Week" className="mb-2.5" />
              {insightBody(<p className="text-sm leading-relaxed text-foreground/80">{aiInsights?.communityPulse}</p>)}
            </Card>
            <Card as="article">
              <CardHeader title="Breakout Post of the Week" className="mb-2.5" />
              {insightBody(<p className="text-sm leading-relaxed text-foreground/80">{aiInsights?.viralAnomaly}</p>)}
            </Card>
          </div>
          <div className="flex flex-col gap-3 sm:gap-4">
            <Card as="article">
              <CardHeader title="Who Is Winning the Local Feed?" className="mb-2.5" />
              {insightBody(
                <ul className="space-y-2.5">
                  {aiInsights?.sectorMomentum.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                      <span className="leading-relaxed text-foreground/80">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card as="article">
              <CardHeader title="Posts That Fell Short" className="mb-2.5" />
              {insightBody(!aiInsights?.underperformers ? (
                <p className="text-sm leading-relaxed text-muted-foreground">Generate insights again to see this section.</p>
              ) : aiInsights.underperformers.length === 0 ? (
                <p className="text-sm leading-relaxed text-muted-foreground">No posts fell well below their account&apos;s usual engagement.</p>
              ) : (
                <ul className="space-y-2.5">
                  {aiInsights.underperformers.map(item => (
                    <li key={item.shortcode} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                      <span className="leading-relaxed text-foreground/80">
                        <a href={`https://www.instagram.com/p/${encodeURIComponent(item.shortcode)}/`} target="_blank" rel="noopener noreferrer"
                          className="rounded-sm font-medium text-foreground underline decoration-brand/60 underline-offset-[3px] transition-colors hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">@{item.username}</a>{" "}
                        {item.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
            </Card>
          </div>
        </div>
      </Section>

      <Section title="Monitored Accounts" id="accounts-heading">
        <TableFrame>
          {loading ? <LoadingState label="Loading metrics..." /> : (
            <Table>
              <TableHead>
                <Th className="w-10 pl-1.5 pr-0 sm:w-11 sm:pl-2"><span className="sr-only">Expand</span></Th>
                {/* Account gets a set share; the number columns split what's left evenly. */}
                <Th className="px-2 sm:w-[36%] sm:px-3 lg:w-[28%]">Account</Th>
                {showType && <Th className="hidden sm:table-cell">Type</Th>}
                <Th align="right" className="w-22 px-2 sm:w-auto sm:px-3">Followers</Th>
                <Th align="right" className="hidden md:table-cell">Following</Th>
                <Th align="right" className="w-16 px-2 sm:w-auto sm:px-3">Posts</Th>
                <Th align="right" className="hidden pr-4 md:table-cell">Last checked</Th>
              </TableHead>
              <tbody>
                {accounts.map((item) => {
                  const expanded = expandedAccount === item.username;
                  return (
                  <React.Fragment key={item.username}>
                    <Tr interactive onClick={() => toggleAccount(item.username)} className={expanded ? "bg-muted/30" : undefined}>
                      <Td className="py-2 pl-1.5 pr-0 text-muted-foreground sm:pl-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onPress={() => toggleAccount(item.username)}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Hide" : "Show"} history for @${item.username}`}
                          className="size-8"
                        >
                          {expanded
                            ? <ChevronDown className="text-brand" aria-hidden="true" />
                            : <ChevronRight aria-hidden="true" />}
                        </Button>
                      </Td>
                      {/* max-w-0 lets the account column take the remaining width and truncate inside it. */}
                      <Td className="max-w-0 px-2 py-2.5 sm:px-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Monogram name={item.full_name || item.username} />
                          <div className="min-w-0">
                            <p className="truncate font-medium leading-5 text-foreground" title={item.full_name || `@${item.username}`}>
                              {item.full_name || `@${item.username}`}
                            </p>
                            {item.full_name && <p className="truncate text-xs leading-4 text-muted-foreground">@{item.username}</p>}
                          </div>
                        </div>
                      </Td>
                      {showType && (
                        <Td className="hidden sm:table-cell">
                          {item.is_business ? <Badge>Business</Badge> : <Badge variant="muted">Creator</Badge>}
                        </Td>
                      )}
                      <Td align="right" className="px-2 tabular-nums sm:px-3">{item.followers?.toLocaleString() ?? "0"}</Td>
                      <Td align="right" className="hidden tabular-nums md:table-cell">{item.following?.toLocaleString() ?? "0"}</Td>
                      <Td align="right" className="px-2 tabular-nums sm:px-3">{item.total_posts?.toLocaleString() ?? "0"}</Td>
                      <Td align="right" className="hidden pr-4 text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                        {item.date_checked ? <RelativeTime value={item.date_checked} className="inline-block first-letter:uppercase" /> : "Never"}
                      </Td>
                    </Tr>
                    {expanded && (
                      <tr className="border-b border-border last:border-0">
                        <td colSpan={showType ? 7 : 6} className="p-0">
                          {/* Size to the table rather than letting wide history content stretch it. */}
                          <div className="[contain:inline-size]">
                            <AccountCharts username={item.username} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </Table>
          )}
        </TableFrame>
        <p className="mt-2 text-xs text-muted-foreground">Select any row to expand its historical trend charts.</p>
      </Section>
    </div>
  );
}
