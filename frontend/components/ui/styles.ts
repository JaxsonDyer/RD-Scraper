// Shared class recipes. Kept free of "use client" so server components (login, run
// details) can style native elements and links with the same vocabulary.
import { cva, type VariantProps } from "class-variance-authority";

export const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const buttonVariants = cva(
  `inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors ${focusRing} disabled:cursor-default disabled:opacity-50 data-[disabled]:cursor-default data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0`,
  {
    variants: {
      variant: {
        // The one main action in a view.
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Everyday actions: refresh, analyze, paging.
        secondary: "bg-muted/60 text-foreground hover:bg-muted",
        // Low-emphasis actions that sit inside content: back links, row actions.
        ghost: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        // Removes or discards something.
        destructive: "text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "min-h-10 px-3.5 text-sm",
        sm: "min-h-8 px-2.5 text-xs [&_svg]:size-3.5",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);
export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export const labelClass = "text-xs font-medium text-muted-foreground";
export const inputClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60";

// Every container on a page is this one tinted surface; only tables add a border.
export const surfaceClass = "rounded-xl bg-muted/45";
export const tableFrameClass = "overflow-x-auto rounded-xl border border-border bg-muted/45";

export const sectionHeadingClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
