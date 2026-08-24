import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Each status carries a glyph as well as a colour, so the calendar stays
// readable without relying on colour perception alone.
const STATUS = {
  present: { glyph: "✓", label: "On time", color: "var(--success)" },
  late: { glyph: "!", label: "Late", color: "var(--warning)" },
  absent: { glyph: "×", label: "Absent", color: "var(--danger)" },
};

function getMonthDays(year, month, startDay = 1) {
  const date = new Date(year, month, startDay);
  const days = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

export default function CalendarSection({ userId }) {
  const [attendance, setAttendance] = useState({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [startDay, setStartDay] = useState(1);

  const [empStartDate, setEmpStartDate] = useState(null);
  const today = new Date();

  useEffect(() => {
    const fetchProfileAndAttendance = async () => {
      // Get employee start date
      const { data: profile } = await supabase
        .from("employees")
        .select("start_date")
        .eq("id", userId)
        .single();

      let start = new Date(year, month, 1);
      let startDayNum = 1;
      let empStart = null;
      if (profile && profile.start_date) {
        empStart = new Date(profile.start_date);
        setEmpStartDate(empStart);
        if (empStart.getFullYear() === year && empStart.getMonth() === month) {
          start = empStart;
          startDayNum = empStart.getDate();
        }
      }
      setStartDay(startDayNum);
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const { data } = await supabase
        .from("attendance")
        .select("clock_in, status")
        .eq("user_id", userId)
        .gte("clock_in", start.toISOString())
        .lte("clock_in", end);
      const att = {};
      if (data) {
        data.forEach((row) => {
          const d = new Date(row.clock_in).getDate();
          att[d] = row.status;
        });
      }
      setAttendance(att);
    };
    if (userId) fetchProfileAndAttendance();
  }, [userId, year, month]);

  // Only allow navigation to months after start date
  let canGoPrev = true;
  if (empStartDate) {
    if (
      year < empStartDate.getFullYear() ||
      (year === empStartDate.getFullYear() && month <= empStartDate.getMonth())
    ) {
      canGoPrev = false;
    }
  }

  const goPrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goNext = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const days = getMonthDays(year, month, startDay);
  const firstDay = new Date(year, month, startDay).getDay();
  const monthLabel = new Date(year, month, 1).toLocaleString("default", {
    month: "long",
  });

  return (
    <div className="calendar-section">
      <div className="calendar-header">
        <button
          className="calendar-nav"
          onClick={goPrev}
          disabled={!canGoPrev}
          aria-label="Previous month"
        >
          &lt;
        </button>
        <span>
          {monthLabel} {year}
        </span>
        <button
          className="calendar-nav"
          onClick={goNext}
          aria-label="Next month"
        >
          &gt;
        </button>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar-weekday" aria-hidden="true">
            {d.slice(0, 1)}
          </div>
        ))}
        {[...Array(firstDay)].map((_, i) => (
          <div key={"empty-" + i} />
        ))}
        {days.map((date) => {
          const d = date.getDate();
          const status = attendance[d];
          let key = null;
          if (status === "on-time") key = "present";
          else if (status === "late") key = "late";
          else if (date < today && !status) key = "absent";

          const meta = key ? STATUS[key] : null;
          return (
            <div
              key={d}
              className={`calendar-day${key ? " " + key : ""}`}
              data-glyph={meta?.glyph}
              title={meta ? `${d} — ${meta.label}` : String(d)}
            >
              {d}
            </div>
          );
        })}
      </div>

      <div className="calendar-legend">
        {Object.entries(STATUS).map(([k, meta]) => (
          <span key={k}>
            <i className="legend-swatch" style={{ background: meta.color }} />
            {meta.label}
          </span>
        ))}
      </div>
    </div>
  );
}
