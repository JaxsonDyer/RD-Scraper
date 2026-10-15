"use client";

import React, { useEffect, useState } from "react";
import {
  RefreshCw, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";

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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 card-surface border border-border rounded-lg shadow-sm p-4 sm:p-5">
      <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-xs font-medium text-muted-foreground mt-0.5 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function AICard({ badge, title, children }: { badge: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-5 sm:p-6 flex flex-col gap-4">
      <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">{badge}</span>
      <div>
        <h3 className="font-semibold text-foreground mb-2">{title}</h3>
        {children}
      </div>
    </div>
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

  if (loading) return (
    <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm bg-muted/20 border-t border-border">
      <RefreshCw className="w-4 h-4 animate-spin" /> Loading history for @{username}...
    </div>
  );

  const hasProfile = history && history.profile_history.length > 0;
  const hasEngagement = history && history.engagement_history.length > 0;

  if (!hasProfile && !hasEngagement) return (
    <div className="p-6 text-sm text-muted-foreground bg-muted/20 border-t border-border">
      No historical data yet for @{username}.
    </div>
  );

  const profileData = (history?.profile_history ?? []).map(p => ({
    ...p,
    date: new Date(p.date_checked).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
  }));

  const engagementData = (history?.engagement_history ?? []).map(e => ({
    ...e,
    date: new Date(e.scrape_date).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
  }));

  return (
    <div className="bg-muted/20 border-t border-border">
      <div className="px-4 sm:px-6 pt-5 pb-6 space-y-8">

        {/* History sweep table */}
        {hasProfile && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Recorded Sweeps</p>
            <div className="border border-border rounded-md max-h-48 overflow-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-muted/60 border-b border-border">
                    <th className="py-2 px-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">Followers</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">Following</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">Total Posts</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history!.profile_history].reverse().map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="py-2 px-3 text-muted-foreground">{new Date(row.date_checked).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-medium text-foreground tabular-nums">{row.followers.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-foreground tabular-nums">{row.following.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-foreground tabular-nums">{row.total_posts.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Profile growth chart */}
        {hasProfile && profileData.length > 1 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Profile Growth Trend
            </p>
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Scrape-Day Engagement
            </p>
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

  useEffect(() => {
    Promise.all([
      fetch("/api/accounts").then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "Could not load accounts."); return data; }),
      fetch("/api/stats").then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "Could not load statistics."); return data; }),
    ])
      .then(([accountData, statsData]) => {
        setAccounts(accountData.accounts || []);
        setTotals(statsData.totals || null);
      })
      .catch(err => setDataError(err instanceof Error ? err.message : "Could not load analytics."))
      .finally(() => setLoading(false));

    const loadAiInsights = () => {
      fetch("/api/ai-insights")
        .then(r => r.json())
        .then(d => {
          if (!d.error) {
            setAiInsights(d);
            setAiLastRefreshed(d._meta?.last_refreshed || null);
          }
        })
        .catch(err => console.error("Failed to fetch AI insights", err))
        .finally(() => setAiLoading(false));
    };

    loadAiInsights();
    const aiPollInterval = setInterval(loadAiInsights, 10000);
    return () => clearInterval(aiPollInterval);
  }, []);

  const toggleAccount = (username: string) => {
    setExpandedAccount(prev => prev === username ? null : username);
  };

  return (
    <div className="space-y-10">
      {dataError && <p role="alert" className="text-sm text-destructive">{dataError} <button type="button" onClick={() => window.location.reload()} className="min-h-11 underline">Retry</button></p>}
      {/* Aggregate stats bar */}
      <section>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Loading...</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Posts Scraped" value={(totals?.total_posts ?? 0).toLocaleString()} />
            <StatCard label="Total Likes" value={(totals?.total_likes ?? 0).toLocaleString()} />
            <StatCard label="Total Comments" value={(totals?.total_comments ?? 0).toLocaleString()} />
            <StatCard label="Total Views" value={(totals?.total_views ?? 0).toLocaleString()} />
          </div>
        )}
      </section>

      {/* AI Summary */}
      <section>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Local Area Intelligence</h2>
          <div className="sm:ml-auto flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground">
              Last refreshed: {aiLastRefreshed ? new Date(aiLastRefreshed).toLocaleString() : "Never"}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <AICard badge="Community Pulse" title="Trending Themes This Week">
            {aiLoading ? (
               <div className="flex justify-center py-4"><RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" /></div>
            ) : aiInsights ? (
               <p className="text-sm text-muted-foreground leading-relaxed">{aiInsights.communityPulse}</p>
            ) : (
               <p className="text-sm text-destructive leading-relaxed">Failed to generate intelligence data.</p>
            )}
          </AICard>
          <AICard badge="Viral Anomaly" title="Breakout Post of the Week">
            {aiLoading ? (
               <div className="flex justify-center py-4"><RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" /></div>
            ) : aiInsights ? (
               <p className="text-sm text-muted-foreground leading-relaxed">{aiInsights.viralAnomaly}</p>
            ) : (
               <p className="text-sm text-destructive leading-relaxed">Failed to generate intelligence data.</p>
            )}
          </AICard>
          <AICard badge="Sector Momentum" title="Who Is Winning the Local Feed?">
            {aiLoading ? (
               <div className="flex justify-center py-4"><RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" /></div>
            ) : aiInsights ? (
               <ul className="space-y-3">
                 {aiInsights.sectorMomentum.map((item, i) => (
                   <li key={i} className="flex items-start gap-2 text-sm">
                     <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                     <span className="leading-relaxed text-muted-foreground">{item}</span>
                   </li>
                 ))}
               </ul>
            ) : (
               <p className="text-sm text-destructive leading-relaxed">Failed to generate intelligence data.</p>
            )}
          </AICard>
          <AICard badge="Underperformers" title="Posts That Fell Short">
            {aiLoading ? (
               <div className="flex justify-center py-4"><RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" /></div>
            ) : !aiInsights ? (
               <p className="text-sm text-destructive leading-relaxed">Failed to generate intelligence data.</p>
            ) : !aiInsights.underperformers ? (
               <p className="text-sm text-muted-foreground leading-relaxed">Generate insights again to see this section.</p>
            ) : aiInsights.underperformers.length === 0 ? (
               <p className="text-sm text-muted-foreground leading-relaxed">No posts fell well below their account&apos;s usual engagement.</p>
            ) : (
               <ul className="space-y-3">
                 {aiInsights.underperformers.map(item => (
                   <li key={item.shortcode} className="flex items-start gap-2 text-sm">
                     <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                     <span className="leading-relaxed text-muted-foreground">
                       <a href={`https://www.instagram.com/p/${encodeURIComponent(item.shortcode)}/`} target="_blank" rel="noopener noreferrer"
                         className="font-medium text-foreground underline underline-offset-2">@{item.username}</a>{" "}
                       {item.reason}
                     </span>
                   </li>
                 ))}
               </ul>
            )}
          </AICard>
        </div>
      </section>

      {/* Monitored Accounts + expandable charts */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Monitored Accounts</h2>
        <div className="bg-card border border-border rounded-lg overflow-x-auto shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading metrics...
            </div>
          ) : (
          <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="py-3 px-2 w-8" />
                  <th className="py-3 px-3 sm:px-4 text-left font-medium text-muted-foreground">Target</th>
                  <th className="hidden sm:table-cell py-3 px-3 sm:px-4 text-left font-medium text-muted-foreground">Type</th>
                  <th className="py-3 px-3 sm:px-4 text-left font-medium text-muted-foreground">Followers</th>
                  <th className="hidden md:table-cell py-3 px-3 sm:px-4 text-left font-medium text-muted-foreground">Following</th>
                  <th className="py-3 px-3 sm:px-4 text-left font-medium text-muted-foreground">Posts</th>
                  <th className="hidden md:table-cell py-3 px-3 sm:px-4 text-left font-medium text-muted-foreground">Last Checked</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((item) => (
                  <React.Fragment key={item.username}>
                    <tr
                      onClick={() => toggleAccount(item.username)}
                      className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-2 text-center text-muted-foreground">
                        {expandedAccount === item.username
                          ? <ChevronDown className="w-3.5 h-3.5 mx-auto" />
                          : <ChevronRight className="w-3.5 h-3.5 mx-auto" />
                        }
                      </td>
                      <td className="py-3 px-3 sm:px-4 font-medium text-foreground [overflow-wrap:anywhere]">@{item.username}</td>
                      <td className="hidden sm:table-cell py-3 px-3 sm:px-4">
                        {item.is_business ? (
                          <Badge>Business</Badge>
                        ) : (
                          <Badge variant="muted">Creator</Badge>
                        )}
                      </td>
                      <td className="py-3 px-3 sm:px-4 text-card-foreground tabular-nums">{item.followers?.toLocaleString() ?? "0"}</td>
                      <td className="hidden md:table-cell py-3 px-3 sm:px-4 text-card-foreground tabular-nums">{item.following?.toLocaleString() ?? "0"}</td>
                      <td className="py-3 px-3 sm:px-4 text-card-foreground tabular-nums">{item.total_posts?.toLocaleString() ?? "0"}</td>
                      <td className="hidden md:table-cell py-3 px-3 sm:px-4 text-muted-foreground text-xs whitespace-nowrap">
                        {item.date_checked ? new Date(item.date_checked).toDateString() : "Never"}
                      </td>
                    </tr>
                    {expandedAccount === item.username && (
                      <tr key={`${item.username}-charts`} className="border-b border-border">
                        <td colSpan={7} className="p-0">
                          {/* Size to the table rather than letting wide history content stretch it. */}
                          <div className="[contain:inline-size]">
                            <AccountCharts username={item.username} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Select any row to expand its historical trend charts.</p>
      </section>

    </div>
  );
}
