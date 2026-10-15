import * as React from "react";
import { cn } from "@/lib/utils";
import { tableFrameClass } from "@/components/ui/styles";

/**
 * Tables are the one bordered element. `stickyHeader` keeps column names visible while the
 * frame scrolls (pair it with a max height in `className`).
 */
export function TableFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn(tableFrameClass, className)}>{children}</div>;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-sm", className)} {...props} />;
}

export function TableHead({ sticky, className, children }: { sticky?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <thead className={cn(sticky && "sticky top-0 z-10 bg-muted", className)}>
      <tr className="border-b border-border text-xs text-muted-foreground">{children}</tr>
    </thead>
  );
}

type Align = { align?: "left" | "right" | "center" };
// Literal class names so Tailwind can find them.
const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };

export function Th({ align = "left", className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & Align) {
  return (
    <th
      scope="col"
      className={cn("px-3 py-2.5 font-medium whitespace-nowrap", ALIGN[align], className)}
      {...props}
    />
  );
}

export function Td({ align = "left", className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & Align) {
  return <td className={cn("px-3 py-3", ALIGN[align], className)} {...props} />;
}

export function Tr({ interactive, className, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn("border-b border-border last:border-0", interactive && "cursor-pointer transition-colors hover:bg-muted/40", className)}
      {...props}
    />
  );
}
