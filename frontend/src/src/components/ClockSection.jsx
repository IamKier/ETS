import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";

export default function ClockSection({ userId }) {
  const [time, setTime] = useState(new Date());
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchClockStatus = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("attendance")
        .select("id")
        .eq("user_id", userId)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1);
      setIsClockedIn(data && data.length > 0);
      setLoading(false);
    };
    if (userId) fetchClockStatus();
  }, [userId]);

  const formatTime = (date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return (
      `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}` + ` ${ampm}`
    );
  };

  const handleClockIn = async () => {
    const now = new Date();
    const threshold = new Date();
    threshold.setHours(9, 15, 0);
    const isLate = now > threshold;
    const lateMinutes = isLate ? Math.floor((now - threshold) / 60000) : 0;
    const { error } = await supabase.from("attendance").insert([
      {
        user_id: userId,
        clock_in: now.toISOString(),
        is_late: isLate,
        late_minutes: lateMinutes,
        status: isLate ? "late" : "on-time",
      },
    ]);
    if (error) {
      alert("Error: " + error.message);
    } else {
      alert(
        isLate
          ? `Clocked in! You are ${lateMinutes} mins late.`
          : "Clocked in on time!",
      );
      setIsClockedIn(true);
    }
  };

  const handleClockOut = async () => {
    const now = new Date();
    const { data, error: fetchError } = await supabase
      .from("attendance")
      .select("id")
      .eq("user_id", userId)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1);
    if (fetchError || !data || data.length === 0) {
      alert("No active clock-in found for clock out.");
      return;
    }
    const attendanceId = data[0].id;
    const { error: updateError } = await supabase
      .from("attendance")
      .update({ clock_out: now.toISOString() })
      .eq("id", attendanceId);
    if (updateError) {
      alert("Error: " + updateError.message);
    } else {
      alert("Clocked out successfully!");
      setIsClockedIn(false);
    }
  };

  return (
    <div className="clock-section">
      <div className="clock-time">{formatTime(time)}</div>
      <div className="clock-buttons">
        {loading ? (
          <div>Loading...</div>
        ) : isClockedIn ? (
          <button className="clock-out-btn" onClick={handleClockOut}>
            Clock Out
          </button>
        ) : (
          <button className="clock-in-btn" onClick={handleClockIn}>
            Clock In
          </button>
        )}
      </div>
    </div>
  );
}
