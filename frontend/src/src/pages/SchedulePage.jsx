import { useEffect, useState } from "react";
import { CalendarOff, Coffee, Moon, Sun } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { formatMinutes, toISODate } from "../lib/requests";
import {
  DAY_NAMES,
  DAY_SHORT,
  DEFAULT_REST_DAYS,
  crossesMidnight,
  formatShiftRange,
  formatTime,
  lateAfterMinutes,
  shiftMinutes,
  upcomingHolidays,
} from "../lib/schedule";

export default function SchedulePage({ profile }) {
  const [shift, setShift] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  const shiftId = profile?.shift_id ?? null;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const thisYear = new Date().getFullYear();
      const [shiftRes, holidayRes] = await Promise.all([
        shiftId
          ? supabase
              .from("shifts")
              .select("name, start_time, end_time, break_minutes, grace_minutes")
              .eq("id", shiftId)
              .single()
          : Promise.resolve({ data: null }),
        supabase
          .from("holidays")
          .select("date, name, type")
          .gte("date", `${thisYear}-01-01`)
          .lte("date", `${thisYear}-12-31`)
          .order("date"),
      ]);

      if (cancelled) return;
      setShift(shiftRes.data ?? null);
      setHolidays(holidayRes.data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  const restDays = profile?.rest_days?.length
    ? profile.rest_days
    : DEFAULT_REST_DAYS;
  const restSet = new Set(restDays);
  const overnight = crossesMidnight(shift);
  const paid = shiftMinutes(shift);
  const lateAfter = lateAfterMinutes(shift);
  const lateLabel = `${String(Math.floor(lateAfter / 60)).padStart(2, "0")}:${String(lateAfter % 60).padStart(2, "0")}`;

  const today = new Date();
  const next = upcomingHolidays(holidays, today, 6);
  const todayHoliday = holidays.find((h) => h.date === toISODate(today));
  const workingToday = !restSet.has(today.getDay()) && !todayHoliday;

  return (
    <div className="page">
      <header className="page-head">
        <h1>My schedule</h1>
        <p className="page-sub">
          The shift you are rostered on, your rest days, and the holidays
          coming up.
        </p>
      </header>

      {loading ? (
        <div className="card">
          <div className="entries-empty">Loading...</div>
        </div>
      ) : (
        <>
          <div className="schedule-today">
            {workingToday ? (
              <>
                <Sun size={18} aria-hidden="true" />
                <span>
                  <strong>Working today.</strong>{" "}
                  {shift
                    ? `${formatShiftRange(shift)} — clock in by ${lateLabel} to be on time.`
                    : "No shift assigned yet, so lateness uses the default 09:00."}
                </span>
              </>
            ) : (
              <>
                <CalendarOff size={18} aria-hidden="true" />
                <span>
                  <strong>
                    {todayHoliday ? todayHoliday.name : "Rest day"}.
                  </strong>{" "}
                  Not expected in — nothing today counts towards attendance.
                </span>
              </>
            )}
          </div>

          <div className="section-head">
            <span className="eyebrow">Shift</span>
          </div>

          <div className="card card-pad">
            {shift ? (
              <>
                <div className="shift-head">
                  <span className="shift-name">
                    {overnight ? (
                      <Moon size={16} aria-hidden="true" />
                    ) : (
                      <Sun size={16} aria-hidden="true" />
                    )}
                    {shift.name}
                  </span>
                  <span className="shift-range">{formatShiftRange(shift)}</span>
                </div>
                {overnight && (
                  <p className="shift-note">
                    Crosses midnight — the end time is the following morning.
                  </p>
                )}
                <div className="detail-list">
                  <div>
                    <span>Paid hours</span>
                    <strong>{formatMinutes(paid)}</strong>
                  </div>
                  <div>
                    <span>
                      <Coffee size={13} aria-hidden="true" /> Break
                    </span>
                    <strong>{formatMinutes(shift.break_minutes)}</strong>
                  </div>
                  <div>
                    <span>Grace period</span>
                    <strong>
                      {shift.grace_minutes
                        ? `${shift.grace_minutes} min — late after ${lateLabel}`
                        : "None — late from the minute the shift starts"}
                    </strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="entries-empty">
                No shift assigned. Ask HR to put you on one — until then,
                lateness is measured against {formatTime("09:00")}.
              </div>
            )}
          </div>

          <div className="section-head">
            <span className="eyebrow">Working week</span>
            <span className="section-note">
              {7 - restSet.size} working{" "}
              {7 - restSet.size === 1 ? "day" : "days"} a week
            </span>
          </div>

          <div className="week-row">
            {DAY_NAMES.map((name, i) => {
              const rest = restSet.has(i);
              return (
                <div
                  key={name}
                  className={`week-day${rest ? " is-rest" : ""}${i === today.getDay() ? " is-today" : ""}`}
                >
                  <span className="week-day-name" aria-hidden="true">
                    {DAY_SHORT[i]}
                  </span>
                  <span className="week-day-state">
                    {rest ? "Rest" : shift ? formatTime(shift.start_time) : "Work"}
                  </span>
                  <span className="sr-only">
                    {name}: {rest ? "rest day" : "working day"}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="section-head">
            <span className="eyebrow">Holidays ahead</span>
          </div>

          <div className="card">
            {next.length === 0 ? (
              <div className="entries-empty">
                No more holidays on the calendar this year.
              </div>
            ) : (
              <ul className="request-list">
                {next.map((h) => {
                  // A holiday landing on a rest day changes nothing, and
                  // saying so beats letting someone plan around it.
                  const onRest = restSet.has(h.dateObj.getDay());
                  return (
                    <li key={h.date}>
                      <span className="holiday-date">
                        <strong>{h.dateObj.getDate()}</strong>
                        <span>
                          {h.dateObj.toLocaleDateString(undefined, {
                            month: "short",
                          })}
                        </span>
                      </span>
                      <span className="request-main">
                        <span className="request-range">{h.name}</span>
                        <span className="request-meta">
                          {h.dateObj.toLocaleDateString(undefined, {
                            weekday: "long",
                          })}
                          {onRest && " · already your rest day"}
                        </span>
                      </span>
                      <span
                        className={`pill ${h.type === "regular" ? "pill-approved" : "pill-pending"}`}
                      >
                        {h.type === "regular" ? "Regular" : "Special"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="page-foot">
            Rest days and holidays are excluded from leave: a request
            spanning them is only charged for the days you would have
            worked.
          </p>
        </>
      )}
    </div>
  );
}
