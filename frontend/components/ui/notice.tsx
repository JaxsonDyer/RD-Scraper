import * as React from "react";
import { AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** An inline message about the state of the page: an error to recover from, or a status. */
export function Notice({ tone = "info", action, children, className }: {
  tone?: "info" | "error";
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" ? AlertCircle : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 text-sm",
        tone === "error" ? "bg-destructive/10 text-destructive" : "bg-muted/45 text-muted-foreground",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</div>
      {action}
    </div>
  );
}
