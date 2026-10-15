"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/spinner";
import { useNow } from "@/components/relative-time";
import { Table, TableFrame, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { formatDayHeading, formatDayKey, formatTime } from "@/lib/format-date";
import { formatDuration, getRunDetail, getRunErrorSummary, getRunStatus, getRunTask, type RunStatus } from "@/lib/run-history";
import type { Run } from "./types";

const STATUS_ICON: Record<RunStatus["label"], typeof CheckCircle2> = {
  Success: CheckCircle2, Warning: TriangleAlert, Failed: AlertCircle, Running: RefreshCw, Queued: Clock3,
};

function StatusBadge({ run }: { run: Run }) {
  const status = getRunStatus(run);
  const Icon = STATUS_ICON[status.label];
  const badge = (
    <Badge variant={status.variant}>
      <Icon aria-hidden="true" className={status.label === "Running" ? "animate-spin motion-reduce:animate-none" : undefined} />
      {status.label}
    </Badge>
  );
  if (status.label !== "Warning" && status.label !== "Failed") return badge;
  const summary = getRunErrorSummary(run.error);
  // Hover shows the summary; selecting opens the run with its full error.
  return (
    <Link href={`/scraper/runs/${encodeURIComponent(run.id)}`} title={summary} aria-label={`${status.label}: ${summary}. View run details.`}
      className="group -mr-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {badge}
      <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground group-hover:text-foreground" />
    </Link>
  );
}

/** runs: newest first; null until the first status check returns. */
export function ActivitySection({ runs, timeZone }: { runs: Run[] | null; timeZone: string }) {
  const now = useNow();
  const days: { key: string; heading: string; runs: Run[] }[] = [];
  for (const run of runs ?? []) {
    const key = formatDayKey(run.created_at, { timeZone });
    if (days.at(-1)?.key !== key) days.push({ key, heading: formatDayHeading(run.created_at, now, { timeZone }), runs: [] });
    days.at(-1)!.runs.push(run);
  }

  return (
    <Section title="Activity" id="activity" description={`Scrapes, deep scrapes and insight runs, newest first. Times are in ${timeZone}.`}>
      {runs === null ? <LoadingState label="Loading activity..." className="justify-start p-0" /> : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has run yet. Runs appear here once they are queued.</p>
      ) : (
        <TableFrame className="max-h-[32rem] overflow-auto">
          <Table>
            <TableHead sticky>
              <Th className="w-24">Time</Th>
              <Th>Task</Th>
              <Th className="hidden md:table-cell">Duration</Th>
              <Th align="right">Status</Th>
            </TableHead>
            {days.map(day => (
              <tbody key={day.key}>
                <tr className="border-y border-border bg-muted/40">
                  <th colSpan={4} scope="rowgroup" className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">{day.heading}</th>
                </tr>
                {day.runs.map(run => {
                  const detail = getRunDetail(run);
                  const start = run.started_at ? Date.parse(run.started_at) : null;
                  const end = run.completed_at ? Date.parse(run.completed_at) : null;
                  return (
                    <Tr key={run.id}>
                      <Td className="py-2.5 whitespace-nowrap tabular-nums text-muted-foreground">{formatTime(run.created_at, { timeZone })}</Td>
                      <Td className="py-2.5">
                        <p className="font-medium text-foreground">{getRunTask(run.kind)}</p>
                        {detail && <p className="text-xs text-muted-foreground tabular-nums">{detail}</p>}
                      </Td>
                      <Td className="hidden py-2.5 whitespace-nowrap tabular-nums text-muted-foreground md:table-cell">
                        {start && end ? formatDuration(end - start) : "—"}
                      </Td>
                      <Td align="right" className="py-1.5"><StatusBadge run={run} /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            ))}
          </Table>
        </TableFrame>
      )}
    </Section>
  );
}
