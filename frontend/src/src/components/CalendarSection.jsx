import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";

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
  const [profile, setProfile] = useState(null);
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
      setProfile(profile);
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
  const days = getMonthDays(year, month, startDay);
  const firstDay = new Date(year, month, startDay).getDay();

  return (
    <div className="calendar-section">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => setMonth((m) => (m === 0 ? 11 : m - 1))}
          disabled={!canGoPrev}
        >
          &lt;
        </button>
        <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>
          {today.toLocaleString("default", { month: "long" })} {year}
        </span>
        <button onClick={() => setMonth((m) => (m === 11 ? 0 : m + 1))}>
          &gt;
        </button>
      </div>
      <div className="calendar-grid">
        {[...Array(firstDay)].map((_, i) => (
          <div key={"empty-" + i}></div>
        ))}
        {days.map((date) => {
          const d = date.getDate();
          let status = attendance[d];
          let className = "calendar-day";
          if (status === "on-time") className += " present";
          else if (status === "late") className += " late";
          else if (date < today && !status) className += " absent";
          return (
            <div key={d} className={className}>
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}
