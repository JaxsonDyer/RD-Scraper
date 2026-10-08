"use client";

import { useEffect, useState } from "react";
import { Button, Input, TextField, Label, Checkbox } from "react-aria-components";
import {
  RefreshCw,
  AlertCircle, CheckCircle2, Clock3
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
};

type AiStatus = {
  state: "idle" | "running" | "success" | "error";
  configured_model: string | null;
  active_model: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_refreshed: string | null;
  error: string | null;
};

export default function ScraperPage() {
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
  const [llmModelId, setLlmModelId] = useState("google/gemini-2.5-flash");
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
  const [scrapeRuns, setScrapeRuns] = useState<{run_date:string; started_at:string; completed_at:string; accounts_scraped:number}[]>([]);

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
    void loadModels();

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
          setLlmModelId(d.llm_config.model || "google/gemini-2.5-flash");
        }
        
      })
      .catch(error => setConfigError(error instanceof Error ? error.message : "Could not load configuration"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const pollAiStatus = () => {
      fetch("/api/ai-status")
        .then(r => r.json())
        .then(d => setAiStatus(d))
        .catch(() => {});
    };
    pollAiStatus();
    const interval = setInterval(pollAiStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  // Poll scheduler status every 5s, then tick countdown every 1s
  useEffect(() => {
    const pollStatus = () => {
      fetch("/api/scheduler-status")
        .then(r => r.json())
        .then(d => {
          setNextRunTime(d.next_run_time ? new Date(d.next_run_time) : null);
          if (d.last_run_date) setLastRunDate(d.last_run_date);
          if (d.scrape_runs) setScrapeRuns(d.scrape_runs);
        })
        .catch(() => {});
    };
    pollStatus();
    const pollInterval = setInterval(pollStatus, 5000);
    return () => clearInterval(pollInterval);
  }, []);

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
      if (!response.ok) throw new Error("Failed to save config.");
      if (!schedulerEnabled) setNextRunTime(null);
      alert("Configuration Saved!");
    } catch (e) {
      console.error(e);
      alert("Failed to save config.");
    } finally {
      setConfigSaving(false);
    }
  };

  const forceScrape = async () => {
    setForceScraping(true);
    try {
      const response = await fetch("/api/force-scrape", { method: "POST" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      alert("Background scrape initiated. Insights will be generated automatically upon completion.");
    } catch (error) {
      alert(error instanceof Error ? `Could not start scrape: ${error.message}` : "Could not start scrape.");
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
      setAiStatus(current => current ? { ...current, state: "running", error: null } : current);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to start intelligence generation.");
    } finally {
      setGeneratingInsights(false);
    }
  };

  const analyzeAccount = async () => {
    if (!deepUsername) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: deepUsername })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      if (d.success) setMaxPosts(d.count);
      else alert("Could not extract data");
    } catch (error) {
      alert(error instanceof Error ? `Could not analyze account: ${error.message}` : "Could not analyze account.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if(checked && maxPosts) setDeepLimit(maxPosts);
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      alert(`Deep Scrape for @${deepUsername} dispatched to background thread.`);
    } catch (error) {
      alert(error instanceof Error ? `Could not start deep scrape: ${error.message}` : "Could not start deep scrape.");
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

  if (loading) return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <RefreshCw className="w-4 h-4 animate-spin" /> Loading configurations...
    </div>
  );

  if (configError) return (
    <div className="p-6 border border-destructive/20 rounded-lg text-sm text-destructive">
      Could not load scraper configuration: {configError}. Check that the backend is running.
      <Button onPress={() => window.location.reload()} className="ml-3 underline cursor-pointer">Retry</Button>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Scheduler countdown + last run */}
      <section>
        <div className="card-surface border border-border rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Next Scheduled Scrape</p>
                <p className="text-4xl font-mono font-bold text-primary tracking-tight">{countdown || "Pending"}</p>
                {nextRunTime && (
                  <p className="text-xs text-muted-foreground mt-1">{nextRunTime.toLocaleString()}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Last Run</p>
              <p className="text-sm font-medium text-foreground">
                {lastRunDate ? new Date(lastRunDate).toDateString() : "Never"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Scrape Run History */}
      {scrapeRuns.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Run History</h2>
          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b border-border">
                  <tr>
                    <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Started</th>
                    <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Completed</th>
                    <th className="py-2.5 px-4 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Accounts</th>
                    <th className="py-2.5 px-4 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scrapeRuns.map((run, i) => {
                    const start = new Date(run.started_at);
                    const end = new Date(run.completed_at);
                    const durationMs = end.getTime() - start.getTime();
                    const durationStr = durationMs < 60000
                      ? `${Math.round(durationMs / 1000)}s`
                      : `${Math.floor(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`;
                    const isLatest = i === 0;
                    return (
                      <tr key={run.run_date} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {isLatest && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                            <span className={`font-medium tabular-nums ${isLatest ? "text-foreground" : "text-muted-foreground"}`}>
                              {new Date(run.run_date).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                            </span>
                            {isLatest && <Badge>Latest</Badge>}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground tabular-nums text-xs">{start.toLocaleTimeString()}</td>
                        <td className="py-3 px-4 tabular-nums text-xs">
                          <span className="text-muted-foreground">{end.toLocaleTimeString()}</span>
                          <span className="ml-2 text-[10px] text-muted-foreground/60">({durationStr})</span>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-foreground font-medium">{run.accounts_scraped}</td>
                        <td className="py-3 px-4 text-right">
                          <Badge>Complete</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Configuration + Deep Scrape side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Global Configuration */}
        <section className="bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Global Configuration</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Automated schedule and target management.</p>
          </div>

          <div className="p-6 space-y-5 flex-1">
            {/* Target accounts */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Target Accounts</Label>
              <div className="flex gap-2">
                <Input value={newAccount} onChange={e => setNewAccount(e.target.value)} onKeyDown={(e) => { if(e.key === "Enter") addAccount(); }} placeholder="Add account e.g. reddeer" className="bg-background border border-input p-2 rounded-md text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none flex-1" />
                <Button onPress={addAccount} className="inline-flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium text-sm py-2 px-3 rounded-md transition-colors outline-none cursor-pointer">
                  Add
                </Button>
              </div>
              {targetAccounts.length > 0 ? (
                <div className="border border-border rounded-md max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b border-border">
                      <tr>
                        <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Username</th>
                        <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground w-20">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targetAccounts.map((account) => (
                        <tr key={account} className="border-b border-border last:border-none hover:bg-muted/40 transition-colors">
                          <td className="py-2 px-3 font-medium text-foreground text-sm">@{account}</td>
                          <td className="py-2 px-3 text-right">
                            <button onClick={() => removeAccount(account)} className="inline-flex items-center gap-1 text-destructive hover:text-destructive/80 text-xs font-medium cursor-pointer">
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-3 bg-muted/30 border border-border rounded-md text-xs text-muted-foreground text-center">No accounts listed.</div>
              )}
            </div>

            {/* Schedule fields */}
            <Checkbox
              isSelected={schedulerEnabled}
              onChange={setSchedulerEnabled}
              className="group flex items-center gap-2.5 text-sm font-medium text-foreground cursor-pointer"
            >
              <span className="flex size-4 items-center justify-center rounded border border-border bg-background group-data-[selected]:border-primary group-data-[selected]:bg-primary group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-ring">
                <svg className="size-2.5 text-primary-foreground opacity-0 group-data-[selected]:opacity-100" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 8L6 11L11 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              Enable daily automatic scraping
            </Checkbox>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TextField value={dailyTime} onChange={setDailyTime} className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground font-medium">Daily Scrape Time</Label>
                <Input className="bg-background border border-input p-2 rounded-md text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none" placeholder="00:00" />
              </TextField>
              <TextField value={postLookbackDays.toString()} onChange={v => setPostLookbackDays(parseInt(v) || 1)} className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground font-medium">Post Lookback (Days)</Label>
                <Input type="number" min={1} max={3650} className="bg-background border border-input p-2 rounded-md text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
              </TextField>
              <TextField value={incrementalLimit.toString()} onChange={v => setIncrementalLimit(parseInt(v) || 1)} className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground font-medium">Max Posts / Account</Label>
                <Input type="number" min={1} max={5000} className="bg-background border border-input p-2 rounded-md text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
              </TextField>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Each account is paginated back to the selected date, with the post limit acting as a safety cap.
            </p>
          </div>

          {/* AI Intelligence Configuration */}
          <div className="px-6 py-4 border-t border-b border-border bg-muted/10">
            <h3 className="text-xs font-semibold text-foreground mb-4">AI Intelligence Pipeline</h3>
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-background/70 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {aiStatus?.state === "running" ? (
                      <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                    ) : aiStatus?.state === "error" ? (
                      <AlertCircle className="w-4 h-4 text-destructive" />
                    ) : aiStatus?.state === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Clock3 className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-semibold text-foreground">
                      {aiStatus?.state === "running" ? "Generating" :
                       aiStatus?.state === "error" ? "Generation Failed" :
                       aiStatus?.state === "success" ? "Ready" : "Idle"}
                    </span>
                  </div>
                  <Badge
                    variant={
                      aiStatus?.state === "error" ? "destructive" :
                      aiStatus?.state === "success" ? "success" :
                      aiStatus?.state === "running" ? "outline" : "muted"
                    }
                    className="uppercase tracking-wider"
                  >
                    {aiStatus?.state || "loading"}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Last successful refresh</p>
                    <p className="text-foreground font-medium mt-0.5">
                      {aiStatus?.last_refreshed ? new Date(aiStatus.last_refreshed).toLocaleString() : "Never"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Model</p>
                    <p className="text-foreground font-medium mt-0.5 break-all">
                      {aiStatus?.active_model || aiStatus?.configured_model || llmModelId}
                    </p>
                  </div>
                  {aiStatus?.started_at && (
                    <div>
                      <p className="text-muted-foreground">Started</p>
                      <p className="text-foreground font-medium mt-0.5">{new Date(aiStatus.started_at).toLocaleString()}</p>
                    </div>
                  )}
                  {aiStatus?.completed_at && (
                    <div>
                      <p className="text-muted-foreground">Completed</p>
                      <p className="text-foreground font-medium mt-0.5">{new Date(aiStatus.completed_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
                {aiStatus?.error && (
                  <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2 break-words">
                    {aiStatus.error}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground font-medium">Model Selection</Label>
                <select 
                  value={llmModelId} 
                  onChange={e => setLlmModelId(e.target.value)}
                  className="bg-background border border-input p-2 rounded-md text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                >
                  {!llmModels.some(model => model.id === llmModelId) && (
                    <option value={llmModelId}>Saved model: {llmModelId}</option>
                  )}
                  {llmModels.map(model => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
                {modelsError && (
                  <p className="text-xs text-destructive">
                    Could not load model choices ({modelsError}). <button type="button" onClick={() => void loadModels()} className="underline cursor-pointer">Retry</button>
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TextField value={llmLookbackDays.toString()} onChange={v => setLlmLookbackDays(parseInt(v) || 0)} className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground font-medium">Context (Days Back)</Label>
                  <Input type="number" className="bg-background border border-input p-2 rounded-md text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                </TextField>
                <TextField value={llmMaxPosts.toString()} onChange={v => setLlmMaxPosts(parseInt(v) || 0)} className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground font-medium">Max Posts Analyzed</Label>
                  <Input type="number" className="bg-background border border-input p-2 rounded-md text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                </TextField>
              </div>
            </div>
            <div className="pt-4 flex justify-end">
              <Button onPress={generateInsights} isDisabled={generatingInsights || aiStatus?.state === "running"} className="inline-flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 font-medium text-xs py-1.5 px-4 rounded-md transition-colors disabled:opacity-50 outline-none cursor-pointer">
                {(generatingInsights || aiStatus?.state === "running") && <RefreshCw className="w-3 h-3 animate-spin" />}
                {generatingInsights ? "Dispatching..." : aiStatus?.state === "running" ? "Generating..." : "Regenerate Intelligence"}
              </Button>
            </div>
          </div>

          {/* Actions pinned at bottom */}
          <div className="px-6 py-4 border-t border-border flex gap-3 bg-muted/20">
            <Button onPress={saveConfig} isDisabled={configSaving} className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm py-2 px-5 rounded-md transition-colors disabled:opacity-50 outline-none cursor-pointer">
              {configSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {configSaving ? "Saving..." : "Save"}
            </Button>
            <Button onPress={forceScrape} isDisabled={forceScraping} className="inline-flex items-center gap-2 bg-background border border-input hover:bg-accent text-foreground font-medium text-sm py-2 px-5 rounded-md transition-colors disabled:opacity-50 outline-none cursor-pointer">
              {forceScraping && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {forceScraping ? "Dispatching..." : "Force Scrape"}
            </Button>
          </div>
        </section>

        {/* Deep Scrape Toolkit */}
        <section className="bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Deep Scrape Toolkit</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Paginated extraction under rate limits for full account history.</p>
          </div>

          <div className="p-6 space-y-5 flex-1">
            <div className="flex items-end gap-3">
              <TextField value={deepUsername} onChange={setDeepUsername} className="flex flex-col flex-1 gap-1">
                <Label className="text-xs text-muted-foreground font-medium">Target Username</Label>
                <Input placeholder="e.g. reddeer" className="bg-background border border-input p-2 rounded-md text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
              </TextField>
              <Button onPress={analyzeAccount} isDisabled={analyzing || !deepUsername} className="inline-flex items-center gap-2 bg-background border border-input hover:bg-accent text-foreground font-medium text-sm py-2 px-4 rounded-md transition-colors disabled:opacity-50 outline-none cursor-pointer">
                {analyzing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {analyzing ? "..." : "Analyze"}
              </Button>
            </div>

            {maxPosts !== null && (
              <div className="p-4 bg-muted/30 rounded-md border border-border space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Analysis Complete</h3>
                  <Badge>{maxPosts} Posts</Badge>
                </div>
                
                <TextField value={deepLimit.toString()} onChange={v => setDeepLimit(parseInt(v) || 0)} isDisabled={selectAll} className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground font-medium">Scrape Volume Limit</Label>
                  <Input type="number" max={maxPosts} className="bg-background border border-input p-2 rounded-md text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground" />
                </TextField>

                <Checkbox isSelected={selectAll} onChange={handleSelectAll} className="group flex gap-2.5 items-center text-sm font-medium text-foreground cursor-pointer">
                  <div className="w-4 h-4 rounded border border-border bg-background group-data-[selected]:bg-primary group-data-[selected]:border-primary flex items-center justify-center transition">
                    <svg className="w-2.5 h-2.5 text-primary-foreground opacity-0 group-data-[selected]:opacity-100 transition" viewBox="0 0 14 14" fill="none"><path d="M3 8L6 11L11 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  Select All
                </Checkbox>

                <div>
                  <Label className="block text-xs text-muted-foreground font-medium mb-1.5">Pagination Delay</Label>
                  <div className="flex gap-2">
                    <TextField value={delayH.toString()} onChange={v => setDelayH(parseInt(v) || 0)} className="flex-1 flex items-center gap-1.5 bg-background border border-input p-2 rounded-md focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition">
                      <Input min={0} type="number" className="w-10 bg-transparent text-center text-sm text-foreground outline-none" />
                      <span className="text-[10px] text-muted-foreground font-medium">hrs</span>
                    </TextField>
                    <TextField value={delayM.toString()} onChange={v => setDelayM(parseInt(v) || 0)} className="flex-1 flex items-center gap-1.5 bg-background border border-input p-2 rounded-md focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition">
                      <Input min={0} max={59} type="number" className="w-10 bg-transparent text-center text-sm text-foreground outline-none" />
                      <span className="text-[10px] text-muted-foreground font-medium">min</span>
                    </TextField>
                    <TextField value={delayS.toString()} onChange={v => setDelayS(parseInt(v) || 0)} className="flex-1 flex items-center gap-1.5 bg-background border border-input p-2 rounded-md focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition">
                      <Input min={0} max={59} type="number" className="w-10 bg-transparent text-center text-sm text-foreground outline-none" />
                      <span className="text-[10px] text-muted-foreground font-medium">sec</span>
                    </TextField>
                  </div>
                </div>

                <Button onPress={dispatchDeepScrape} isDisabled={deepScraping} className="w-full inline-flex items-center justify-center gap-2 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 font-medium text-sm py-2.5 px-6 rounded-md transition-colors disabled:opacity-50 outline-none cursor-pointer">
                  {deepScraping && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {deepScraping ? "Dispatching..." : "Start Deep Scrape"}
                </Button>
              </div>
            )}
          </div>
        </section>

      </div>

    </div>
  );
}
