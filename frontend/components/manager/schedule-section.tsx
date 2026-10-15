"use client";

import { useState } from "react";
import { Card, CardSection, Section } from "@/components/ui/card";
import { Checkbox, SelectField } from "@/components/ui/field";
import { NumberField } from "@/components/ui/number-field";
import { useToast } from "@/components/toast";
import { formatClockTime } from "@/lib/format-date";
import { SaveBar } from "./save-bar";
import { errorMessage, type Config, type SaveConfig } from "./types";

type Draft = Pick<Config, "scheduler_enabled" | "daily_run_time" | "post_lookback_days" | "incremental_post_limit">;

const fromConfig = (config: Config): Draft => ({
  scheduler_enabled: config.scheduler_enabled,
  daily_run_time: config.daily_run_time,
  post_lookback_days: config.post_lookback_days,
  incremental_post_limit: config.incremental_post_limit,
});

// Every 15 minutes, labelled the way times read everywhere else ("12:00 a.m.").
const TIMES = Array.from({ length: 96 }, (_, i) =>
  `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

export function ScheduleSection({ config, saveConfig, timeZone }: { config: Config; saveConfig: SaveConfig; timeZone: string }) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => fromConfig(config));
  const [saving, setSaving] = useState(false);
  const saved = fromConfig(config);
  const dirty = (Object.keys(saved) as (keyof Draft)[]).some(key => draft[key] !== saved[key]);
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  // A time saved before the 15-minute list existed still needs to show.
  const times = TIMES.includes(draft.daily_run_time) ? TIMES : [...TIMES, draft.daily_run_time].sort();

  const save = async () => {
    setSaving(true);
    try {
      await saveConfig(() => draft);
      toast.success(draft.scheduler_enabled ? `Schedule saved. Scrapes run daily at ${formatClockTime(draft.daily_run_time)}.` : "Schedule saved. Automatic scraping is off.");
    } catch (error) {
      toast.error(errorMessage(error, "Could not save the schedule."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Schedule" id="schedule-heading" description="When scrapes run on their own, and how much each scrape collects.">
      <Card>
        <div className="space-y-8">
          <CardSection title="Automatic scraping">
            <Checkbox isSelected={draft.scheduler_enabled} onChange={set("scheduler_enabled")}>Scrape automatically every day</Checkbox>
            <SelectField label={`Time of day (${timeZone})`} value={draft.daily_run_time} disabled={!draft.scheduler_enabled}
              onChange={event => set("daily_run_time")(event.target.value)} className="sm:max-w-64">
              {times.map(time => <option key={time} value={time}>{formatClockTime(time)}</option>)}
            </SelectField>
            {!draft.scheduler_enabled && (
              <p className="text-xs text-muted-foreground">While this is off, accounts are only scraped when you choose Run scrape now.</p>
            )}
          </CardSection>

          <CardSection title="Each scrape collects">
            <p className="-mt-1.5 text-xs text-muted-foreground">Applies to scheduled scrapes and to Run scrape now.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField label="Posts from the last (days)" value={draft.post_lookback_days} onChange={set("post_lookback_days")}
                min={1} max={3650} description="Older posts are skipped. Separate from the AI insights period." />
              <NumberField label="Max posts per account" value={draft.incremental_post_limit} onChange={set("incremental_post_limit")}
                min={1} max={5000} description="A safety cap on each scrape, for accounts that post a lot." />
            </div>
          </CardSection>
        </div>
        <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={() => setDraft(saved)} saveLabel="Save schedule" />
      </Card>
    </Section>
  );
}
