"use client";

import { useEffect, useState } from "react";
import { Select, Label, Button, SelectValue, Popover, ListBox, ListBoxItem } from "react-aria-components";
import {
  Heart, MessageCircle, Play, Image, Video,
  ChevronDown, RefreshCw, CheckCircle, XCircle,
} from "lucide-react";
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
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState<string>("");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [rescrapeSyncing, setRescrapeSyncing] = useState<Record<string, "syncing" | "done" | "failed" | null>>({});

  useEffect(() => {
    fetchPosts();
  }, [filterUser]);

  const fetchPosts = async () => {
    setLoading(true);
    setSelectedPost(null);
    try {
      const url = filterUser
        ? `/api/posts?username=${encodeURIComponent(filterUser)}`
        : `/api/posts`;
      const res = await fetch(url);
      const data = await res.json();
      setPosts(data.posts || []);
      setUsers(data.users || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const rescrapePost = async (shortcode: string) => {
    setRescrapeSyncing(prev => ({ ...prev, [shortcode]: "syncing" }));
    try {
      const res = await fetch("/api/rescrape-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortcode }),
      });
      const data = await res.json();
      if (data.success) {
        setRescrapeSyncing(prev => ({ ...prev, [shortcode]: "done" }));
        if (selectedPost?.shortcode === shortcode) await fetchPosts();
        setTimeout(() => setRescrapeSyncing(prev => ({ ...prev, [shortcode]: null })), 4000);
      } else {
        setRescrapeSyncing(prev => ({ ...prev, [shortcode]: "failed" }));
      }
    } catch {
      setRescrapeSyncing(prev => ({ ...prev, [shortcode]: "failed" }));
    }
  };

  const rescrapeState = selectedPost ? rescrapeSyncing[selectedPost.shortcode] : null;

  return (
    <div className="space-y-6 h-full">
      {/* Header */}
      <div className="pb-2 flex justify-between items-end">

        <Select
          selectedKey={filterUser}
          onSelectionChange={(k) => setFilterUser(k as string)}
          className="flex flex-col gap-1 w-56"
        >
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Account</Label>
          <Button className="flex items-center justify-between w-full px-3 py-2 bg-background border border-input rounded-md text-sm text-foreground outline-none focus:ring-1 focus:ring-ring shadow-sm">
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
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">

        {/* LEFT: Compact list */}
        <div className="w-80 flex-shrink-0 bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col">
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
                          : <Image className="w-3 h-3 shrink-0 text-primary" />
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
        <div className="flex-1 bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col">
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
                    {selectedPost.is_video ? <Video /> : <Image />}
                    {selectedPost.is_video ? "Video" : "Photo"}
                  </Badge>
                </div>
                <Button
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
                  {rescrapeState === "syncing" ? "Syncing..." : rescrapeState === "done" ? "Done" : rescrapeState === "failed" ? "Failed" : "Rescrape"}
                </Button>
              </div>

              {/* Stats row */}
              <div className="px-6 py-4 border-b border-border flex items-center gap-6">
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
