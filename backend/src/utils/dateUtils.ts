// ─── Date Utilities ────────────────────────────────────────────────────────────

/**
 * Returns today's date in "YYYY-MM-DD" format (local time).
 */
export function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Validates that a string is a valid "YYYY-MM-DD" date.
 */
export function isValidDateString(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date);
  return !isNaN(d.getTime());
}

/**
 * Converts 24-hour time string "HH:MM" to 12-hour "H:MM AM/PM".
 */
export function to12Hour(time24: string): string {
  const [hourStr, minuteStr] = time24.split(":");
  let hour = parseInt(hourStr, 10);
  const minute = minuteStr ?? "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

/**
 * Formats a time slot label from start and end 24-hour times.
 * e.g. ("08:00", "09:00") → "8:00 AM – 9:00 AM"
 */
export function formatSlotLabel(startTime: string, endTime: string): string {
  return `${to12Hour(startTime)} – ${to12Hour(endTime)}`;
}

/**
 * Formats a date string for display.
 * e.g. "2024-03-15" → "Friday, March 15, 2024"
 */
export function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
