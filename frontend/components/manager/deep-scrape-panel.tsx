"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { NumberField } from "@/components/ui/number-field";
import { LoadingState } from "@/components/ui/spinner";
import { useToast } from "@/components/toast";
import { queueJob, waitForJob } from "@/lib/jobs";
import { errorMessage, responseError } from "./types";

const MAX_DEEP_POSTS = 5000;

/** Options for a one-time backfill of one account, shown under its row in Accounts. */
export function DeepScrapePanel({ username, knownTotal, lookbackDays, onClose, onQueued }: {
  username: string;
  /** The account's post count from its last scrape; looked up when it hasn't been scraped. */
  knownTotal: number | null;
  lookbackDays: number;
  onClose: () => void;
  onQueued: () => void;
}) {
  const toast = useToast();
  const [total, setTotal] = useState(knownTotal);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);
  const [everyPost, setEveryPost] = useState(false);
  const [delay, setDelay] = useState(5);
  const [starting, setStarting] = useState(false);
  const max = Math.min(total || MAX_DEEP_POSTS, MAX_DEEP_POSTS);

  const lookUp = async () => {
    setLookupError(null);
    try {
      const id = await queueJob("/api/analyze-account", { username });
      setTotal((await waitForJob<{ count: number }>(id)).count);
    } catch (error) {
      setLookupError(errorMessage(error, "Could not check the account."));
    }
  };

  useEffect(() => {
    if (knownTotal !== null) return;
    const timer = setTimeout(() => void lookUp(), 0);
    return () => clearTimeout(timer);
    // Look up once per opened panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setStarting(true);
    try {
      const response = await fetch("/api/deep-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, limit: everyPost ? max : Math.min(limit, max), delay }),
      });
      if (!response.ok) throw await responseError(response, "Request failed");
      onQueued();
      toast.success(`Deep scrape for @${username} queued. Follow its progress in Activity.`);
      onClose();
    } catch (error) {
      toast.error(`Could not start deep scrape: ${errorMessage(error, "request failed")}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-border bg-background/40 px-4 py-5 sm:px-6">
      <div>
        <h4 className="text-sm font-medium text-foreground">Deep scrape @{username}</h4>
        <p className="mt-1 max-w-prose text-xs text-muted-foreground">
          A one-time backfill of older posts, beyond the {lookbackDays}-day window each scrape collects. It doesn&apos;t change the daily scrape.
        </p>
      </div>
      {total === null ? (
        lookupError ? (
          <Notice tone="error" action={<Button size="sm" variant="ghost" onPress={() => void lookUp()}>Retry</Button>}>{lookupError}</Notice>
        ) : <LoadingState label={`Checking how many posts @${username} has...`} className="justify-start p-0" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <NumberField label="Posts to collect" value={everyPost ? max : Math.min(limit, max)} onChange={setLimit} min={1} max={max}
                isDisabled={everyPost} description={`@${username} has ${total.toLocaleString()} posts.`} />
              <Checkbox isSelected={everyPost} onChange={setEveryPost}>
                Collect every post{total > MAX_DEEP_POSTS ? ` (first ${MAX_DEEP_POSTS.toLocaleString()})` : ""}
              </Checkbox>
            </div>
            <NumberField label="Delay between pages (seconds)" value={delay} onChange={setDelay} min={1} max={3600}
              description="Pauses after each page of 50 posts to stay under rate limits." />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={onClose}>Cancel</Button>
            <Button onPress={() => void start()} loading={starting}>{starting ? "Starting..." : "Start deep scrape"}</Button>
          </div>
        </>
      )}
    </div>
  );
}
