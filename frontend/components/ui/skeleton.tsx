import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("rounded bg-muted animate-pulse motion-reduce:animate-none", className)} />;
}

/** Placeholder lines for a paragraph that is still loading. */
export function TextSkeleton({ lines = 4 }: { lines?: number }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-2/3"];
  return (
    <div className="space-y-2.5 py-1" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cn("h-3", widths[i % widths.length])} />)}
    </div>
  );
}
