import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { parseDate, toISODate } from "../lib/requests";
import {
  DAY_NAMES,
  DAY_SHORT,
  crossesMidnight,
  formatShiftRange,
  shiftMinutes,
} from "../lib/schedule";

const TABS = [
  { key: "roster", label: "Roster" },
  { key: "shifts", label: "Shifts" },
  { key: "holidays", label: "Holidays" },
];

const EMPTY_SHIFT = {
  name: "",
  start_time: "08:00",
  end_time: "17:00",
  break_minutes: 60,
  grace_minutes: 15,
};

const EMPTY_HOLIDAY = { date: "", name: "", type: "regular" };

function initials(name, email) {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email || "?").slice(0, 2).toUpperCase();
}

function hoursLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function SchedulingPage() {
  const [tab, setTab] = useState("roster");
  const [team, setTeam] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [saved, setSaved] = useState(null);
  const [notice, setNotice] = useState(null);
  const [tick, setTick] = useState(0);

  const [newShift, setNewShift] = useState(EMPTY_SHIFT);
  const [newHoliday, setNewHoliday] = useState(EMPTY_HOLIDAY);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [teamRes, shiftRes, holidayRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id, full_name, email, role, shift_id, rest_days")
          .order("full_name"),
        supabase.from("shifts").select("*").order("start_time"),
        supabase
          .from("holidays")
          .select("id, date, name, type")
          .gte("date", `${year}-01-01`)
          .lte("date", `${year}-12-31`)
          .order("date"),
      ]);

      if (cancelled) return;
      const err = [teamRes, shiftRes, holidayRes].find((r) => r.error)?.error;
      setNotice(err ? { type: "error", text: err.message } : null);
      setTeam(teamRes.data ?? []);
      setShifts(shiftRes.data ?? []);
      setHolidays(holidayRes.data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [tick, year]);

  // Saved straight away rather than behind a Save button. These are single
  // values, and a row of unsaved dropdowns across a whole team is the kind
  // of state someone navigates away from and loses.
  const patchEmployee = async (id, patch, label) => {
    setBusy(id);
    setNotice(null);
    const { error } = await supabase
      .from("employees")
      .update(patch)
      .eq("id", id);
    setBusy(null);

    if (error) {
      setNotice({ type: "error", text: error.message });
      refresh();
      return;
    }
    setTeam((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    setSaved({ id, label });
    window.setTimeout(
      () => setSaved((s) => (s?.id === id ? null : s)),
      1800,
    );
  };

  const toggleRestDay = (emp, day) => {
    const current = new Set(emp.rest_days ?? []);
    current.has(day) ? current.delete(day) : current.add(day);
    // The database refuses seven; catching it here explains why instead of
    // surfacing a constraint name.
    if (current.size === 7) {
      setNotice({
        type: "error",
        text: "Someone has to work at least one day a week.",
      });
      return;
    }
    patchEmployee(
      emp.id,
      { rest_days: [...current].sort((a, b) => a - b) },
      "Rest days saved",
    );
  };

  const addShift = async (e) => {
    e.preventDefault();
    setBusy("new-shift");
    setNotice(null);
    const { error } = await supabase.from("shifts").insert([
      {
        ...newShift,
        name: newShift.name.trim(),
        break_minutes: Number(newShift.break_minutes),
        grace_minutes: Number(newShift.grace_minutes),
      },
    ]);
    setBusy(null);
    if (error) {
      setNotice({
        type: "error",
        text: error.message.includes("shifts_name_key")
          ? "There is already a shift with that name."
          : error.message,
      });
      return;
    }
    setNewShift(EMPTY_SHIFT);
    refresh();
  };

  const toggleShiftActive = async (shift) => {
    setBusy(`shift-${shift.id}`);
    const { error } = await supabase
      .from("shifts")
      .update({ is_active: !shift.is_active })
      .eq("id", shift.id);
    setBusy(null);
    if (error) setNotice({ type: "error", text: error.message });
    else refresh();
  };

  const addHoliday = async (e) => {
    e.preventDefault();
    setBusy("new-holiday");
    setNotice(null);
    const { error } = await supabase
      .from("holidays")
      .insert([{ ...newHoliday, name: newHoliday.name.trim() }]);
    setBusy(null);
    if (error) {
      setNotice({
        type: "error",
        text: error.message.includes("holidays_date_key")
          ? "That date is already on the holiday list."
          : error.message,
      });
      return;
    }
    // Jump the list to the year just added to, or the new row is invisible.
    const addedYear = Number(newHoliday.date.slice(0, 4));
    setNewHoliday(EMPTY_HOLIDAY);
    if (addedYear !== year) setYear(addedYear);
    else refresh();
  };

  const removeHoliday = async (holiday) => {
    setBusy(`holiday-${holiday.id}`);
    const { error } = await supabase
      .from("holidays")
      .delete()
      .eq("id", holiday.id);
    setBusy(null);
    if (error) setNotice({ type: "error", text: error.message });
    else refresh();
  };

  const unassigned = team.filter((e) => !e.shift_id).length;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Scheduling</h1>
        <p className="page-sub">
          Who works which shift, on which days, and when the office is
          closed.
        </p>
      </header>

      <div className="tab-row" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === "roster" && unassigned > 0 && (
              <span className="tab-badge">{unassigned}</span>
            )}
          </button>
        ))}
      </div>

      {notice && (
        <div className={`form-message ${notice.type}`} role="alert">
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="card">
          <div className="entries-empty">Loading...</div>
        </div>
      ) : tab === "roster" ? (
        <>
          {unassigned > 0 && (
            <p className="form-hint is-warn">
              {unassigned} {unassigned === 1 ? "person has" : "people have"} no
              shift. Lateness for them falls back to 09:00 with 15 minutes
              grace.
            </p>
          )}
          <div className="card">
            <ul className="roster-list">
              {team.map((emp) => {
                const rest = new Set(emp.rest_days ?? []);
                return (
                  <li key={emp.id}>
                    <span className="avatar" aria-hidden="true">
                      {initials(emp.full_name, emp.email)}
                    </span>
                    <span className="roster-who">
                      <span className="roster-name">{emp.full_name}</span>
                      <span className="request-meta">{emp.email}</span>
                    </span>

                    <label className="roster-shift">
                      <span className="sr-only">
                        Shift for {emp.full_name}
                      </span>
                      <select
                        value={emp.shift_id ?? ""}
                        disabled={busy === emp.id}
                        onChange={(e) =>
                          patchEmployee(
                            emp.id,
                            {
                              shift_id: e.target.value
                                ? Number(e.target.value)
                                : null,
                            },
                            "Shift saved",
                          )
                        }
                      >
                        <option value="">No shift</option>
                        {shifts
                          .filter((s) => s.is_active || s.id === emp.shift_id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} · {formatShiftRange(s)}
                            </option>
                          ))}
                      </select>
                    </label>

                    <span
                      className="rest-picker"
                      role="group"
                      aria-label={`Rest days for ${emp.full_name}`}
                    >
                      {DAY_SHORT.map((short, day) => (
                        <button
                          key={day}
                          type="button"
                          className={`rest-day${rest.has(day) ? " is-rest" : ""}`}
                          disabled={busy === emp.id}
                          aria-pressed={rest.has(day)}
                          title={`${DAY_NAMES[day]} — ${rest.has(day) ? "rest day" : "working day"}`}
                          onClick={() => toggleRestDay(emp, day)}
                        >
                          {short}
                        </button>
                      ))}
                    </span>

                    <span className="roster-state">
                      {busy === emp.id ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : saved?.id === emp.id ? (
                        <span className="saved-flash">
                          <Check size={13} /> Saved
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="page-foot">
            Rest days are per person — the highlighted ones are days off.
            Leave and absence both skip them, so a Tuesday-to-Saturday
            roster is charged and marked correctly.
          </p>
        </>
      ) : tab === "shifts" ? (
        <>
          <div className="card">
            <ul className="request-list">
              {shifts.map((s) => {
                const overnight = crossesMidnight(s);
                const inUse = team.filter((e) => e.shift_id === s.id).length;
                return (
                  <li key={s.id} className={s.is_active ? undefined : "is-off"}>
                    <span className="shift-icon" aria-hidden="true">
                      {overnight ? <Moon size={15} /> : <Sun size={15} />}
                    </span>
                    <span className="request-main">
                      <span className="request-range">
                        {s.name} · {formatShiftRange(s)}
                      </span>
                      <span className="request-meta">
                        {hoursLabel(shiftMinutes(s))} paid ·{" "}
                        {s.break_minutes}m break · {s.grace_minutes}m grace
                        {overnight && " · crosses midnight"}
                      </span>
                      <span className="request-meta">
                        {inUse === 0
                          ? "Nobody assigned"
                          : `${inUse} ${inUse === 1 ? "person" : "people"}`}
                      </span>
                    </span>
                    <button
                      className="link-btn"
                      disabled={busy === `shift-${s.id}`}
                      onClick={() => toggleShiftActive(s)}
                    >
                      {s.is_active ? "Retire" : "Reinstate"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="section-head">
            <span className="eyebrow">New shift</span>
          </div>

          <div className="card card-pad">
            <form onSubmit={addShift}>
              <div className="field">
                <label htmlFor="sh-name">Name</label>
                <input
                  id="sh-name"
                  type="text"
                  placeholder="Early"
                  value={newShift.name}
                  onChange={(e) =>
                    setNewShift({ ...newShift, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="field-pair">
                <div className="field">
                  <label htmlFor="sh-start">Starts</label>
                  <input
                    id="sh-start"
                    type="time"
                    value={newShift.start_time}
                    onChange={(e) =>
                      setNewShift({ ...newShift, start_time: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="sh-end">Ends</label>
                  <input
                    id="sh-end"
                    type="time"
                    value={newShift.end_time}
                    onChange={(e) =>
                      setNewShift({ ...newShift, end_time: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div className="field-pair">
                <div className="field">
                  <label htmlFor="sh-break">Break (minutes)</label>
                  <input
                    id="sh-break"
                    type="number"
                    min="0"
                    value={newShift.break_minutes}
                    onChange={(e) =>
                      setNewShift({
                        ...newShift,
                        break_minutes: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="sh-grace">Grace (minutes)</label>
                  <input
                    id="sh-grace"
                    type="number"
                    min="0"
                    value={newShift.grace_minutes}
                    onChange={(e) =>
                      setNewShift({
                        ...newShift,
                        grace_minutes: e.target.value,
                      })
                    }
                    required
                  />
                </div>
              </div>
              <p className="form-hint">
                {newShift.end_time <= newShift.start_time
                  ? "Ends the next morning — this is a night shift."
                  : `${hoursLabel(shiftMinutes({ ...newShift, break_minutes: Number(newShift.break_minutes) }))} paid after the break.`}
              </p>
              <button
                type="submit"
                className="btn-primary"
                disabled={busy === "new-shift"}
              >
                {busy === "new-shift" && (
                  <LoaderCircle size={16} className="spin" />
                )}
                Add shift
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <div className="section-head">
            <span className="eyebrow">{year}</span>
            <span className="year-nav">
              <button className="link-btn" onClick={() => setYear((y) => y - 1)}>
                {year - 1}
              </button>
              <button className="link-btn" onClick={() => setYear((y) => y + 1)}>
                {year + 1}
              </button>
            </span>
          </div>

          <div className="card">
            {holidays.length === 0 ? (
              <div className="entries-empty">
                No holidays recorded for {year}.
              </div>
            ) : (
              <ul className="request-list">
                {holidays.map((h) => {
                  const d = parseDate(h.date);
                  return (
                    <li key={h.id}>
                      <span className="holiday-date">
                        <strong>{d.getDate()}</strong>
                        <span>
                          {d.toLocaleDateString(undefined, { month: "short" })}
                        </span>
                      </span>
                      <span className="request-main">
                        <span className="request-range">{h.name}</span>
                        <span className="request-meta">
                          {d.toLocaleDateString(undefined, { weekday: "long" })}
                        </span>
                      </span>
                      <span
                        className={`pill ${h.type === "regular" ? "pill-approved" : "pill-pending"}`}
                      >
                        {h.type === "regular" ? "Regular" : "Special"}
                      </span>
                      <button
                        className="entry-fix is-always"
                        title={`Remove ${h.name}`}
                        aria-label={`Remove ${h.name}`}
                        disabled={busy === `holiday-${h.id}`}
                        onClick={() => removeHoliday(h)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="section-head">
            <span className="eyebrow">Add a holiday</span>
          </div>

          <div className="card card-pad">
            <form onSubmit={addHoliday}>
              <div className="field-pair">
                <div className="field">
                  <label htmlFor="hol-date">Date</label>
                  <input
                    id="hol-date"
                    type="date"
                    value={newHoliday.date}
                    onChange={(e) =>
                      setNewHoliday({ ...newHoliday, date: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="hol-type">Type</label>
                  <select
                    id="hol-type"
                    value={newHoliday.type}
                    onChange={(e) =>
                      setNewHoliday({ ...newHoliday, type: e.target.value })
                    }
                  >
                    <option value="regular">Regular</option>
                    <option value="special">Special non-working</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="hol-name">Name</label>
                <input
                  id="hol-name"
                  type="text"
                  placeholder="Christmas Day"
                  value={newHoliday.name}
                  onChange={(e) =>
                    setNewHoliday({ ...newHoliday, name: e.target.value })
                  }
                  required
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={busy === "new-holiday"}
              >
                {busy === "new-holiday" && (
                  <LoaderCircle size={16} className="spin" />
                )}
                <Plus size={15} /> Add holiday
              </button>
            </form>
          </div>

          <p className="page-foot">
            A holiday stops the day counting as absent and takes it out of
            expected hours, for everyone. Today is {toISODate(new Date())}.
          </p>
        </>
      )}
    </div>
  );
}
