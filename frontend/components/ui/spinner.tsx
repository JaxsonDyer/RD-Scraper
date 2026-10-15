import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <RefreshCw aria-hidden="true" className={cn("size-4 animate-spin motion-reduce:animate-none", className)} />;
}

/** Inline "working on it" line for a whole view or panel. */
export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <p role="status" className={cn("flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground", className)}>
      <Spinner /> {label}
    </p>
  );
}
