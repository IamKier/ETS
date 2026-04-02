import { supabase } from "../../supabaseClient";
import { Clock } from "lucide-react";

const ClockOutButton = ({ userId }) => {
  const handleClockOut = async () => {
    const now = new Date();
    // Find the latest clock-in record for this user that does not have a clock_out
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
    }
  };

  return (
    <button
      onClick={handleClockOut}
      style={{ padding: "10px 20px", cursor: "pointer" }}
    >
      <Clock size={16} /> Clock Out
    </button>
  );
};

export default ClockOutButton;
