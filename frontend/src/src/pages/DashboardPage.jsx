import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import ClockSection from "../components/ClockSection";
import CalendarSection from "../components/CalendarSection";
import StatRow from "../components/StatRow";

function greet(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

      const { data } = await supabase
        .from("attendance")
        .select("clock_in, clock_out, status, late_minutes")
        .eq("user_id", userId)
        .gte("clock_in", monthStart.toISOString())
        .lte("clock_in", monthEnd.toISOString())
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
  // re-run the stats useMemo on every tick of the clock. The dependency is
  // a plain string binding, which the hooks lint can verify.
  const startDate = profile?.start_date ?? null;
  const empStart = useMemo(
    () => (startDate ? new Date(startDate) : null),
    [startDate],
  );

  // Day-of-month -> record, for both the calendar and the absent count.
  const byDay = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      map[new Date(r.clock_in).getDate()] = r;
    });
    return map;
  }, [rows]);

  const stats = useMemo(() => {
    let onTime = 0;
    let late = 0;
    let minutes = 0;

    rows.forEach((r) => {
      if (r.status === "late") late += 1;
      else onTime += 1;
      if (r.clock_out) {
        minutes += (new Date(r.clock_out) - new Date(r.clock_in)) / 60000;
      }
    });

    // Absent = a past weekday in this month, on or after the employee's
    // start date, with no attendance row. Weekends never count.
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const lastDay = new Date(year, month + 1, 0).getDate();
    let absent = 0;
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(year, month, d);
      if (date >= startOfToday) break;
      const weekday = date.getDay() !== 0 && date.getDay() !== 6;
      const started = !empStart || date >= empStart;
      if (weekday && started && !byDay[d]) absent += 1;
    }

    return { onTime, late, absent, hours: minutes / 60 };
  }, [rows, byDay, year, month, empStart]);

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

  const firstName = (profile?.full_name || "").split(" ")[0];
  const viewingLabel = new Date(year, month, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
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
      </div>

      <StatRow stats={stats} loading={loading} />

      <div className="dash-grid">
        <ClockSection
          userId={userId}
          shiftStart={profile?.shift_start}
          onChange={refresh}
        />
        <CalendarSection
          year={year}
          month={month}
          byDay={byDay}
          empStart={empStart}
          canGoPrev={canGoPrev}
          onPrev={goPrev}
          onNext={goNext}
          loading={loading}
        />
      </div>
    </div>
  );
}
