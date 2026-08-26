import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  ClipboardSignature,
  Clock4,
  LoaderCircle,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import RequestDialog from "../components/RequestDialog";
import { makeSchedule } from "../lib/schedule";
import {
  COUNTS_AGAINST_QUOTA,
  STATUS_LABEL,
  formatMinutes,
  parseDate,
  toSummary,
} from "../lib/requests";

const FILING = [
  { kind: "leave", icon: CalendarDays, label: "Leave", hint: "Time off" },
  {
    kind: "ob",
    icon: BriefcaseBusiness,
    label: "Official Business",
    hint: "Working offsite",
  },
  { kind: "ot", icon: Clock4, label: "Overtime", hint: "Extra hours" },
  {
    kind: "coa",
    icon: ClipboardSignature,
    label: "Certificate of Attendance",
    hint: "Missing or wrong log",
  },
];

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "leave", label: "Leave" },
  { key: "ob", label: "OB" },
  { key: "ot", label: "OT" },
  { key: "coa", label: "COA" },
];

export default function RequestsPage({ userId, profile }) {
  const [rows, setRows] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filing, setFiling] = useState(null);
  const [filter, setFilter] = useState("open");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      // Four tables, one pass. A database view could union them, but this
      // keeps each table's columns typed and the merge visible.
      const [leave, ob, ot, coa, holidayRes] = await Promise.all([
        supabase
          .from("leave_requests")
          .select(
            "id, type, start_date, end_date, days, reason, status, created_at, decided_note",
          )
          .eq("user_id", userId),
        supabase
          .from("ob_requests")
          .select(
            "id, start_date, end_date, days, destination, purpose, status, created_at, decided_note",
          )
          .eq("user_id", userId),
        supabase
          .from("ot_requests")
          .select(
            "id, work_date, planned_start, planned_end, planned_minutes, actual_minutes, reason, status, created_at, decided_note",
          )
          .eq("user_id", userId),
        supabase
          .from("coa_requests")
          .select(
            "id, work_date, requested_clock_in, requested_clock_out, cause, reason, status, created_at, decided_note",
          )
          .eq("user_id", userId),
        // Needed before anything can be filed: the working-day count in the
        // dialog has to skip them.
        supabase.from("holidays").select("date, name, type"),
      ]);

      if (cancelled) return;

      setHolidays(holidayRes.data ?? []);

      const firstError = [leave, ob, ot, coa].find((r) => r.error)?.error;
      setNotice(firstError ? { type: "error", text: firstError.message } : null);

      const merged = [
        ...(leave.data ?? []).map((r) => toSummary("leave", r)),
        ...(ob.data ?? []).map((r) => toSummary("ob", r)),
        ...(ot.data ?? []).map((r) => toSummary("ot", r)),
        ...(coa.data ?? []).map((r) => toSummary("coa", r)),
      ].sort((a, b) => b.sortDate.localeCompare(a.sortDate));

      setRows(merged);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  const schedule = useMemo(
    () => makeSchedule({ restDays: profile?.rest_days, holidays }),
    [profile?.rest_days, holidays],
  );

  const quota = profile?.leave_quota ?? 0;
  const thisYear = new Date().getFullYear();

  const summary = useMemo(() => {
    let used = 0;
    let pendingDays = 0;
    let otPlanned = 0;
    let otRendered = 0;
    let awaiting = 0;
    let toConfirm = 0;

    rows.forEach((r) => {
      if (r.status === "pending") awaiting += 1;

      if (r.kind === "leave" && COUNTS_AGAINST_QUOTA(r.raw.type)) {
        if (parseDate(r.raw.start_date).getFullYear() !== thisYear) return;
        if (r.status === "approved") used += r.raw.days;
        else if (r.status === "pending") pendingDays += r.raw.days;
      }

      if (r.kind === "ot" && parseDate(r.raw.work_date).getFullYear() === thisYear) {
        if (r.status === "approved") {
          otPlanned += r.raw.planned_minutes;
          // Approved but not yet confirmed, and the date has passed —
          // this is the employee's own to-do, not HR's.
          if (parseDate(r.raw.work_date) < new Date()) toConfirm += 1;
        } else if (r.status === "confirmed") {
          otRendered += r.raw.actual_minutes ?? 0;
        }
      }
    });

    return {
      used,
      pendingDays,
      remaining: Math.max(0, quota - used),
      otPlanned,
      otRendered,
      awaiting,
      toConfirm,
    };
  }, [rows, quota, thisYear]);

  const visible = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "open")
      return rows.filter((r) => r.status === "pending" || needsConfirm(r));
    return rows.filter((r) => r.kind === filter);
  }, [rows, filter]);

  const withdraw = async (row) => {
    setBusy(row.key);
    const table = {
      leave: "leave_requests",
      ob: "ob_requests",
      ot: "ot_requests",
      coa: "coa_requests",
    }[row.kind];
    const { error } = await supabase
      .from(table)
      .update({ status: "cancelled" })
      .eq("id", row.id);
    setBusy(null);
    if (error) setNotice({ type: "error", text: error.message });
    else refresh();
  };

  // Confirming actual hours is the second half of an OT filing. Prefilled
  // from the approved plan, since most of the time that is what happened.
  const confirmOT = async (row) => {
    const planned = formatMinutes(row.raw.planned_minutes);
    const answer = window.prompt(
      `How many hours did you actually render? (approved: ${planned})\n\nEnter hours, e.g. 2 or 2.5`,
      String(row.raw.planned_minutes / 60),
    );
    if (answer == null) return;

    const hours = Number(answer);
    if (!Number.isFinite(hours) || hours < 0) {
      setNotice({ type: "error", text: "That is not a number of hours." });
      return;
    }

    setBusy(row.key);
    const { error } = await supabase
      .from("ot_requests")
      .update({
        status: "confirmed",
        actual_minutes: Math.round(hours * 60),
      })
      .eq("id", row.id);
    setBusy(null);

    if (error) setNotice({ type: "error", text: error.message });
    else {
      setNotice({ type: "success", text: "Overtime confirmed." });
      refresh();
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>My requests</h1>
        <p className="page-sub">
          File leave, official business, overtime and attendance
          certificates — and track where each one stands.
        </p>
      </header>

      <div className="balance-row">
        <div className="balance-tile">
          <span className="balance-value">{summary.remaining}</span>
          <span className="balance-label">
            Leave days left
            {summary.pendingDays > 0 && ` · ${summary.pendingDays} pending`}
          </span>
        </div>
        <div className="balance-tile">
          <span className="balance-value">
            {formatMinutes(summary.otRendered)}
          </span>
          <span className="balance-label">OT rendered in {thisYear}</span>
        </div>
        <div className="balance-tile">
          <span className="balance-value">{summary.awaiting}</span>
          <span className="balance-label">Awaiting HR</span>
        </div>
        <div className={`balance-tile${summary.toConfirm ? " is-action" : ""}`}>
          <span className="balance-value">{summary.toConfirm}</span>
          <span className="balance-label">
            {summary.toConfirm
              ? "OT to confirm — your move"
              : "Nothing to confirm"}
          </span>
        </div>
      </div>

      <div className="filing-row">
        {FILING.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.kind}
              className="filing-card"
              onClick={() => {
                setNotice(null);
                setFiling({ kind: f.kind, entry: null });
              }}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className="filing-label">{f.label}</span>
              <span className="filing-hint">{f.hint}</span>
            </button>
          );
        })}
      </div>

      {notice && (
        <div className={`form-message ${notice.type}`} role="alert">
          {notice.text}
        </div>
      )}

      <div className="tab-row" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            className={`tab${filter === f.key ? " active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {f.key === "open" && summary.awaiting + summary.toConfirm > 0 && (
              <span className="tab-badge">
                {summary.awaiting + summary.toConfirm}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div className="entries-empty">Loading...</div>
        ) : visible.length === 0 ? (
          <div className="entries-empty">
            {filter === "open"
              ? "Nothing outstanding. Everything you filed has been decided."
              : "Nothing filed here yet."}
          </div>
        ) : (
          <ul className="request-list">
            {visible.map((r) => (
              <li key={r.key}>
                <span className={`kind-tag kind-${r.kind}`}>
                  {r.kind.toUpperCase()}
                </span>
                <span className="request-main">
                  <span className="request-range">
                    {r.when} · {r.headline}
                  </span>
                  <span className="request-meta">{r.detail}</span>
                  {r.decided_note && (
                    <span className="request-note">“{r.decided_note}”</span>
                  )}
                </span>

                {r.kind === "ot" && r.variance > 0 && (
                  <span className="pill pill-rejected">over plan</span>
                )}
                <span className={`pill pill-${r.status}`}>
                  {STATUS_LABEL[r.status]}
                </span>

                {needsConfirm(r) && (
                  <button
                    className="btn-approve"
                    disabled={busy === r.key}
                    onClick={() => confirmOT(r)}
                  >
                    {busy === r.key ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : null}
                    Confirm hours
                  </button>
                )}

                {r.status === "pending" && (
                  <button
                    className="link-btn"
                    disabled={busy === r.key}
                    onClick={() => withdraw(r)}
                  >
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {filing && (
        <RequestDialog
          kind={filing.kind}
          userId={userId}
          remaining={summary.remaining}
          entry={filing.entry}
          schedule={schedule}
          onClose={() => setFiling(null)}
          onSaved={() => {
            setFiling(null);
            setNotice({ type: "success", text: "Request filed." });
            refresh();
          }}
        />
      )}
    </div>
  );
}

// Approved overtime whose date has passed still owes an actual-hours
// figure. Until that lands the row is not finished, however it looks.
function needsConfirm(r) {
  return (
    r.kind === "ot" &&
    r.status === "approved" &&
    parseDate(r.raw.work_date) < new Date()
  );
}
