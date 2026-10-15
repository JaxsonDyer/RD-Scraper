"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";
type Toast = { id: number; tone: Tone; message: string };
type Notify = (message: string) => void;

const ToastContext = createContext<Record<Tone, Notify> | null>(null);

// Errors stay up longer: they usually need reading, and often explain what to change.
const DURATION: Record<Tone, number> = { success: 4000, info: 5000, error: 9000 };
const ICON = { success: CheckCircle2, error: AlertCircle, info: Info };
const ACCENT: Record<Tone, string> = {
  success: "text-emerald-400",
  error: "text-destructive",
  info: "text-primary",
};
// Older messages drop off once this many are on screen.
const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const schedule = useCallback((id: number, tone: Tone) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => dismiss(id), DURATION[tone]));
  }, [dismiss]);

  const show = useCallback((tone: Tone, message: string) => {
    const id = nextId.current++;
    setToasts(current => [...current, { id, tone, message }].slice(-MAX_VISIBLE));
    schedule(id, tone);
  }, [schedule]);

  const notify = useMemo(() => ({
    success: (message: string) => show("success", message),
    error: (message: string) => show("error", message),
    info: (message: string) => show("info", message),
  }), [show]);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end sm:p-6"
      >
        {toasts.map(toast => {
          const Icon = ICON[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              // Pause while someone is reading or about to dismiss it.
              onMouseEnter={() => clearTimeout(timers.current.get(toast.id))}
              onMouseLeave={() => schedule(toast.id, toast.tone)}
              onFocus={() => clearTimeout(timers.current.get(toast.id))}
              onBlur={() => schedule(toast.id, toast.tone)}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-popover p-3.5 pr-2 text-sm text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${ACCENT[toast.tone]}`} aria-hidden="true" />
              <p className="min-w-0 flex-1 break-words leading-relaxed">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "-my-1 size-8")}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useToast must be used inside ToastProvider");
  return notify;
}
