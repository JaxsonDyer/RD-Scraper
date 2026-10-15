"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardSection, Section } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { SelectField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { NumberField } from "@/components/ui/number-field";
import { RelativeTime } from "@/components/relative-time";
import { useToast } from "@/components/toast";
import { SaveBar } from "./save-bar";
import { errorMessage, type AiStatus, type Config, type SaveConfig } from "./types";

type LlmModel = { id: string; name: string; free?: boolean };
type Draft = Config["llm_config"];

const STATE = {
  idle: { label: "Not generated yet", variant: "muted", Icon: Clock3 },
  queued: { label: "Queued", variant: "muted", Icon: Clock3 },
  running: { label: "Generating", variant: "muted", Icon: RefreshCw },
  success: { label: "Up to date", variant: "success", Icon: CheckCircle2 },
  error: { label: "Failed", variant: "destructive", Icon: AlertCircle },
} as const;

export function InsightsSection({ config, saveConfig, status, onQueued, timeZone }: {
  config: Config;
  saveConfig: SaveConfig;
  status: AiStatus | null;
  /** Called once a regeneration is queued, to refresh status right away. */
  onQueued: () => void;
  timeZone: string;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(config.llm_config);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const saved = config.llm_config;
  const dirty = draft.model !== saved.model || draft.lookback_days !== saved.lookback_days || draft.max_posts !== saved.max_posts;
  const busy = status?.state === "queued" || status?.state === "running";
  const state = STATE[status?.state ?? "idle"];

  const loadModels = async () => {
    try {
      const response = await fetch("/api/llm-models");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const list: unknown = await response.json();
      if (!Array.isArray(list) || list.length === 0) throw new Error("No models configured");
      setModels(list);
      setModelsError(null);
    } catch (error) {
      setModelsError(errorMessage(error, "Could not load models"));
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void loadModels(), 0);
    return () => clearTimeout(timer);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveConfig(() => ({ llm_config: draft }));
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Could not save AI insight settings."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Regenerating always uses saved settings, so save pending edits first.
  const regenerate = async () => {
    if (dirty && !(await save())) return;
    setStarting(true);
    try {
      const response = await fetch("/api/generate-insights", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Could not start insight generation.");
      onQueued();
      toast.success(dirty ? "Settings saved. Regenerating insights." : "Regenerating insights.");
    } catch (error) {
      toast.error(errorMessage(error, "Could not start insight generation."));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Section title="AI insights" id="insights-heading"
      description="Summarizes recent posts from accounts in the daily scrape for Overview. Regenerates on its own after each scrape.">
      <Card>
        <div className="space-y-8">
          <div className="space-y-4">
            <Badge variant={status ? state.variant : "muted"}>
              <state.Icon aria-hidden="true" className={status?.state === "running" ? "animate-spin motion-reduce:animate-none" : undefined} />
              {status ? state.label : "Checking"}
            </Badge>
            <DetailList items={[
              { label: "Last updated", value: status?.last_refreshed ? <RelativeTime value={status.last_refreshed} timeZone={timeZone} /> : "Never" },
              { label: "Model used", value: status?.active_model || status?.configured_model || saved.model },
            ]} />
            {status?.state === "error" && status.error && <Notice tone="error">{status.error}</Notice>}
          </div>

          <CardSection title="Settings">
            <SelectField label="Model" value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })}>
              {!models.some(model => model.id === draft.model) && <option value={draft.model}>Saved model: {draft.model}</option>}
              {[
                { label: "Free", models: models.filter(model => model.free) },
                { label: "Paid (uses OpenRouter credits)", models: models.filter(model => !model.free) },
              ].filter(group => group.models.length > 0).map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                </optgroup>
              ))}
            </SelectField>
            {modelsError && (
              <Notice tone="error" action={<Button size="sm" variant="ghost" onPress={() => void loadModels()}>Retry</Button>}>
                Could not load model choices ({modelsError}).
              </Notice>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField label="Analysis period (days)" value={draft.lookback_days} onChange={lookback_days => setDraft({ ...draft, lookback_days })}
                min={1} max={365} description="Covers posts from this many days, compared with the period before." />
              <NumberField label="Standout posts to analyze" value={draft.max_posts} onChange={max_posts => setDraft({ ...draft, max_posts })}
                min={1} max={250} description="Top posts the model reads, plus up to half as many that fell short." />
            </div>
          </CardSection>
        </div>
        <SaveBar dirty={dirty} saving={saving} onSave={() => void save().then(ok => ok && toast.success("AI insight settings saved."))}
          onDiscard={() => setDraft(saved)} saveLabel="Save settings">
          <Button onPress={() => void regenerate()} loading={starting || status?.state === "running"} isDisabled={busy || saving}
            icon={<Sparkles className="text-muted-foreground" aria-hidden="true" />}>
            {status?.state === "queued" ? "Queued" : status?.state === "running" ? "Generating..." : dirty ? "Save and regenerate" : "Regenerate"}
          </Button>
        </SaveBar>
      </Card>
    </Section>
  );
}
