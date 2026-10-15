import * as React from "react";
import { cn } from "@/lib/utils";
import { sectionHeadingClass, surfaceClass } from "@/components/ui/styles";

type CardProps = React.HTMLAttributes<HTMLElement> & { as?: "div" | "article" | "section"; ref?: React.Ref<HTMLElement> };

/** The page's one container: a tinted surface with no border. Never nest one in another. */
export function Card({ as: Tag = "div", className, ref, ...props }: CardProps) {
  // One ref type for all three tags; each is an HTMLElement at runtime.
  return <Tag ref={ref as React.Ref<HTMLDivElement>} className={cn(surfaceClass, "p-5 sm:p-6", className)} {...props} />;
}

export function CardHeader({ title, description, action, id, className }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <h3 id={id} className="text-base font-semibold leading-snug text-foreground">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** A titled group within a card; spacing separates subsections instead of rules or nested boxes. */
export function CardSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      {children}
    </div>
  );
}

/** A page section with the uppercase heading. The only place uppercase is used. */
export function Section({ title, id, description, action, children, className }: {
  title: string;
  id: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("scroll-mt-4", className)}>
      <div className="mb-3 flex min-h-5 items-center justify-between gap-3">
        <h2 id={id} className={sectionHeadingClass}>{title}</h2>
        {action}
      </div>
      {description && <p className="-mt-1 mb-3 max-w-prose text-sm text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}
