"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { LoadingState } from "@/components/ui/spinner";
import { Stat } from "@/components/ui/stat";
import { HeaderActions } from "@/components/page-header";
import { RelativeTime, useNow } from "@/components/relative-time";
import { useToast } from "@/components/toast";
import { AccountsSection } from "@/components/manager/accounts-section";
import { ActivitySection } from "@/components/manager/activity-section";
import { InsightsSection } from "@/components/manager/insights-section";
import { ScheduleSection } from "@/components/manager/schedule-section";
import { errorMessage, responseError, type AiStatus, type Config, type Run, type SaveConfig, type ScrapedAccount } from "@/components/manager/types";
import { useServerPacedPoll } from "@/lib/use-server-poll";
import { formatClockTime, formatCountdown } from "@/lib/format-date";
import { getRunStatus, getRunTask, type RunStatus } from "@/lib/run-history";

const DEFAULT_MODEL = "google/gemini-3.5-flash-lite";

const STATUS_TEXT: Record<RunStatus["variant"], string> = {
  success: "text-emerald-500", warning: "text-amber-500", destructive: "text-destructive", muted: "text-muted-foreground",
};

function normalizeConfig(data: Partial<Config>): Config {
  return {
    target_accounts: data.target_accounts || [],
    daily_run_time: data.daily_run_time || "00:00",
    scheduler_enabled: data.scheduler_enabled === true,
    post_lookback_days: data.post_lookback_days || 30,
    incremental_post_limit: data.incremental_post_limit || 250,
    llm_config: {
      lookback_days: data.llm_config?.lookback_days || 7,
      max_posts: data.llm_config?.max_posts || 10,
      model: data.llm_config?.model || DEFAULT_MODEL,
    },
  };
}

const isActive = (run: Run) => run.status === "queued" || run.status === "running";

export default function ScraperManager() {
  const toast = useToast();
  const now = useNow(30_000);
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const savedConfig = useRef<Config | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [accounts, setAccounts] = useState<ScrapedAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [nextRunTime, setNextRunTime] = useState<Date | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [timeZone, setTimeZone] = useState("America/Edmonton");
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [forceScraping, setForceScraping] = useState(false);

  const loadAccounts = useCallback(() => fetch("/api/accounts")
    .then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setAccounts(data.accounts || []);
      setAccountsError(null);
    })
    .catch(error => setAccountsError(errorMessage(error, "Could not load accounts"))), []);

  useEffect(() => {
    fetch("/api/config")
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data: Partial<Config> & { timezone?: string }) => {
        savedConfig.current = normalizeConfig(data);
        setConfig(savedConfig.current);
        if (data.timezone) setTimeZone(data.timezone);
      })
      .catch(error => setConfigError(errorMessage(error, "Could not load configuration")));
    void loadAccounts();
  }, [loadAccounts]);

  // Each status check returns poll_after_ms: the server's estimate of when
  // something will next change. Wait that long instead of polling on a timer.
  const refreshAiStatus = useServerPacedPoll(async () => {
    const response = await fetch("/api/ai-status");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    setAiStatus(data);
    return data.poll_after_ms;
  });

  const refreshSchedulerStatus = useServerPacedPoll(async () => {
    const response = await fetch("/api/scheduler-status");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    setNextRunTime(data.next_run_time ? new Date(data.next_run_time) : null);
    setWorkerOnline(data.worker_online === true);
    if (data.timezone) setTimeZone(data.timezone);
    if (data.scrape_runs) setRuns(data.scrape_runs);
    return data.poll_after_ms;
  });

  // Starting a job or saving settings changes the estimate, so check both right away.
  const refreshStatus = () => {
    refreshAiStatus();
    refreshSchedulerStatus();
  };

  // A finished scrape can add accounts to Overview's list, so reload it when one completes.
  const lastCollected = runs?.find(run => (run.kind === "daily_scrape" || run.kind === "deep_scrape") && run.completed_at)?.id ?? "";
  const runsLoaded = runs !== null;
  const seenCollected = useRef<string | null>(null);
  useEffect(() => {
    if (!runsLoaded) return;
    if (seenCollected.current !== null && seenCollected.current !== lastCollected) void loadAccounts();
    seenCollected.current = lastCollected;
  }, [runsLoaded, lastCollected, loadAccounts]);

  // Saves run one at a time, each applied to what the previous one saved.
  const saveConfig: SaveConfig = change => {
    const attempt = saveQueue.current.then(async () => {
      const next = { ...savedConfig.current!, ...change(savedConfig.current!) };
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw await responseError(response, "Could not save settings");
      savedConfig.current = next;
      setConfig(next);
      if (!next.scheduler_enabled) setNextRunTime(null);
      refreshStatus();
    });
    saveQueue.current = attempt.catch(() => {});
    return attempt;
  };

  const forceScrape = async () => {
    setForceScraping(true);
    try {
      const response = await fetch("/api/force-scrape", { method: "POST" });
      if (!response.ok) throw await responseError(response, "Request failed");
      refreshStatus();
      toast.success("Scrape queued. Follow its progress in Activity; insights regenerate once it finishes.");
    } catch (error) {
      toast.error(`Could not start scrape: ${errorMessage(error, "request failed")}`);
    } finally {
      setForceScraping(false);
    }
  };

  if (configError) return (
    <Notice tone="error" action={<Button size="sm" variant="ghost" onPress={() => window.location.reload()}>Retry</Button>}>
      Could not load scraper configuration: {configError}
    </Notice>
  );

  if (!config) return <LoadingState label="Loading configuration..." />;

  // Post count checks belong to starting a deep scrape; they aren't runs worth reporting.
  const reported = (runs ?? []).filter(run => run.kind !== "analyze");
  const activeScrape = reported.find(run => run.kind === "daily_scrape" && isActive(run));
  const current = reported.find(isActive);
  const lastFinished = reported.find(run => run.completed_at);
  const lastStatus = lastFinished && getRunStatus(lastFinished);

  const scheduleHint = activeScrape?.status === "running" ? "Scrape running now"
    : nextRunTime ? (nextRunTime.getTime() <= now ? "Next run starting now" : `Next run ${formatCountdown(nextRunTime.getTime() - now)}`)
    : config.scheduler_enabled ? "Checking next run" : "Scrapes only run when you start one";

  return (
    <div className="space-y-10">
      <HeaderActions>
        <Button variant="primary" onPress={forceScrape} loading={forceScraping} isDisabled={!!activeScrape}
          icon={<Play aria-hidden="true" />} aria-label={activeScrape ? "Scrape in progress" : "Run scrape now"} className="px-2.5 sm:px-3.5">
          <span className="hidden sm:inline">
            {forceScraping ? "Starting..." : activeScrape?.status === "running" ? "Scrape running" : activeScrape ? "Scrape queued" : "Run scrape now"}
          </span>
        </Button>
      </HeaderActions>

      {workerOnline === false && <Notice>The scraper is offline. New jobs will stay queued until it reconnects.</Notice>}

      <section aria-label="Status" className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
        <Stat
          className="col-span-2 lg:col-span-1"
          label="Schedule"
          value={config.scheduler_enabled ? `Daily at ${formatClockTime(config.daily_run_time)}` : "Off"}
          hint={scheduleHint}
        />
        <Stat
          label="Last run"
          value={current?.status === "running" ? "Running now" : current ? "Queued"
            : lastFinished?.completed_at ? <RelativeTime value={lastFinished.completed_at} timeZone={timeZone} className="inline-block first-letter:uppercase" />
            : runs === null ? "Checking" : "Never"}
          hint={current ? getRunTask(current.kind) : lastFinished && lastStatus ? (
            <>{getRunTask(lastFinished.kind)} · <span className={STATUS_TEXT[lastStatus.variant]}>{lastStatus.label}</span></>
          ) : undefined}
        />
        <Stat
          label="Scraper"
          value={workerOnline === null ? "Checking" : workerOnline ? "Online" : "Offline"}
          hint={workerOnline ? "Ready for new jobs" : workerOnline === false ? "Jobs wait in the queue" : undefined}
        />
      </section>

      <AccountsSection config={config} saveConfig={saveConfig} accounts={accounts} accountsError={accountsError}
        onRetryAccounts={() => void loadAccounts()} onQueued={refreshStatus} timeZone={timeZone} />

      <div className="grid grid-cols-1 items-start gap-10 xl:grid-cols-2 xl:gap-4">
        <ScheduleSection config={config} saveConfig={saveConfig} timeZone={timeZone} />
        <InsightsSection config={config} saveConfig={saveConfig} status={aiStatus} onQueued={refreshStatus} timeZone={timeZone} />
      </div>

      <ActivitySection runs={runs === null ? null : reported} timeZone={timeZone} />
    </div>
  );
}
