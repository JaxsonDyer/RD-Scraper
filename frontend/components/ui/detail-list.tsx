import * as React from "react";
import { cn } from "@/lib/utils";

/** Label/value pairs: run information, post metadata, insight job status. */
export function DetailList({ items, className }: {
  items: { label: string; value: React.ReactNode; mono?: boolean }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-8 gap-y-4 sm:grid-cols-2", className)}>
      {items.map(({ label, value, mono }) => (
        <div key={label} className="min-w-0 space-y-0.5">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className={cn("text-sm text-foreground tabular-nums [overflow-wrap:anywhere]", mono && "font-mono text-xs leading-5")}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
