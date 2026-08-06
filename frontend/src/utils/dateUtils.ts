// ─── Frontend Date Utilities ───────────────────────────────────────────────────
import { format, isToday, isTomorrow, parseISO } from "date-fns";

/**
 * Returns today's date as "YYYY-MM-DD".
 */
export function todayString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * Formats a "YYYY-MM-DD" string for display.
 * Uses friendly labels (Today, Tomorrow) when applicable.
 * e.g. "today" → "Today, March 15"
 */
export function formatDateDisplay(dateStr: string): string {
  // parseISO interprets YYYY-MM-DD as UTC; adjust to local
  const date = new Date(dateStr + "T00:00:00");
  if (isToday(date)) return `Today, ${format(date, "MMMM d")}`;
  if (isTomorrow(date)) return `Tomorrow, ${format(date, "MMMM d")}`;
  return format(date, "EEEE, MMMM d, yyyy");
}

/**
 * Returns a list of dates (as "YYYY-MM-DD") starting from today,
 * for N days.
 */
export function getDateRange(days = 14): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    result.push(format(d, "yyyy-MM-dd"));
  }
  return result;
}

/**
 * Short label for a date — used in the date picker strip.
 * e.g. "2024-03-15" → { dayOfWeek: "Fri", dayNumber: "15", month: "Mar" }
 */
export function getDateLabel(dateStr: string): {
  dayOfWeek: string;
  dayNumber: string;
  month: string;
} {
  const date = new Date(dateStr + "T00:00:00");
  return {
    dayOfWeek: format(date, "EEE"),
    dayNumber: format(date, "d"),
    month: format(date, "MMM"),
  };
}
