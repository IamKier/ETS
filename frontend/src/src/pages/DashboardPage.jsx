import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import ClockSection from "../components/ClockSection";
import CalendarSection from "../components/CalendarSection";
import StatRow from "../components/StatRow";
import RecentEntries from "../components/RecentEntries";
import ViewMenu from "../components/ViewMenu";
import { spanByDay, toISODate } from "../lib/requests";
import { PANELS, DEFAULT_VIEW, readView, writeView } from "../lib/dashboardView";
import { DEFAULT_SCHEDULE, makeSchedule, shiftMinutes } from "../lib/schedule";

const HOURS_PER_DAY = 8;

function greet(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Rolls one month's rows into the numbers the tiles show. Kept as a plain
// function so the same code produces the current month and the one before
// it, which is what the deltas compare against.
function summarise(
  rows,
  year,
  month,
  empStart,
  leaveDays = {},
  obDays = {},
  schedule = DEFAULT_SCHEDULE,
  dayMinutes = HOURS_PER_DAY * 60,
) {
  let onTime = 0;
  let late = 0;
  let lateMinutes = 0;
  let minutes = 0;
  const byDay = {};

  rows.forEach((r) => {
    byDay[new Date(r.clock_in).getDate()] = r;
    if (r.status === "late") {
      late += 1;
      lateMinutes += r.late_minutes ?? 0;
    } else onTime += 1;
    if (r.clock_out) {
      minutes += (new Date(r.clock_out) - new Date(r.clock_in)) / 60000;
    }
  });

  // Absent = a past working day in this month, on or after the employee's
  // start date, with no attendance row and no approved leave. Rest days and
  // holidays never count — which days those are is the employee's own
  // schedule, not a fixed Sat/Sun. `expected` counts the same set of days,
  // which is what the hours target is measured against.
  const today = startOfDay(new Date());
  const lastDay = new Date(year, month + 1, 0).getDate();
  let absent = 0;
  let workdays = 0;
  let onLeave = 0;
  let onOB = 0;
  let holidays = 0;

  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month, d);
    if (date >= today) break;
    const started = !empStart || date >= empStart;
    if (!started) continue;
    // Counted separately so the month summary can say why a day was not
    // expected, rather than silently shrinking the total.
    if (schedule.isHoliday(date) && !schedule.isRestDay(date)) {
      holidays += 1;
      continue;
    }
    if (!schedule.isWorkingDay(date)) continue;

    // Approved leave was neither worked nor missed. It comes out of the
    // expected total rather than counting as an absence — otherwise taking
    // the holiday you are owed damages your own attendance record.
    if (leaveDays[d] && !byDay[d]) {
      onLeave += 1;
      continue;
    }

    workdays += 1;

    // Official business is worked time with no clock behind it. It stays
    // in the expected total and is credited a standard day, so an OB week
    // reads as worked rather than as a hole in the hours meter.
    if (obDays[d] && !byDay[d]) {
      onOB += 1;
      minutes += dayMinutes;
      continue;
    }

    if (!byDay[d]) absent += 1;
  }

  return {
    onTime,
    late,
    lateMinutes,
    absent,
    onLeave,
    onOB,
    holidays,
    workdays,
    hours: minutes / 60,
    expected: (workdays * dayMinutes) / 60,
    byDay,
  };
}

export default function DashboardPage({ userId, profile }) {
  const now = new Date();
  const [rows, setRows] = useState([]);
  const [leave, setLeave] = useState([]);
  const [ob, setOb] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [shift, setShift] = useState(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  // Bumped after a clock in/out so the calendar and stats refetch — they
  // used to keep showing pre-clock-in data until a manual reload.
  const [tick, setTick] = useState(0);
  // Passed as the initialiser, not called: reading localStorage on every
  // render would be wasted work for a value that only changes on click.
  const [view, setView] = useState(readView);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const changeView = useCallback((next) => {
    setView(next);
    writeView(next);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      // One query covering the previous month too, so the deltas cost no
      // extra round trip.
      const from = new Date(year, month - 1, 1);
      const to = new Date(year, month + 1, 0, 23, 59, 59);

      const [attendance, leaveRes, obRes, holidayRes, shiftRes] = await Promise.all([
        supabase
          .from("attendance")
          .select("id, clock_in, clock_out, status, late_minutes")
          .eq("user_id", userId)
          .gte("clock_in", from.toISOString())
          .lte("clock_in", to.toISOString())
          .order("clock_in", { ascending: true }),
        // Overlap, not containment: a request that starts in the previous
        // month and ends in this one has to colour days in both.
        supabase
          .from("leave_requests")
          .select("id, type, start_date, end_date, reason")
          .eq("user_id", userId)
          .eq("status", "approved")
          .lte("start_date", toISODate(to))
          .gte("end_date", toISODate(from)),
        supabase
          .from("ob_requests")
          .select("id, start_date, end_date, destination, purpose")
          .eq("user_id", userId)
          .eq("status", "approved")
          .lte("start_date", toISODate(to))
          .gte("end_date", toISODate(from)),
        // Holidays are read for the whole window, not just the visible
        // month, because the previous month feeds the deltas.
        supabase
          .from("holidays")
          .select("date, name, type")
          .gte("date", toISODate(from))
          .lte("date", toISODate(to)),
        profile?.shift_id
          ? supabase
              .from("shifts")
              .select("name, start_time, end_time, break_minutes, grace_minutes")
              .eq("id", profile.shift_id)
              .single()
          : Promise.resolve({ data: null }),
      ]);

      if (cancelled) return;
      setRows(attendance.data ?? []);
      setLeave(leaveRes.data ?? []);
      setOb(obRes.data ?? []);
      setHolidays(holidayRes.data ?? []);
      setShift(shiftRes.data ?? null);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, year, month, tick, profile?.shift_id]);

  // Memoised so the identity is stable — a fresh Date every render would
  // re-run the summaries on every tick of the clock. The dependency is a
  // plain string binding, which the hooks lint can verify.
  const startDate = profile?.start_date ?? null;
  const empStart = useMemo(
    () => (startDate ? new Date(startDate) : null),
    [startDate],
  );

  const restDays = profile?.rest_days;
  const schedule = useMemo(
    () => makeSchedule({ restDays, holidays }),
    [restDays, holidays],
  );

  // A shift's paid span, break excluded. Falls back to the flat eight hour
  // day for anyone not yet assigned one.
  const dayMinutes = shift ? shiftMinutes(shift) : HOURS_PER_DAY * 60;

  const monthLeave = useMemo(
    () => spanByDay(leave, year, month, schedule),
    [leave, year, month, schedule],
  );

  const monthOB = useMemo(
    () => spanByDay(ob, year, month, schedule),
    [ob, year, month, schedule],
  );

  const { current, previous } = useMemo(() => {
    const inMonth = (r, y, m) => {
      const d = new Date(r.clock_in);
      return d.getFullYear() === y && d.getMonth() === m;
    };
    const prev = new Date(year, month - 1, 1);
    const prevLeave = spanByDay(leave, prev.getFullYear(), prev.getMonth(), schedule);
    const prevOB = spanByDay(ob, prev.getFullYear(), prev.getMonth(), schedule);
    return {
      current: summarise(
        rows.filter((r) => inMonth(r, year, month)),
        year,
        month,
        empStart,
        monthLeave,
        monthOB,
        schedule,
        dayMinutes,
      ),
      previous: summarise(
        rows.filter((r) => inMonth(r, prev.getFullYear(), prev.getMonth())),
        prev.getFullYear(),
        prev.getMonth(),
        empStart,
        prevLeave,
        prevOB,
        schedule,
        dayMinutes,
      ),
    };
  }, [
    rows,
    leave,
    ob,
    monthLeave,
    monthOB,
    year,
    month,
    empStart,
    schedule,
    dayMinutes,
  ]);

  const monthRows = useMemo(
    () =>
      rows.filter((r) => {
        const d = new Date(r.clock_in);
        return d.getFullYear() === year && d.getMonth() === month;
      }),
    [rows, year, month],
  );

  const canGoPrev = !(
    empStart &&
    (year < empStart.getFullYear() ||
      (year === empStart.getFullYear() && month <= empStart.getMonth()))
  );

  const goPrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };

  const goNext = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };

  const goToday = () => {
    const d = new Date();
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const firstName = (profile?.full_name || "").split(" ")[0];
  const viewingLabel = new Date(year, month, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  const prevLabel = new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
  });

  const { compact, panels } = view;
  // The left column and the calendar each disappear on their own, so the
  // two-column grid has to stand down to one rather than leave a 320px
  // gutter where a hidden panel used to be.
  const leftColumn = panels.clock || panels.entries;
  const oneColumn = !leftColumn || !panels.calendar;
  const allHidden = PANELS.every((panel) => !panels[panel.key]);

  return (
    <div className={`page${compact ? " is-compact" : ""}`}>
      <header className="page-head">
        <h1>
          {greet(now.getHours())}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="page-sub">
          {now.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>

      <div className="section-head">
        <span className="eyebrow">{viewingLabel}</span>
        <div className="section-head-end">
          {!loading && current.workdays > 0 && (
            <span className="section-note">
              {current.workdays} working{" "}
              {current.workdays === 1 ? "day" : "days"} so far
              {current.onLeave > 0 && `, ${current.onLeave} on leave`}
              {current.onOB > 0 && `, ${current.onOB} on OB`}
              {current.holidays > 0 &&
                `, ${current.holidays} ${current.holidays === 1 ? "holiday" : "holidays"}`}
            </span>
          )}
          <ViewMenu view={view} onChange={changeView} />
        </div>
      </div>

      {panels.stats && (
        <StatRow
          stats={current}
          previous={previous}
          prevLabel={prevLabel}
          loading={loading}
        />
      )}

      {/* Turning every panel off is a legitimate thing to want — a blank
          page with no way back out of it is not. */}
      {allHidden && (
        <div className="dash-empty">
          <p>Every panel is hidden.</p>
          <button
            type="button"
            className="link-btn"
            onClick={() => changeView({ ...view, panels: DEFAULT_VIEW.panels })}
          >
            Show them again
          </button>
        </div>
      )}

      {!allHidden && (
      <div className={`dash-grid${oneColumn ? " is-single" : ""}`}>
        {leftColumn && (
          <div className="dash-col">
            {panels.clock && (
              <ClockSection userId={userId} shift={shift} onChange={refresh} />
            )}
            {panels.entries && (
              <RecentEntries
                rows={monthRows}
                loading={loading}
                userId={userId}
                onChange={refresh}
                compact={compact}
              />
            )}
          </div>
        )}
        {panels.calendar && (
          <CalendarSection
            year={year}
            month={month}
            byDay={current.byDay}
            leaveByDay={monthLeave}
            obByDay={monthOB}
            schedule={schedule}
            empStart={empStart}
            canGoPrev={canGoPrev}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            loading={loading}
          />
        )}
      </div>
      )}
    </div>
  );
}
