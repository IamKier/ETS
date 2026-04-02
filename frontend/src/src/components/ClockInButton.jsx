import { supabase } from "../../supabaseClient";
import { Clock } from "lucide-react";

const ClockInButton = ({ userId }) => {
  const handleClockIn = async () => {
    const now = new Date();

    // Set the "Late" threshold (9:15 AM today)
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
    }
  };

  return (
    <button
      onClick={handleClockIn}
      style={{ padding: "10px 20px", cursor: "pointer" }}
    >
      <Clock size={16} /> Clock In
    </button>
  );
};

export default ClockInButton;
