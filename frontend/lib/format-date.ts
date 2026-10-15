// One formatter for every date the app shows, so the same moment reads the same everywhere.

const LOCALE = "en-CA";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type DateInput = string | Date;
type Options = { timeZone?: string };

// Plain "YYYY-MM-DD" values are calendar days, not instants. Treated as UTC midnight they
// shift to the previous evening in Alberta, so they are always formatted in UTC instead.
function parse(value: DateInput) {
  const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return { date: value instanceof Date ? value : new Date(value), dateOnly };
}

function format(value: DateInput, parts: Intl.DateTimeFormatOptions, options: Options = {}) {
  const { date, dateOnly } = parse(value);
  if (Number.isNaN(date.getTime())) return "";
  const timeZone = dateOnly ? "UTC" : options.timeZone;
  return new Intl.DateTimeFormat(LOCALE, { ...parts, timeZone }).format(date);
}

/** "Oct 14, 2026" */
export function formatDate(value: DateInput, options?: Options) {
  return format(value, { dateStyle: "medium" }, options);
}

/** "Oct 14, 2026, 9:39 p.m." — a calendar day falls back to formatDate. */
export function formatDateTime(value: DateInput, options?: Options & { seconds?: boolean }) {
  if (parse(value).dateOnly) return formatDate(value);
  return format(value, { dateStyle: "medium", timeStyle: options?.seconds ? "medium" : "short" }, options);
}

/** "9:39 p.m." */
export function formatTime(value: DateInput, options?: Options) {
  return format(value, { timeStyle: "short" }, options);
}

/** "Oct 14": compact chart axes. */
export function formatShortDate(value: DateInput, options?: Options) {
  return format(value, { month: "short", day: "numeric" }, options);
}

/** "Wed, Oct 14, 2026" */
export function formatWeekdayDate(value: DateInput, options?: Options) {
  return format(value, { weekday: "short", month: "short", day: "numeric", year: "numeric" }, options);
}

/**
 * "just now", "12 min ago", "3 hr ago", "yesterday", "2 days ago"; anything a month or
 * older shows its date. Calendar days are compared by day, since they carry no time.
 */
export function formatRelative(value: DateInput, now: number = Date.now()) {
  const { date, dateOnly } = parse(value);
  if (Number.isNaN(date.getTime())) return "";
  if (dateOnly) {
    const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
    const days = Math.round((today - date.getTime()) / DAY);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return days < 30 ? `${days} days ago` : formatDate(value);
  }
  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} hr ago`;
  const days = Math.floor(elapsed / DAY);
  if (days === 1) return "yesterday";
  return days < 30 ? `${days} days ago` : formatDate(value);
}
