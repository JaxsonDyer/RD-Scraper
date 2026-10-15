"use client";

import { useEffect, useState } from "react";
import { formatDateTime, formatRelative, type DateInput } from "@/lib/format-date";

// Re-render every minute so "12 min ago" doesn't go stale while the page stays open.
function useNow(interval = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

/** Relative time ("2 days ago") with the full date and time on hover. */
export function RelativeTime({ value, className }: { value: DateInput; className?: string }) {
  const now = useNow();
  const iso = value instanceof Date ? value.toISOString() : value;
  return (
    <time dateTime={iso} title={formatDateTime(value)} className={className}>
      {formatRelative(value, now)}
    </time>
  );
}
