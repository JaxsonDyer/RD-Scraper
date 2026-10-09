"use client";

import { useCallback, useEffect, useState } from "react";
import { Select, Label, Button, SelectValue, Popover, ListBox, ListBoxItem } from "react-aria-components";
import {
  Heart, MessageCircle, Play, Image as ImageIcon, Video,
  ChevronDown, RefreshCw, CheckCircle, XCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { queueJob, waitForJob } from "@/lib/jobs";
import { Badge } from "@/components/ui/badge";

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

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[60px]">
      <span className="text-base font-semibold text-foreground tabular-nums">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function PostsPage() {
  const { isAdmin } = useAuth();
  const [pageIndex, setPageIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState<string>("");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [rescrapeSyncing, setRescrapeSyncing] = useState<Record<string, "syncing" | "done" | "failed" | null>>({});

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

  const rescrapeState = selectedPost ? rescrapeSyncing[selectedPost.shortcode] : null;

  return (
    <div className="space-y-6 h-full">
      {/* Account filter and pagination */}
      <div className="pb-2 flex flex-wrap justify-between items-end gap-4">
        <Select
          selectedKey={filterUser}
          onSelectionChange={(k) => { setPageIndex(0); setFilterUser(k as string); }}
          className="flex flex-col gap-1 w-56"
        >
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Account</Label>
          <Button className="flex min-h-11 items-center justify-between w-full px-3 py-2 bg-background border border-input rounded-md text-sm text-foreground outline-none focus:ring-1 focus:ring-ring shadow-sm">
            <SelectValue className="truncate">
              {({ defaultChildren, isPlaceholder }) => (isPlaceholder ? "All Accounts" : defaultChildren)}
            </SelectValue>
            <ChevronDown className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
          </Button>
          <Popover className="w-[var(--trigger-width)] bg-popover border border-border rounded-md shadow-lg mt-1 z-50">
            <ListBox className="outline-none p-1 max-h-60 overflow-y-auto w-full">
              <ListBoxItem id="" className="px-3 py-2 cursor-pointer rounded-sm text-sm text-popover-foreground hover:bg-accent outline-none">
                All Accounts
              </ListBoxItem>
              {users.map((u) => (
                <ListBoxItem key={u.username} id={u.username} className="px-3 py-2 cursor-pointer rounded-sm text-sm text-popover-foreground hover:bg-accent outline-none">
                  @{u.username}
                </ListBoxItem>
              ))}
            </ListBox>
          </Popover>
        </Select>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <button type="button" disabled={pageIndex === 0 || loading} onClick={() => setPageIndex(page => page - 1)} className="min-h-11 rounded-md border border-input px-3 disabled:opacity-40">Previous</button>
          <span className="text-muted-foreground">Page {pageIndex + 1}</span>
          <button type="button" disabled={!hasMore || loading} onClick={() => setPageIndex(page => page + 1)} className="min-h-11 rounded-md border border-input px-3 disabled:opacity-40">Next</button>
        </div>
      </div>

      {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><span>{error}</span><button type="button" onClick={() => void fetchPosts()} className="min-h-11 underline">Retry</button></div>}
      {/* Two-panel layout */}
      <div className="flex flex-col gap-4 lg:h-[calc(100vh-280px)] lg:min-h-[500px] lg:flex-row">

        {/* LEFT: Compact list */}
        <div className="max-h-96 w-full flex-shrink-0 bg-card lg:max-h-none lg:w-80 border border-border rounded-lg shadow-sm overflow-hidden flex flex-col">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-2.5 bg-muted/50 border-b border-border">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Account</span>
            <Heart className="w-3.5 h-3.5 text-muted-foreground" />
            <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
            <Play className="w-3.5 h-3.5 text-muted-foreground w-10" />
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : posts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">No posts found.</div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {posts.map((post) => (
                <button
                  key={post.shortcode}
                  onClick={() => setSelectedPost(post)}
                  className={`w-full text-left px-4 py-3 border-b border-border transition-colors outline-none last:border-0 ${
                    selectedPost?.shortcode === post.shortcode
                      ? "bg-primary/10 border-l-2 border-l-primary"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-foreground truncate">@{post.username}</span>
                        {post.is_video
                          ? <Video className="w-3 h-3 shrink-0 text-destructive" />
                          : <ImageIcon aria-hidden="true" className="w-3 h-3 shrink-0 text-primary" />
                        }
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {post.posted_timestamp ? new Date(post.posted_timestamp).toLocaleDateString() : "Not recorded"}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums text-right">{post.likes?.toLocaleString() ?? "0"}</span>
                    <span className="text-xs text-muted-foreground tabular-nums text-right">{post.comments?.toLocaleString() ?? "0"}</span>
                    <span className="w-10 text-xs text-muted-foreground tabular-nums text-right">{post.views ? post.views.toLocaleString() : "N/A"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Detail panel */}
        <div className="min-h-96 min-w-0 flex-1 bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col">
          {!selectedPost ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <p className="text-muted-foreground text-sm">Select a post from the list to view its details</p>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-foreground">@{selectedPost.username}</span>
                  <Badge>
                    {selectedPost.is_video ? <Video aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
                    {selectedPost.is_video ? "Video" : "Photo"}
                  </Badge>
                </div>
                {isAdmin && <Button
                  isDisabled={rescrapeState === "syncing"}
                  onPress={() => rescrapePost(selectedPost.shortcode)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md border transition-colors outline-none focus:ring-1 focus:ring-ring cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    rescrapeState === "done"
                      ? "bg-primary/10 text-primary border-primary/20"
                      : rescrapeState === "failed"
                      ? "bg-destructive/10 text-destructive border-destructive/20"
                      : "bg-background hover:bg-accent text-foreground border-border"
                  }`}
                >
                  {rescrapeState === "syncing" && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {rescrapeState === "done" && <CheckCircle className="w-3.5 h-3.5" />}
                  {rescrapeState === "failed" && <XCircle className="w-3.5 h-3.5" />}
                  {!rescrapeState && <RefreshCw className="w-3.5 h-3.5" />}
                  {rescrapeState === "syncing" ? "Queued / Syncing..." : rescrapeState === "done" ? "Done" : rescrapeState === "failed" ? "Failed" : "Rescrape"}
                </Button>}
              </div>

              {/* Stats row */}
              <div className="px-6 py-4 border-b border-border flex flex-wrap items-center gap-6">
                <StatPill label="Likes" value={(selectedPost.likes ?? 0).toLocaleString()} />
                <div className="w-px h-10 bg-border" />
                <StatPill label="Comments" value={(selectedPost.comments ?? 0).toLocaleString()} />
                <div className="w-px h-10 bg-border" />
                <StatPill label="Views" value={selectedPost.views ? selectedPost.views.toLocaleString() : "N/A"} />
                <div className="flex-1" />
                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                    <span>Posted: </span>
                    <span className="text-foreground font-medium">
                      {selectedPost.posted_timestamp ? new Date(selectedPost.posted_timestamp).toDateString() : "Not recorded"}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                    <span>Scraped: </span>
                    <span className="text-foreground font-medium">
                      {selectedPost.scraped_timestamp ? new Date(selectedPost.scraped_timestamp).toLocaleString() : "legacy"}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground font-mono">
                    <span className="font-sans">ID:</span>
                    {selectedPost.shortcode}
                  </div>
                </div>
              </div>

              {/* Caption */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="mb-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Caption</p>
                </div>
                {selectedPost.caption ? (
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{selectedPost.caption}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No caption.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
