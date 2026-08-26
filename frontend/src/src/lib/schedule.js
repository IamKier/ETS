// Which days an employee is expected to work.
//
// This used to be the expression `day === 0 || day === 6`, repeated in five
// places. Anyone on a Tuesday-to-Saturday roster was charged leave for
// their real rest day and marked Absent on days they were never rostered.
// Everything that asks "was this a working day" now asks here.

import { parseDate, toISODate } from "./requests.js";

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const DAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// What the app assumed before this module existed. Kept as the fallback so
// an employee with no schedule row behaves exactly as they used to rather
// than suddenly being expected seven days a week.
export const DEFAULT_REST_DAYS = [0, 6];

// Builds the working-day test once per render pass. Holidays arrive as
// rows from the holidays table; rest days as getDay() numbers.
export function makeSchedule({ restDays, holidays = [] } = {}) {
  const rest = new Set(
    Array.isArray(restDays) && restDays.length ? restDays : DEFAULT_REST_DAYS,
  );
  const byDate = new Map(holidays.map((h) => [h.date, h]));

  const isRestDay = (date) => rest.has(date.getDay());
  const holidayOn = (date) => byDate.get(toISODate(date)) ?? null;

  return {
    restDays: [...rest].sort(),
    holidays,
    isRestDay,
    holidayOn,
    isHoliday: (date) => byDate.has(toISODate(date)),
    // The single question the rest of the app actually asks.
    isWorkingDay: (date) => !isRestDay(date) && !byDate.has(toISODate(date)),
  };
}

// The schedule the app falls back to before anything has loaded, so no
// caller has to null-check.
export const DEFAULT_SCHEDULE = makeSchedule();

export function restDayLabel(restDays = DEFAULT_REST_DAYS) {
  const days = [...restDays].sort();
  if (!days.length) return "None";
  if (days.length === 7) return "Every day";
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

// "09:00:00" -> "9:00 AM", in the viewer's own locale rather than a
// hardcoded format.
export function formatTime(time) {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatShiftRange(shift) {
  if (!shift) return "Not assigned";
  return `${formatTime(shift.start_time)} – ${formatTime(shift.end_time)}`;
}

// Paid minutes in a shift, break excluded, wrapping past midnight. Mirrors
// shift_minutes() in schedule.sql — both have to agree or the hours target
// on the dashboard disagrees with anything the database computes.
export function shiftMinutes(shift) {
  if (!shift) return 0;
  const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  let span = toMinutes(shift.end_time) - toMinutes(shift.start_time);
  if (span <= 0) span += 24 * 60;
  return Math.max(0, span - (shift.break_minutes ?? 0));
}

export function crossesMidnight(shift) {
  return Boolean(shift) && shift.end_time <= shift.start_time;
}

// The point after which a clock-in is late, as minutes from midnight.
export function lateAfterMinutes(shift) {
  if (!shift) return 9 * 60 + 15;
  const [h, m] = shift.start_time.split(":").map(Number);
  return h * 60 + (m || 0) + (shift.grace_minutes ?? 0);
}

// Holidays falling on or after `from`, soonest first. Rest days are not
// filtered out — a holiday on a rest day is still worth seeing, it just
// changes nothing.
export function upcomingHolidays(holidays, from = new Date(), limit = 5) {
  const cutoff = toISODate(from);
  return holidays
    .filter((h) => h.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
    .map((h) => ({ ...h, dateObj: parseDate(h.date) }));
}
