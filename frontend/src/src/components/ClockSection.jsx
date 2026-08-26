import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { supabase } from "../../supabaseClient";

import { lateAfterMinutes } from "../lib/schedule";

// Only used when no shift is assigned; the shift's own grace_minutes wins
// wherever there is one.
const FALLBACK_LATE_AFTER = 9 * 60 + 15;

function formatClock(date) {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatElapsed(ms) {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// The instant today after which a clock-in counts as late: the shift's
// start plus its own grace period. The database applies the same rule when
// HR approves a certificate of attendance.
function lateThreshold(shift) {
  const minutes = shift ? lateAfterMinutes(shift) : FALLBACK_LATE_AFTER;
  const t = new Date();
  t.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return t;
}

export default function ClockSection({ userId, shift, onChange }) {
  const [time, setTime] = useState(new Date());
  const [openRow, setOpenRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const fetchOpen = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("attendance")
        .select("id, clock_in")
        .eq("user_id", userId)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1);
      if (cancelled) return;
      setOpenRow(data?.[0] ?? null);
      setLoading(false);
    };

    fetchOpen();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleClockIn = async () => {
    setBusy(true);
    setNotice(null);
    const now = new Date();
    const threshold = lateThreshold(shift);
    const isLate = now > threshold;
    const lateMinutes = isLate ? Math.floor((now - threshold) / 60000) : 0;

    const { data, error } = await supabase
      .from("attendance")
      .insert([
        {
          user_id: userId,
          clock_in: now.toISOString(),
          is_late: isLate,
          late_minutes: lateMinutes,
          status: isLate ? "late" : "on-time",
        },
      ])
      .select("id, clock_in")
      .single();

    setBusy(false);
    if (error) {
      setNotice({ type: "error", text: error.message });
      return;
    }
    setOpenRow(data);
    setNotice({
      type: isLate ? "warn" : "success",
      text: isLate
        ? `Clocked in — ${lateMinutes} min late.`
        : "Clocked in on time.",
    });
    onChange?.();
  };

  const handleClockOut = async () => {
    if (!openRow) return;
    setBusy(true);
    setNotice(null);

    const { error } = await supabase
      .from("attendance")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", openRow.id);

    setBusy(false);
    if (error) {
      setNotice({ type: "error", text: error.message });
      return;
    }
    const worked = formatElapsed(new Date() - new Date(openRow.clock_in));
    setOpenRow(null);
    setNotice({ type: "success", text: `Clocked out — ${worked} logged.` });
    onChange?.();
  };

  const clockedIn = Boolean(openRow);
  const since = openRow ? new Date(openRow.clock_in) : null;

  return (
    <section className="clock-section">
      <div className="clock-time">{formatClock(time)}</div>

      <div className={`clock-status${clockedIn ? " on" : ""}`}>
        {loading ? (
          "Checking status..."
        ) : clockedIn ? (
          <>
            <span className="pulse-dot" aria-hidden="true" />
            Since{" "}
            {since.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
            <span className="clock-elapsed">{formatElapsed(time - since)}</span>
          </>
        ) : (
          "Not clocked in"
        )}
      </div>

      {!loading &&
        (clockedIn ? (
          <button
            className="clock-out-btn"
            onClick={handleClockOut}
            disabled={busy}
          >
            {busy && <LoaderCircle size={16} className="spin" />}
            {busy ? "Saving..." : "Clock Out"}
          </button>
        ) : (
          <button
            className="clock-in-btn"
            onClick={handleClockIn}
            disabled={busy}
          >
            {busy && <LoaderCircle size={16} className="spin" />}
            {busy ? "Saving..." : "Clock In"}
          </button>
        ))}

      {notice && (
        <div className={`form-message ${notice.type}`} role="status">
          {notice.text}
        </div>
      )}
    </section>
  );
}
