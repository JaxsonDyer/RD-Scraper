"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { formatDate, formatDateTime } from "@/lib/format-date";
import {
  Heart, MessageCircle, Play, Image as ImageIcon, Video,
  ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, CheckCircle, XCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { queueJob, waitForJob } from "@/lib/jobs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardSection } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { SelectField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { LoadingState } from "@/components/ui/spinner";
import { Stat } from "@/components/ui/stat";
import { focusRing, tableFrameClass } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

type Post = {
  shortcode: string;
  caption: string;
  likes: number;
  comments: number;
  views: number;
  is_video: boolean;
  posted_timestamp: string;
  scraped_timestamp: string;
  username: string;
};

type UserRecord = {
  username: string;
  internal_ig_id: string;
};

export default function PostsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  // Overview's momentum leaderboard links here with ?username= to open one account's posts.
  const { username } = use(searchParams);
  const { isAdmin } = useAuth();
  const [pageIndex, setPageIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState<string>(typeof username === "string" ? username : "");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [rescrapeSyncing, setRescrapeSyncing] = useState<Record<string, "syncing" | "done" | "failed" | null>>({});
  const detailPanel = useRef<HTMLElement>(null);

  const fetchPosts = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;
    setLoading(true);
    setError(null);
    try {
      const url = filterUser
        ? `/api/posts?username=${encodeURIComponent(filterUser)}`
        : `/api/posts`;
      const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}page=${pageIndex}`, { signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load posts.");
      setHasMore(data.has_more === true);
      setPosts(data.posts || []);
      setSelectedPost(current => current ? data.posts.find((p: Post) => p.shortcode === current.shortcode) ?? null : null);
      setUsers(data.users || []);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Could not load posts.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filterUser, pageIndex]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => fetchPosts(controller.signal));
    return () => controller.abort();
  }, [fetchPosts]);

  const rescrapePost = async (shortcode: string) => {
    setRescrapeSyncing(prev => ({ ...prev, [shortcode]: "syncing" }));
    try {
      const id = await queueJob("/api/rescrape-post", { shortcode });
      await waitForJob(id);
      setRescrapeSyncing(prev => ({ ...prev, [shortcode]: "done" }));
      await fetchPosts();
      setTimeout(() => setRescrapeSyncing(prev => ({ ...prev, [shortcode]: null })), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh post.");
      setRescrapeSyncing(prev => ({ ...prev, [shortcode]: "failed" }));
    }
  };

  const selectPost = (post: Post) => {
    setSelectedPost(post);
    // Below lg the detail replaces the list, so bring its top into view.
    requestAnimationFrame(() => {
      if (!window.matchMedia("(min-width: 64rem)").matches) detailPanel.current?.scrollIntoView({ block: "start" });
    });
  };

  const rescrapeState = selectedPost ? rescrapeSyncing[selectedPost.shortcode] : null;

  const rescrapeLabel = rescrapeState === "syncing" ? "Rescraping..." : rescrapeState === "done" ? "Updated" : rescrapeState === "failed" ? "Failed, retry" : "Rescrape";
  const rescrapeIcon = rescrapeState === "done" ? <CheckCircle className="text-emerald-400" aria-hidden="true" />
    : rescrapeState === "failed" ? <XCircle className="text-destructive" aria-hidden="true" />
    : <RefreshCw className="text-muted-foreground" aria-hidden="true" />;

  return (
    <div className="space-y-6">
      {/* Account filter and pagination */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SelectField
          label="Account"
          value={filterUser}
          onChange={event => { setPageIndex(0); setFilterUser(event.target.value); }}
          className="w-full sm:w-64"
        >
          <option value="">All accounts</option>
          {users.map(u => <option key={u.username} value={u.username}>@{u.username}</option>)}
        </SelectField>
        <div className="flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto sm:justify-start">
          <Button isDisabled={pageIndex === 0 || loading} onPress={() => setPageIndex(page => page - 1)} icon={<ChevronLeft aria-hidden="true" />}>Previous</Button>
          <span className="text-sm text-muted-foreground tabular-nums">Page {pageIndex + 1}</span>
          <Button isDisabled={!hasMore || loading} onPress={() => setPageIndex(page => page + 1)} className="flex-row-reverse" icon={<ChevronRight aria-hidden="true" />}>Next</Button>
        </div>
      </div>

      {error && (
        <Notice tone="error" action={<Button size="sm" variant="ghost" onPress={() => void fetchPosts()}>Retry</Button>}>{error}</Notice>
      )}

      {/* Two-panel layout */}
      <div className="flex flex-col gap-4 lg:h-[calc(100dvh-16rem)] lg:min-h-[500px] lg:flex-row">

        {/* List: a table in all but markup, so it wears the table frame. */}
        <div className={cn(tableFrameClass, "w-full shrink-0 flex-col overflow-hidden lg:w-80", selectedPost ? "hidden lg:flex" : "flex")}>
          <div className="grid grid-cols-[1fr_2.75rem_2.75rem_3rem] items-center gap-x-2 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>Account</span>
            <span className="flex justify-end"><Heart aria-label="Likes" className="size-3.5" /></span>
            <span className="flex justify-end"><MessageCircle aria-label="Comments" className="size-3.5" /></span>
            <span className="flex justify-end"><Play aria-label="Views" className="size-3.5" /></span>
          </div>

          {loading ? <LoadingState label="Loading posts..." className="flex-1" /> : posts.length === 0 ? (
            <p className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">No posts found.</p>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {posts.map((post) => {
                const selected = selectedPost?.shortcode === post.shortcode;
                return (
                <button
                  key={post.shortcode}
                  type="button"
                  onClick={() => selectPost(post)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "grid w-full grid-cols-[1fr_2.75rem_2.75rem_3rem] items-center gap-x-2 border-b border-border px-4 py-3 text-left transition-colors last:border-0 focus-visible:ring-inset",
                    focusRing,
                    selected ? "bg-brand/12" : "hover:bg-muted/40",
                  )}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">@{post.username}</span>
                      {post.is_video
                        ? <Video aria-label="Video" className="size-3.5 shrink-0 text-muted-foreground" />
                        : <ImageIcon aria-label="Photo" className="size-3.5 shrink-0 text-muted-foreground" />}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {post.posted_timestamp ? formatDate(post.posted_timestamp) : "Not recorded"}
                    </span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground tabular-nums">{post.likes?.toLocaleString() ?? "0"}</span>
                  <span className="text-right text-xs text-muted-foreground tabular-nums">{post.comments?.toLocaleString() ?? "0"}</span>
                  <span className="text-right text-xs text-muted-foreground tabular-nums">{post.views ? post.views.toLocaleString() : "—"}</span>
                </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail */}
        <Card ref={detailPanel} className={cn("min-h-96 min-w-0 flex-1 scroll-mt-3 flex-col overflow-y-auto", selectedPost ? "flex" : "hidden lg:flex")}>
          {!selectedPost ? (
            <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">Select a post from the list to view its details.</p>
          ) : (
            <div className="space-y-6">
              <Button variant="ghost" size="sm" onPress={() => setSelectedPost(null)} icon={<ArrowLeft aria-hidden="true" />} className="-ml-2.5 lg:hidden">
                Back to posts
              </Button>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="flex min-w-0 items-center gap-3">
                  <h2 className="text-base font-semibold text-foreground [overflow-wrap:anywhere]">@{selectedPost.username}</h2>
                  <Badge variant="muted">
                    {selectedPost.is_video ? <Video aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
                    {selectedPost.is_video ? "Video" : "Photo"}
                  </Badge>
                </div>
                {isAdmin && (
                  <Button loading={rescrapeState === "syncing"} onPress={() => rescrapePost(selectedPost.shortcode)} icon={rescrapeIcon}>
                    {rescrapeLabel}
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Stat label="Likes" value={(selectedPost.likes ?? 0).toLocaleString()} className="bg-transparent p-0" />
                <Stat label="Comments" value={(selectedPost.comments ?? 0).toLocaleString()} className="bg-transparent p-0" />
                <Stat label="Views" value={selectedPost.views ? selectedPost.views.toLocaleString() : "—"} className="bg-transparent p-0" />
              </div>

              <DetailList items={[
                { label: "Posted", value: selectedPost.posted_timestamp ? formatDate(selectedPost.posted_timestamp) : "Not recorded" },
                { label: "Scraped", value: selectedPost.scraped_timestamp ? formatDateTime(selectedPost.scraped_timestamp) : "Legacy record" },
                { label: "Post ID", value: selectedPost.shortcode, mono: true },
              ]} className="sm:grid-cols-3" />

              <CardSection title="Caption">
                {selectedPost.caption ? (
                  <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{selectedPost.caption}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No caption.</p>
                )}
              </CardSection>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
