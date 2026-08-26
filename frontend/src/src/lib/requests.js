// Shared vocabulary and date maths for the four employee request types.
// The filing forms, the approval queue and the calendar all read from here
// because they have to agree on what "3 days" means — if they drift,
// someone's balance is wrong and nobody can tell which screen is lying.

export const REQUEST_TYPES = {
  leave: { table: "leave_requests", label: "Leave", short: "Leave" },
  ob: { table: "ob_requests", label: "Official Business", short: "OB" },
  ot: { table: "ot_requests", label: "Overtime", short: "OT" },
  coa: {
    table: "coa_requests",
    label: "Certificate of Attendance",
    short: "COA",
  },
};

export const LEAVE_TYPES = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick" },
  { value: "unpaid", label: "Unpaid" },
  { value: "other", label: "Other" },
];

export const LEAVE_TYPE_LABEL = Object.fromEntries(
  LEAVE_TYPES.map((t) => [t.value, t.label]),
);

// Why the timekeeping record needs certifying. Worth capturing separately
// from the free-text reason: a run of 'device' filings is a broken scanner,
// which is a different problem from a run of 'forgot'.
export const COA_CAUSES = [
  { value: "forgot", label: "Forgot to log" },
  { value: "device", label: "Biometric / device failure" },
  { value: "outage", label: "System outage" },
  { value: "offsite", label: "Worked offsite" },
  { value: "other", label: "Other" },
];

export const COA_CAUSE_LABEL = Object.fromEntries(
  COA_CAUSES.map((c) => [c.value, c.label]),
);

export const STATUS_LABEL = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Withdrawn",
  confirmed: "Confirmed",
};

// Unpaid leave is still leave — it just does not draw down the quota.
// Mirrors the trigger rule in employee-requests.sql.
export const COUNTS_AGAINST_QUOTA = (type) => type !== "unpaid";

// Postgres `date` arrives as "2026-08-26". new Date() on that parses it as
// UTC midnight, which lands on the 25th for anyone west of Greenwich — so
// every date here is built from parts and stays local.
export function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Saturday and Sunday. Only the fallback now — the real answer comes from
// the employee's own rest days, via makeSchedule() in schedule.js.
export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

const FALLBACK_SCHEDULE = { isWorkingDay: (d) => !isWeekend(d) };

// Inclusive of both ends, non-working days excluded. Returns 0 for a range
// that is entirely rest days or holidays, which the forms treat as invalid
// rather than free.
//
// The schedule argument is what stops someone being charged quota for a
// holiday, or for their own rest day. Omitting it falls back to Sat/Sun,
// which is what every caller assumed before schedules existed.
export function workingDays(startISO, endISO, schedule = FALLBACK_SCHEDULE) {
  if (!startISO || !endISO) return 0;
  const start = parseDate(startISO);
  const end = parseDate(endISO);
  if (end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (schedule.isWorkingDay(cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// Maps dated ranges onto day-of-month keys for one month, so the calendar
// can look a day up without rescanning every request. Weekend days inside
// a range are skipped — they were never charged, so showing them would
// overstate what was taken. Used for both leave and OB.
export function spanByDay(requests, year, month, schedule = FALLBACK_SCHEDULE) {
  const byDay = {};
  requests.forEach((req) => {
    const cursor = parseDate(req.start_date);
    const end = parseDate(req.end_date);
    while (cursor <= end) {
      if (
        schedule.isWorkingDay(cursor) &&
        cursor.getFullYear() === year &&
        cursor.getMonth() === month
      ) {
        byDay[cursor.getDate()] = req;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  return byDay;
}

export function formatRange(startISO, endISO) {
  const start = parseDate(startISO);
  const end = parseDate(endISO);
  const opts = { day: "numeric", month: "short" };
  if (startISO === endISO) return start.toLocaleDateString(undefined, opts);
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  return sameMonth
    ? `${start.getDate()} – ${end.toLocaleDateString(undefined, opts)}`
    : `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

export function formatMinutes(mins) {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// A <input type="time"> value, "HH:mm", pulled off an instant. The forms
// ask for a date once and times separately, rather than making someone
// retype the same date into two datetime-local pickers.
export function toTimeInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Puts a date field and a time field back together as an instant.
//
// rollAfter carries the night-shift case: overtime from 22:00 to 01:30
// ends the following morning, and a certificate for a graveyard shift is
// the same shape. When the end time is at or before the start, the end
// belongs to the next day — without this it lands eight hours BEFORE the
// start and the duration comes out negative.
export function combineLocal(dateISO, timeHHMM, rollAfter = null) {
  if (!dateISO || !timeHHMM) return null;
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  if (rollAfter && timeHHMM <= rollAfter) dt.setDate(dt.getDate() + 1);
  return dt.toISOString();
}

// Minutes between two "HH:mm" values on the same filing, wrapping past
// midnight. Equal times give 0 rather than a full day, so the forms can
// treat that as "you have not entered a duration yet".
export function minutesBetweenTimes(startHHMM, endHHMM) {
  if (!startHHMM || !endHHMM) return 0;
  const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  let diff = toMinutes(endHHMM) - toMinutes(startHHMM);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

// One row shape for the hub list, whatever table it came from. Keeping the
// flattening here means the list component never has to know which columns
// belong to which type.
export function toSummary(kind, row) {
  const base = {
    key: `${kind}-${row.id}`,
    kind,
    id: row.id,
    status: row.status,
    created_at: row.created_at,
    decided_note: row.decided_note,
    raw: row,
  };

  if (kind === "leave") {
    return {
      ...base,
      when: formatRange(row.start_date, row.end_date),
      sortDate: row.start_date,
      headline: `${LEAVE_TYPE_LABEL[row.type]} leave`,
      detail: `${row.days} ${row.days === 1 ? "day" : "days"}${row.reason ? ` · ${row.reason}` : ""}`,
    };
  }
  if (kind === "ob") {
    return {
      ...base,
      when: formatRange(row.start_date, row.end_date),
      sortDate: row.start_date,
      headline: row.destination,
      detail: `${row.days} ${row.days === 1 ? "day" : "days"} · ${row.purpose}`,
    };
  }
  if (kind === "ot") {
    const variance =
      row.actual_minutes != null
        ? row.actual_minutes - row.planned_minutes
        : null;
    return {
      ...base,
      when: parseDate(row.work_date).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
      sortDate: row.work_date,
      headline: `Overtime · ${formatMinutes(row.planned_minutes)} planned`,
      detail:
        row.actual_minutes != null
          ? // Both signs are explicit. Math.abs strips the direction, and an
            // unsigned "(1h)" on an hour UNDER plan reads as an hour over it.
            `${formatMinutes(row.actual_minutes)} rendered${variance ? ` (${variance > 0 ? "+" : "-"}${formatMinutes(Math.abs(variance))})` : ""}`
          : row.reason,
      variance,
    };
  }
  // coa
  return {
    ...base,
    when: parseDate(row.work_date).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    }),
    sortDate: row.work_date,
    headline: COA_CAUSE_LABEL[row.cause] ?? "Certificate of attendance",
    detail: row.reason,
  };
}
