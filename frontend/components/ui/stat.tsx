import * as React from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceClass } from "@/components/ui/styles";
import { Skeleton } from "@/components/ui/skeleton";

export type Delta = { label: string; direction: "up" | "down" | "flat" };
const DELTA_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight };

/** A compact metric tile. `hint` is supporting context; `delta` renders only with real trend data. */
export function Stat({ label, value, hint, delta, className }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: Delta;
  className?: string;
}) {
  const DeltaIcon = delta && DELTA_ICON[delta.direction];
  return (
    <div className={cn(surfaceClass, "min-w-0 px-4 py-3", className)}>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold leading-tight tracking-tight text-foreground tabular-nums sm:text-2xl">{value}</p>
      {delta && DeltaIcon && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <DeltaIcon className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
          {delta.label}
        </p>
      )}
      {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className={cn(surfaceClass, "px-4 py-3")} aria-hidden="true">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2.5 h-6 w-24" />
    </div>
  );
}
