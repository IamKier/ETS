import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { supabase } from "../../supabaseClient";
import {
  COA_CAUSES,
  COUNTS_AGAINST_QUOTA,
  LEAVE_TYPES,
  REQUEST_TYPES,
  combineLocal,
  formatMinutes,
  minutesBetweenTimes,
  toISODate,
  toTimeInput,
  workingDays,
} from "../lib/requests";

const today = () => toISODate(new Date());

// Each type starts from its own shape. Kept as a factory so reopening the
// dialog never inherits the last filing's values.
//
// Dates and times are separate fields throughout. A datetime-local pair
// made someone type the same date twice more after already answering
// "Date", and the two pickers together were wider than the modal.
const initial = (kind, entry) => {
  if (kind === "leave")
    return { type: "vacation", start_date: "", end_date: "", reason: "" };
  if (kind === "ob")
    return {
      start_date: "",
      end_date: "",
      destination: "",
      purpose: "",
      contact: "",
    };
  if (kind === "ot")
    return { work_date: "", start_time: "18:00", end_time: "20:00", reason: "" };
  return {
    work_date: entry ? toISODate(new Date(entry.clock_in)) : "",
    // An entry with no clock_out is exactly the case a certificate exists
    // for, so the default proposes an end rather than leaving it blank.
    in_time: toTimeInput(entry?.clock_in) || "08:00",
    out_time: toTimeInput(entry?.clock_out) || "17:00",
    cause: entry ? "other" : "forgot",
    reason: "",
  };
};

export default function RequestDialog({
  kind,
  userId,
  remaining = 0,
  entry = null,
  schedule,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() => initial(kind, entry));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Rest days and holidays are not chargeable, so the count the employee
  // is shown — and the number written to the row — excludes them.
  const days =
    kind === "leave" || kind === "ob"
      ? workingDays(form.start_date, form.end_date, schedule)
      : 0;
  const otMinutes =
    kind === "ot" ? minutesBetweenTimes(form.start_time, form.end_time) : 0;
  const coaMinutes =
    kind === "coa" ? minutesBetweenTimes(form.in_time, form.out_time) : 0;
  const overQuota =
    kind === "leave" && COUNTS_AGAINST_QUOTA(form.type) && days > remaining;

  // True when the end time wraps past midnight, which the row builder
  // handles by rolling the end date forward.
  const otOvernight = form.end_time <= form.start_time;
  const coaOvernight = form.out_time && form.out_time <= form.in_time;

  // Turns the form into the row its own table expects. The shapes diverge
  // enough that a generic mapper would be harder to read than four cases.
  const buildRow = () => {
    if (kind === "leave")
      return {
        user_id: userId,
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        days,
        reason: form.reason.trim() || null,
        status: "pending",
      };
    if (kind === "ob")
      return {
        user_id: userId,
        start_date: form.start_date,
        end_date: form.end_date,
        days,
        destination: form.destination.trim(),
        purpose: form.purpose.trim(),
        contact: form.contact.trim() || null,
        status: "pending",
      };
    if (kind === "ot")
      return {
        user_id: userId,
        work_date: form.work_date,
        planned_start: combineLocal(form.work_date, form.start_time),
        // Rolls to the next day when the block crosses midnight.
        planned_end: combineLocal(
          form.work_date,
          form.end_time,
          form.start_time,
        ),
        planned_minutes: otMinutes,
        reason: form.reason.trim(),
        status: "pending",
      };
    return {
      user_id: userId,
      // Null for a day never logged at all — approving inserts a fresh
      // attendance row in that case rather than amending one.
      attendance_id: entry?.id ?? null,
      work_date: form.work_date,
      requested_clock_in: combineLocal(form.work_date, form.in_time),
      requested_clock_out: form.out_time
        ? combineLocal(form.work_date, form.out_time, form.in_time)
        : null,
      cause: form.cause,
      reason: form.reason.trim(),
      status: "pending",
    };
  };

  const validate = () => {
    if ((kind === "leave" || kind === "ob") && days === 0)
      return "That range has no working days in it.";
    if (kind === "ot" && otMinutes === 0)
      return "Overtime has to end at a different time from when it starts.";
    if (kind === "coa" && form.out_time && coaMinutes === 0)
      return "Clock out cannot be the same as clock in.";
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    const { error: err } = await supabase
      .from(REQUEST_TYPES[kind].table)
      .insert([buildRow()]);
    setSaving(false);

    if (err) {
      // The database's own guards are the ones worth translating: their
      // raw text names constraints nobody outside this repo has heard of.
      const m = err.message;
      setError(
        m.includes("_no_overlap")
          ? "You already have a request covering some of those dates."
          : m.includes("ot_requests_one_per_day")
            ? "You already have an overtime request for that date."
            : m,
      );
      return;
    }
    onSaved();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="request-title">File {REQUEST_TYPES[kind].label}</h3>
        <p className="modal-sub">
          {kind === "coa"
            ? entry
              ? "Certify what actually happened. Your logged entry stays as it is until HR approves."
              : "Certify a day with no record. HR reviews before anything is written."
            : kind === "ot"
              ? "File the overtime you plan to render. You confirm the actual hours afterwards."
              : "HR reviews this before it takes effect."}
        </p>

        <form onSubmit={submit}>
          {kind === "leave" && (
            <div className="field">
              <label htmlFor="rq-leave-type">Type</label>
              <select
                id="rq-leave-type"
                value={form.type}
                onChange={(e) => set({ type: e.target.value })}
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(kind === "leave" || kind === "ob") && (
            <div className="field-pair">
              <div className="field">
                <label htmlFor="rq-start">First day</label>
                <input
                  id="rq-start"
                  type="date"
                  min={today()}
                  value={form.start_date}
                  onChange={(e) => {
                    const start_date = e.target.value;
                    // An end before the start only ever produces a
                    // constraint error later, so it follows along.
                    set({
                      start_date,
                      end_date:
                        form.end_date && form.end_date < start_date
                          ? start_date
                          : form.end_date,
                    });
                  }}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="rq-end">Last day</label>
                <input
                  id="rq-end"
                  type="date"
                  min={form.start_date || today()}
                  value={form.end_date}
                  onChange={(e) => set({ end_date: e.target.value })}
                  required
                />
              </div>
            </div>
          )}

          {kind === "ob" && (
            <>
              <div className="field">
                <label htmlFor="rq-dest">Where</label>
                <input
                  id="rq-dest"
                  type="text"
                  placeholder="Client site, Makati"
                  value={form.destination}
                  onChange={(e) => set({ destination: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="rq-purpose">Purpose</label>
                <input
                  id="rq-purpose"
                  type="text"
                  placeholder="Quarterly account review"
                  value={form.purpose}
                  onChange={(e) => set({ purpose: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="rq-contact">Contact while out (optional)</label>
                <input
                  id="rq-contact"
                  type="text"
                  placeholder="0917 000 0000"
                  value={form.contact}
                  onChange={(e) => set({ contact: e.target.value })}
                />
              </div>
            </>
          )}

          {kind === "ot" && (
            <>
              <div className="field">
                <label htmlFor="rq-otdate">Date</label>
                <input
                  id="rq-otdate"
                  type="date"
                  value={form.work_date}
                  onChange={(e) => set({ work_date: e.target.value })}
                  required
                />
              </div>
              <div className="field-pair">
                <div className="field">
                  <label htmlFor="rq-otstart">From</label>
                  <input
                    id="rq-otstart"
                    type="time"
                    value={form.start_time}
                    onChange={(e) => set({ start_time: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="rq-otend">To</label>
                  <input
                    id="rq-otend"
                    type="time"
                    value={form.end_time}
                    onChange={(e) => set({ end_time: e.target.value })}
                    required
                  />
                </div>
              </div>
            </>
          )}

          {kind === "coa" && (
            <>
              <div className="field">
                <label htmlFor="rq-coadate">Date</label>
                <input
                  id="rq-coadate"
                  type="date"
                  max={today()}
                  value={form.work_date}
                  onChange={(e) => set({ work_date: e.target.value })}
                  required
                  disabled={Boolean(entry)}
                />
              </div>
              <div className="field-pair">
                <div className="field">
                  <label htmlFor="rq-coain">Actual in</label>
                  <input
                    id="rq-coain"
                    type="time"
                    value={form.in_time}
                    onChange={(e) => set({ in_time: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="rq-coaout">Actual out</label>
                  <input
                    id="rq-coaout"
                    type="time"
                    value={form.out_time}
                    onChange={(e) => set({ out_time: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="rq-cause">Why is there no record?</label>
                <select
                  id="rq-cause"
                  value={form.cause}
                  onChange={(e) => set({ cause: e.target.value })}
                >
                  {COA_CAUSES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="rq-reason">
              {kind === "leave" ? "Reason (optional)" : "Details"}
            </label>
            <input
              id="rq-reason"
              type="text"
              placeholder={
                kind === "leave"
                  ? "Family trip"
                  : kind === "ot"
                    ? "Month-end closing"
                    : "Scanner was down all morning"
              }
              value={form.reason}
              onChange={(e) => set({ reason: e.target.value })}
              required={kind !== "leave"}
            />
          </div>

          {days > 0 && (
            <p className={`form-hint${overQuota ? " is-warn" : ""}`}>
              {days} working {days === 1 ? "day" : "days"}
              {kind === "leave" &&
                (COUNTS_AGAINST_QUOTA(form.type)
                  ? overQuota
                    ? ` — more than the ${remaining} you have left. HR will not be able to approve it.`
                    : ` — ${remaining - days} would remain.`
                  : " — unpaid, so it does not touch your quota.")}
            </p>
          )}

          {otMinutes > 0 && (
            <p className="form-hint">
              {formatMinutes(otMinutes)} of overtime
              {otOvernight && " — ends the next morning"}.
            </p>
          )}

          {coaMinutes > 0 && (
            <p className="form-hint">
              {formatMinutes(coaMinutes)} on the clock
              {coaOvernight && " — ends the next morning"}.
            </p>
          )}

          {error && (
            <div className="form-message error" role="alert">
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <LoaderCircle size={16} className="spin" />}
              {saving ? "Filing..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
