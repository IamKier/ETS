import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import ClockSection from "../components/ClockSection";
import CalendarSection from "../components/CalendarSection";
import StatRow from "../components/StatRow";
import RecentEntries from "../components/RecentEntries";

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
function summarise(rows, year, month, empStart) {
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

  // Absent = a past weekday in this month, on or after the employee's start
  // date, with no attendance row. Weekends never count. `expected` counts
  // the same set of days, which is what the hours target is measured against.
  const today = startOfDay(new Date());
  const lastDay = new Date(year, month + 1, 0).getDate();
  let absent = 0;
  let workdays = 0;

  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month, d);
    if (date >= today) break;
    const isWeekday = date.getDay() !== 0 && date.getDay() !== 6;
    const started = !empStart || date >= empStart;
    if (!isWeekday || !started) continue;
    workdays += 1;
    if (!byDay[d]) absent += 1;
  }

  return {
    onTime,
    late,
    lateMinutes,
    absent,
    workdays,
    hours: minutes / 60,
    expected: workdays * HOURS_PER_DAY,
    byDay,
  };
}

export default function DashboardPage({ userId, profile }) {
  const now = new Date();
  const [rows, setRows] = useState([]);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  // Bumped after a clock in/out so the calendar and stats refetch — they
  // used to keep showing pre-clock-in data until a manual reload.
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      // One query covering the previous month too, so the deltas cost no
      // extra round trip.
      const from = new Date(year, month - 1, 1);
      const to = new Date(year, month + 1, 0, 23, 59, 59);

      const { data } = await supabase
        .from("attendance")
        .select("clock_in, clock_out, status, late_minutes")
        .eq("user_id", userId)
        .gte("clock_in", from.toISOString())
        .lte("clock_in", to.toISOString())
        .order("clock_in", { ascending: true });

      if (cancelled) return;
      setRows(data ?? []);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, year, month, tick]);

  // Memoised so the identity is stable — a fresh Date every render would
  // re-run the summaries on every tick of the clock. The dependency is a
  // plain string binding, which the hooks lint can verify.
  const startDate = profile?.start_date ?? null;
  const empStart = useMemo(
    () => (startDate ? new Date(startDate) : null),
    [startDate],
  );

  const { current, previous } = useMemo(() => {
    const inMonth = (r, y, m) => {
      const d = new Date(r.clock_in);
      return d.getFullYear() === y && d.getMonth() === m;
    };
    const prev = new Date(year, month - 1, 1);
    return {
      current: summarise(
        rows.filter((r) => inMonth(r, year, month)),
        year,
        month,
        empStart,
      ),
      previous: summarise(
        rows.filter((r) => inMonth(r, prev.getFullYear(), prev.getMonth())),
        prev.getFullYear(),
        prev.getMonth(),
        empStart,
      ),
    };
  }, [rows, year, month, empStart]);

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

  return (
    <div className="page">
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
        {!loading && current.workdays > 0 && (
          <span className="section-note">
            {current.workdays} working {current.workdays === 1 ? "day" : "days"}{" "}
            so far
          </span>
        )}
      </div>

      <StatRow
        stats={current}
        previous={previous}
        prevLabel={prevLabel}
        loading={loading}
      />

      <div className="dash-grid">
        <div className="dash-col">
          <ClockSection
            userId={userId}
            shiftStart={profile?.shift_start}
            onChange={refresh}
          />
          <RecentEntries rows={monthRows} loading={loading} />
        </div>
        <CalendarSection
          year={year}
          month={month}
          byDay={current.byDay}
          empStart={empStart}
          canGoPrev={canGoPrev}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          loading={loading}
        />
      </div>
    </div>
  );
}
