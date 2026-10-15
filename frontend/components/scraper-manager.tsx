"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RefreshCw, Play, Plus, Search, Sparkles,
  AlertCircle, ArrowRight, CheckCircle2, Clock3
} from "lucide-react";
import { queueJob, waitForJob } from "@/lib/jobs";
import { useServerPacedPoll } from "@/lib/use-server-poll";
import { Badge } from "@/components/ui/badge";
import { NumberField } from "@/components/ui/number-field";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardSection, Section } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { Checkbox, SelectField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { LoadingState } from "@/components/ui/spinner";
import { Stat } from "@/components/ui/stat";
import { Table, TableFrame, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { HeaderActions } from "@/components/page-header";
import { useToast } from "@/components/toast";
import { getRunErrorSummary } from "@/lib/run-history";
import { formatDate, formatDateTime, formatTime, formatWeekdayDate } from "@/lib/format-date";

type Config = {
  target_accounts: string[];
  daily_run_time: string;
  scheduler_enabled?: boolean;
  post_lookback_days: number;
  incremental_post_limit: number;
  llm_config?: {
    lookback_days: number;
    max_posts: number;
    model: string;
  };
};

type LlmModel = {
  id: string;
  name: string;
  free?: boolean;
};

type AiStatus = {
  state: "idle" | "queued" | "running" | "success" | "error";
  configured_model: string | null;
  active_model: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_refreshed: string | null;
  error: string | null;
};

// Prefer the API's explanation (e.g. "That job is already queued or running.") over a bare status code.
async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return new Error(typeof data?.error === "string" ? data.error : `${fallback} (HTTP ${response.status})`);
}

export default function ScraperPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // Global Sync Form
  const [targetAccounts, setTargetAccounts] = useState<string[]>([]);
  const [newAccount, setNewAccount] = useState("");
  const [dailyTime, setDailyTime] = useState("00:00");
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [postLookbackDays, setPostLookbackDays] = useState(30);
  const [incrementalLimit, setIncrementalLimit] = useState(250);
  const [configSaving, setConfigSaving] = useState(false);
  const [forceScraping, setForceScraping] = useState(false);

  // LLM Config
  const [llmModels, setLlmModels] = useState<LlmModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [llmLookbackDays, setLlmLookbackDays] = useState(7);
  const [llmMaxPosts, setLlmMaxPosts] = useState(10);
  const [llmModelId, setLlmModelId] = useState("google/gemini-3.5-flash-lite");
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  // Deep Scrape Form
  const [deepUsername, setDeepUsername] = useState("");
  const [deepLimit, setDeepLimit] = useState(10);
  const [delayH, setDelayH] = useState(0);
  const [delayM, setDelayM] = useState(0);
  const [delayS, setDelayS] = useState(5);
  const [analyzing, setAnalyzing] = useState(false);
  const [maxPosts, setMaxPosts] = useState<number | null>(null);
  const [deepScraping, setDeepScraping] = useState(false);
  const [selectAll, setSelectAll] = useState(false);

  // Scheduler Status
  const [nextRunTime, setNextRunTime] = useState<Date | null>(null);
  const [lastRunDate, setLastRunDate] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("");
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [scheduleTimezone, setScheduleTimezone] = useState("America/Edmonton");
  const [scrapeRuns, setScrapeRuns] = useState<{id:string; kind:string; status:string; error:string | null; created_at:string; run_date:string; started_at:string | null; completed_at:string | null; accounts_scraped:number}[]>([]);

  const loadModels = async () => {
    try {
      const response = await fetch("/api/llm-models");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const models: unknown = await response.json();
      if (!Array.isArray(models) || models.length === 0) throw new Error("No models configured");
      setLlmModels(models);
      setModelsError(null);
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : "Could not load models");
    }
  };

  useEffect(() => {
    const modelsTimer = setTimeout(() => void loadModels(), 0);

    fetch("/api/config")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: Config) => {
        setTargetAccounts(d.target_accounts || []);
        setDailyTime(d.daily_run_time || "00:00");
        setSchedulerEnabled(d.scheduler_enabled === true);
        setPostLookbackDays(d.post_lookback_days || 30);
        setIncrementalLimit(d.incremental_post_limit || 250);

        if (d.llm_config) {
          setLlmLookbackDays(d.llm_config.lookback_days || 7);
          setLlmMaxPosts(d.llm_config.max_posts || 10);
          setLlmModelId(d.llm_config.model || "google/gemini-3.5-flash-lite");
        }

      })
      .catch(error => setConfigError(error instanceof Error ? error.message : "Could not load configuration"))
      .finally(() => setLoading(false));
    return () => clearTimeout(modelsTimer);
  }, []);

  // Each status check returns poll_after_ms: the server's estimate of when
  // something will next change. Wait that long instead of polling on a timer.
  const refreshAiStatus = useServerPacedPoll(async () => {
    const response = await fetch("/api/ai-status");
    const d = await response.json();
    if (!response.ok) throw new Error(d.error || `HTTP ${response.status}`);
    setAiStatus(d);
    return d.poll_after_ms;
  });

  const refreshSchedulerStatus = useServerPacedPoll(async () => {
    const response = await fetch("/api/scheduler-status");
    const d = await response.json();
    if (!response.ok) throw new Error(d.error || `HTTP ${response.status}`);
    setNextRunTime(d.next_run_time ? new Date(d.next_run_time) : null);
    setLastRunDate(d.last_run_date || null);
    setWorkerOnline(d.worker_online === true);
    if (d.timezone) setScheduleTimezone(d.timezone);
    if (d.scrape_runs) setScrapeRuns(d.scrape_runs);
    return d.poll_after_ms;
  });

  // Starting a job changes the estimate, so check both right away.
  const refreshStatus = () => {
    refreshAiStatus();
    refreshSchedulerStatus();
  };

  // Tick countdown every 1s (local only, no requests)

  useEffect(() => {
    const tick = setInterval(() => {
      if (!nextRunTime) { setCountdown("Scheduler inactive"); return; }
      const diff = nextRunTime.getTime() - Date.now();
      if (diff <= 0) { setCountdown("Running now..."); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    }, 1000);
    return () => clearInterval(tick);
  }, [nextRunTime]);

  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_accounts: targetAccounts.join(", "),
          daily_run_time: dailyTime,
          scheduler_enabled: schedulerEnabled,
          post_lookback_days: postLookbackDays,
          incremental_post_limit: incrementalLimit,
          llm_config: {
            lookback_days: llmLookbackDays,
            max_posts: llmMaxPosts,
            model: llmModelId
          }
        })
      });
      if (!response.ok) throw await responseError(response, "Could not save settings");
      if (!schedulerEnabled) setNextRunTime(null);
      refreshStatus();
      toast.success("Settings saved.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setConfigSaving(false);
    }
  };

  const forceScrape = async () => {
    setForceScraping(true);
    try {
      const response = await fetch("/api/force-scrape", { method: "POST" });
      if (!response.ok) throw await responseError(response, "Request failed");
      refreshStatus();
      toast.success("Scrape queued. Follow progress in Run History; insights are generated after a successful scrape.");
    } catch (error) {
      toast.error(error instanceof Error ? `Could not start scrape: ${error.message}` : "Could not start scrape.");
    } finally {
      setForceScraping(false);
    }
  };

  const generateInsights = async () => {
    setGeneratingInsights(true);
    try {
      const response = await fetch("/api/generate-insights", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start intelligence generation");
      setAiStatus(current => current ? { ...current, state: "queued", error: null } : current);
      refreshStatus();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not start insight generation.");
    } finally {
      setGeneratingInsights(false);
    }
  };

  const analyzeAccount = async () => {
    if (!deepUsername) return;
    setAnalyzing(true);
    try {
      const id = await queueJob("/api/analyze-account", { username: deepUsername });
      const result = await waitForJob<{ count: number }>(id);
      setMaxPosts(result.count);
    } catch (error) {
      toast.error(error instanceof Error ? `Could not analyze account: ${error.message}` : "Could not analyze account.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if(checked && maxPosts) setDeepLimit(Math.min(maxPosts, 5000));
  };

  const dispatchDeepScrape = async () => {
    setDeepScraping(true);
    const delayTotal = (delayH * 3600) + (delayM * 60) + delayS;
    try {
      const response = await fetch("/api/deep-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: deepUsername,
          limit: deepLimit,
          delay: delayTotal
        })
      });
      if (!response.ok) throw await responseError(response, "Request failed");
      refreshStatus();
      toast.success(`Deep scrape for @${deepUsername} queued. Follow progress in Run History.`);
    } catch (error) {
      toast.error(error instanceof Error ? `Could not start deep scrape: ${error.message}` : "Could not start deep scrape.");
    } finally {
      setDeepScraping(false);
    }
  };

  const addAccount = () => {
    const act = newAccount.trim().replace("@", "");
    if (act && !targetAccounts.includes(act)) {
      setTargetAccounts([...targetAccounts, act]);
      setNewAccount("");
    }
  };

  const removeAccount = (account: string) => {
    setTargetAccounts(targetAccounts.filter(a => a !== account));
  };

  const scrapeNow = (
    <HeaderActions>
      <Button onPress={forceScrape} loading={forceScraping} icon={<Play className="text-muted-foreground" aria-hidden="true" />}
        aria-label="Scrape now" className="px-2.5 sm:px-3.5">
        <span className="hidden sm:inline">{forceScraping ? "Starting..." : "Scrape now"}</span>
      </Button>
    </HeaderActions>
  );

  if (loading) return <LoadingState label="Loading configuration..." />;

  if (configError) return (
    <Notice tone="error" action={<Button size="sm" variant="ghost" onPress={() => window.location.reload()}>Retry</Button>}>
      Could not load scraper configuration: {configError}
    </Notice>
  );

  const aiBusy = aiStatus?.state === "running" || aiStatus?.state === "queued";
  const AiIcon = aiStatus?.state === "running" ? RefreshCw : aiStatus?.state === "error" ? AlertCircle : aiStatus?.state === "success" ? CheckCircle2 : Clock3;
  const aiLabel = aiStatus?.state === "queued" ? "Queued" : aiStatus?.state === "running" ? "Generating" :
    aiStatus?.state === "error" ? "Generation failed" : aiStatus?.state === "success" ? "Ready" : "Idle";
  // A paired box per unit, styled as one input.
  const delayBox = "h-10 flex-1 flex-row items-center gap-1.5 rounded-lg border border-input bg-background px-3 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring";
  const delayInput = "w-full min-w-0 bg-transparent text-sm text-foreground tabular-nums outline-none";

  return (
    <div className="space-y-10">
      {scrapeNow}
      {workerOnline === false && <Notice>The scraper is offline. New jobs will stay queued until it reconnects.</Notice>}

      <section aria-label="Schedule" className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
        <Stat
          className="col-span-2 lg:col-span-1"
          label="Next scheduled scrape"
          value={countdown || "Pending"}
          hint={nextRunTime ? `${formatDateTime(nextRunTime, { timeZone: scheduleTimezone })} (${scheduleTimezone})` : "Automatic scraping is off"}
        />
        <Stat label="Last run" value={lastRunDate ? formatDate(lastRunDate) : "Never"} />
        <Stat
          label="Scraper"
          value={workerOnline === null ? "Checking" : workerOnline ? "Online" : "Offline"}
          hint={workerOnline ? "Ready for new jobs" : workerOnline === false ? "Jobs wait in the queue" : undefined}
        />
      </section>

      {scrapeRuns.length > 0 && (
        <Section title="Run History" id="run-history">
          <TableFrame className="max-h-80 overflow-auto">
            <Table>
              <TableHead sticky>
                <Th>Date</Th>
                <Th className="hidden sm:table-cell">Task</Th>
                <Th className="hidden md:table-cell">Started</Th>
                <Th className="hidden md:table-cell">Completed</Th>
                <Th align="right" className="hidden sm:table-cell">Accounts</Th>
                <Th align="right">Status</Th>
              </TableHead>
              <tbody>
                {scrapeRuns.map((run, i) => {
                  const start = run.started_at ? new Date(run.started_at) : null;
                  const end = run.completed_at ? new Date(run.completed_at) : null;
                  const durationMs = end && start ? end.getTime() - start.getTime() : 0;
                  const durationStr = durationMs < 60000
                    ? `${Math.round(durationMs / 1000)}s`
                    : `${Math.floor(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`;
                  const isLatest = i === 0;
                  return (
                    <Tr key={run.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          {isLatest && <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
                          <span className={`font-medium whitespace-nowrap tabular-nums ${isLatest ? "text-foreground" : "text-muted-foreground"}`}>
                            {formatWeekdayDate(run.created_at)}
                          </span>
                          {isLatest && <Badge variant="muted" className="hidden sm:inline-flex">Latest</Badge>}
                        </div>
                        {/* Phones fold the task under the date instead of giving it a column. */}
                        <p className={`mt-0.5 text-xs text-muted-foreground first-letter:uppercase sm:hidden ${isLatest ? "pl-3.5" : ""}`}>{run.kind.replaceAll("_", " ")}</p>
                      </Td>
                      <Td className="hidden text-muted-foreground first-letter:uppercase sm:table-cell">{run.kind.replaceAll("_", " ")}</Td>
                      <Td className="hidden text-muted-foreground tabular-nums md:table-cell">{start ? formatTime(start) : "—"}</Td>
                      <Td className="hidden whitespace-nowrap tabular-nums md:table-cell">
                        <span className="text-muted-foreground">{end ? formatTime(end) : "—"}</span>
                        {end && start && <span className="ml-2 text-xs text-muted-foreground/70">{durationStr}</span>}
                      </Td>
                      <Td align="right" className="hidden tabular-nums sm:table-cell">{run.accounts_scraped}</Td>
                      <Td align="right" className="py-1.5">
                        {run.error || run.status === "error" ? (
                          <Link
                            href={`/scraper/runs/${encodeURIComponent(run.id)}`}
                            aria-label={`Error: ${getRunErrorSummary(run.error)}. View run details.`}
                            title={getRunErrorSummary(run.error)}
                            className="group inline-flex min-h-10 max-w-40 items-center gap-2 rounded-lg px-2 text-xs text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-72"
                          >
                            <AlertCircle aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />
                            <span className="truncate">{getRunErrorSummary(run.error)}</span>
                            <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                          </Link>
                        ) : (
                          <Badge className="capitalize" variant={run.status === "success" ? "success" : "muted"}>{run.status}</Badge>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableFrame>
        </Section>
      )}

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 xl:grid-cols-2">
        <Card as="section" aria-labelledby="settings-heading">
          <CardHeader id="settings-heading" title="Settings" description="Used by scheduled scrapes, manual scrapes, and insight generation." />
          <div className="space-y-8">
            <CardSection title="Target accounts">
              <div className="flex items-end gap-2">
                <TextField label="Add account" hideLabel value={newAccount} onChange={setNewAccount} onEnter={addAccount}
                  placeholder="Add an account, e.g. reddeer" className="flex-1" />
                <Button onPress={addAccount} isDisabled={!newAccount.trim()} icon={<Plus aria-hidden="true" />}>Add</Button>
              </div>
              {targetAccounts.length > 0 ? (
                <TableFrame className="max-h-56 overflow-y-auto">
                  <Table>
                    <tbody>
                      {targetAccounts.map((account) => (
                        <Tr key={account}>
                          <Td className="py-1.5 font-medium [overflow-wrap:anywhere]">@{account}</Td>
                          <Td align="right" className="w-24 py-1.5">
                            <Button variant="destructive" size="sm" onPress={() => removeAccount(account)} aria-label={`Remove @${account}`}>Remove</Button>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableFrame>
              ) : (
                <p className="text-sm text-muted-foreground">No accounts yet. Add the Instagram accounts to track.</p>
              )}
            </CardSection>

            <CardSection title="Schedule">
              <Checkbox isSelected={schedulerEnabled} onChange={setSchedulerEnabled}>Scrape automatically every day</Checkbox>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TextField label="Daily scrape time" value={dailyTime} onChange={setDailyTime} placeholder="00:00" />
                <NumberField label="Post lookback (days)" value={postLookbackDays} onChange={setPostLookbackDays} min={1} max={3650} />
                <NumberField label="Max posts per account" value={incrementalLimit} onChange={setIncrementalLimit} min={1} max={5000} />
              </div>
              <p className="text-xs text-muted-foreground">
                Each account is paginated back to the lookback date; the post limit is a safety cap. Times are in {scheduleTimezone}.
              </p>
            </CardSection>

            <CardSection title="AI insights">
              <SelectField label="Model" value={llmModelId} onChange={e => setLlmModelId(e.target.value)}>
                {!llmModels.some(model => model.id === llmModelId) && (
                  <option value={llmModelId}>Saved model: {llmModelId}</option>
                )}
                {[
                  { label: "Free", models: llmModels.filter(model => model.free) },
                  { label: "Paid (uses OpenRouter credits)", models: llmModels.filter(model => !model.free) },
                ].filter(group => group.models.length > 0).map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.models.map(model => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </optgroup>
                ))}
              </SelectField>
              {modelsError && (
                <Notice tone="error" action={<Button size="sm" variant="ghost" onPress={() => void loadModels()}>Retry</Button>}>
                  Could not load model choices ({modelsError}).
                </Notice>
              )}
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Context (days back)" value={llmLookbackDays} onChange={setLlmLookbackDays} min={1} max={365} />
                <NumberField label="Max posts analyzed" value={llmMaxPosts} onChange={setLlmMaxPosts} min={1} max={250} />
              </div>
            </CardSection>
          </div>
          <div className="mt-8 flex justify-end">
            <Button variant="primary" onPress={saveConfig} loading={configSaving}>{configSaving ? "Saving..." : "Save settings"}</Button>
          </div>
        </Card>

        <div className="flex flex-col gap-3 sm:gap-4">
          <Card as="section" aria-labelledby="ai-heading">
            <CardHeader
              id="ai-heading"
              title="AI insights"
              description="Summarizes recent posts for the Overview page."
              action={
                <Badge variant={aiStatus?.state === "error" ? "destructive" : aiStatus?.state === "success" ? "success" : "muted"}>
                  <AiIcon aria-hidden="true" className={aiStatus?.state === "running" ? "animate-spin motion-reduce:animate-none" : undefined} />
                  {aiStatus ? aiLabel : "Loading"}
                </Badge>
              }
            />
            <DetailList items={[
              { label: "Last successful refresh", value: aiStatus?.last_refreshed ? formatDateTime(aiStatus.last_refreshed) : "Never" },
              { label: "Model", value: aiStatus?.active_model || aiStatus?.configured_model || llmModelId },
              ...(aiStatus?.started_at ? [{ label: "Started", value: formatDateTime(aiStatus.started_at) }] : []),
              ...(aiStatus?.completed_at ? [{ label: "Completed", value: formatDateTime(aiStatus.completed_at) }] : []),
            ]} />
            {aiStatus?.error && <Notice tone="error" className="mt-4">{aiStatus.error}</Notice>}
            <div className="mt-6 flex justify-end">
              <Button onPress={generateInsights} loading={generatingInsights || aiStatus?.state === "running"} isDisabled={aiBusy}
                icon={<Sparkles className="text-muted-foreground" aria-hidden="true" />}>
                {generatingInsights ? "Starting..." : aiStatus?.state === "queued" ? "Queued" : aiStatus?.state === "running" ? "Generating..." : "Regenerate insights"}
              </Button>
            </div>
          </Card>

          <Card as="section" aria-labelledby="deep-heading">
            <CardHeader id="deep-heading" title="Deep scrape" description="Collect an account's full history, paced to stay under rate limits." />
            <div className="flex items-end gap-2">
              <TextField label="Username" value={deepUsername} onChange={setDeepUsername} onEnter={() => void analyzeAccount()} placeholder="e.g. reddeer" className="flex-1" />
              <Button onPress={analyzeAccount} loading={analyzing} isDisabled={!deepUsername} icon={<Search className="text-muted-foreground" aria-hidden="true" />}>
                {analyzing ? "Analyzing..." : "Analyze"}
              </Button>
            </div>

            {maxPosts !== null && (
              <div className="mt-8 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-medium text-foreground">Scrape options</h4>
                  <Badge variant="muted">{maxPosts.toLocaleString()} posts found</Badge>
                </div>
                <NumberField label="Posts to collect" value={deepLimit} onChange={setDeepLimit} min={1} max={Math.min(maxPosts || 5000, 5000)} isDisabled={selectAll} />
                <Checkbox isSelected={selectAll} onChange={handleSelectAll}>Collect every post (up to 5,000)</Checkbox>
                <div className="space-y-1.5">
                  <p id="delay-label" className="text-xs font-medium text-muted-foreground">Delay between pages</p>
                  <div role="group" aria-labelledby="delay-label" className="flex gap-2">
                    <NumberField aria-label="Delay hours" value={delayH} onChange={setDelayH} min={0} max={1} className={delayBox}
                      inputClassName={delayInput} suffix={<span className="text-xs text-muted-foreground">hr</span>} />
                    <NumberField aria-label="Delay minutes" value={delayM} onChange={setDelayM} min={0} max={59} className={delayBox}
                      inputClassName={delayInput} suffix={<span className="text-xs text-muted-foreground">min</span>} />
                    <NumberField aria-label="Delay seconds" value={delayS} onChange={setDelayS} min={0} max={59} className={delayBox}
                      inputClassName={delayInput} suffix={<span className="text-xs text-muted-foreground">sec</span>} />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button variant="primary" onPress={dispatchDeepScrape} loading={deepScraping}>
                    {deepScraping ? "Starting..." : "Start deep scrape"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
