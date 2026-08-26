import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { formatMinutes, toSummary } from "../lib/requests";

// Each queue names its embed constraint. Every request table carries two
// foreign keys to employees (user_id and decided_by), so a bare
// `employees(...)` is ambiguous and PostgREST refuses it.
const QUEUES = [
  {
    kind: "leave",
    label: "Leave",
    table: "leave_requests",
    select:
      "id, type, start_date, end_date, days, reason, status, created_at, employees!leave_requests_user_id_fkey(full_name, email)",
    order: "start_date",
  },
  {
    kind: "ob",
    label: "OB",
    table: "ob_requests",
    select:
      "id, start_date, end_date, days, destination, purpose, contact, status, created_at, employees!ob_requests_user_id_fkey(full_name, email)",
    order: "start_date",
  },
  {
    kind: "ot",
    label: "OT",
    table: "ot_requests",
    select:
      "id, work_date, planned_start, planned_end, planned_minutes, actual_minutes, reason, status, created_at, employees!ot_requests_user_id_fkey(full_name, email)",
    order: "work_date",
  },
  {
    kind: "coa",
    label: "COA",
    table: "coa_requests",
    select:
      "id, attendance_id, work_date, requested_clock_in, requested_clock_out, cause, reason, status, created_at, employees!coa_requests_user_id_fkey(full_name, email)",
    order: "work_date",
  },
];

function initials(name, email) {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email || "?").slice(0, 2).toUpperCase();
}

export default function ApprovalsPage() {
  const [tab, setTab] = useState("leave");
  const [queues, setQueues] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      // All four in one pass — tab switching is then instant, and the
      // badge counts have to be right before any tab is opened.
      const results = await Promise.all(
        QUEUES.map((q) =>
          supabase
            .from(q.table)
            .select(q.select)
            .eq("status", "pending")
            .order(q.order, { ascending: true }),
        ),
      );

      if (cancelled) return;

      const next = {};
      let firstError = null;
      results.forEach((res, i) => {
        if (res.error && !firstError) firstError = res.error;
        next[QUEUES[i].kind] = (res.data ?? []).map((row) => ({
          ...toSummary(QUEUES[i].kind, row),
          employee: row.employees,
        }));
      });

      setQueues(next);
      setNotice(firstError ? { type: "error", text: firstError.message } : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const decide = async (row, approve) => {
    setBusy(row.key);
    setNotice(null);
    const note = approve
      ? null
      : window.prompt("Reason for rejecting (optional):") || null;

    // COA goes through the definer function, not a table update: approving
    // has to rewrite the attendance row too, and HR has no policy to do
    // that directly.
    const { error } =
      row.kind === "coa"
        ? await supabase.rpc("decide_coa_request", {
            p_id: row.id,
            p_approve: approve,
            p_note: note,
          })
        : await supabase
            .from(QUEUES.find((q) => q.kind === row.kind).table)
            .update({
              status: approve ? "approved" : "rejected",
              decided_note: note,
            })
            .eq("id", row.id);

    setBusy(null);

    if (error) {
      // The quota trigger and the transition guard both raise readable
      // messages; show them as-is rather than flattening to "failed".
      setNotice({ type: "error", text: error.message });
      return;
    }
    setNotice({
      type: "success",
      text: `${row.employee?.full_name ?? "Request"} — ${approve ? "approved" : "rejected"}.`,
    });
    refresh();
  };

  const total = QUEUES.reduce((n, q) => n + (queues[q.kind]?.length ?? 0), 0);
  const rows = queues[tab] ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <h1>Approvals</h1>
        <p className="page-sub">
          {!loading && total === 0
            ? "Nothing waiting on you."
            : "Leave, official business, overtime and attendance certificates awaiting a decision."}
        </p>
      </header>

      <div className="tab-row" role="tablist">
        {QUEUES.map((q) => {
          const count = queues[q.kind]?.length ?? 0;
          return (
            <button
              key={q.kind}
              role="tab"
              aria-selected={tab === q.kind}
              className={`tab${tab === q.kind ? " active" : ""}`}
              onClick={() => setTab(q.kind)}
            >
              {q.label}
              {count > 0 && <span className="tab-badge">{count}</span>}
            </button>
          );
        })}
      </div>

      {notice && (
        <div className={`form-message ${notice.type}`} role="alert">
          {notice.text}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="entries-empty">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="entries-empty">Nothing awaiting approval here.</div>
        ) : (
          <ul className="request-list">
            {rows.map((r) => (
              <li key={r.key}>
                <span className="avatar" aria-hidden="true">
                  {initials(r.employee?.full_name, r.employee?.email)}
                </span>
                <span className="request-main">
                  <span className="request-range">
                    {r.employee?.full_name ?? "Unknown"} · {r.when} ·{" "}
                    {r.headline}
                  </span>
                  <span className="request-meta">{r.detail}</span>
                  {r.kind === "ob" && r.raw.contact && (
                    <span className="request-meta">
                      Contact: {r.raw.contact}
                    </span>
                  )}
                  {r.kind === "ot" && (
                    <span className="request-meta">
                      Planned {formatMinutes(r.raw.planned_minutes)} · filed by
                      the employee in advance
                    </span>
                  )}
                </span>
                <span className="request-actions">
                  <button
                    className="btn-approve"
                    disabled={busy === r.key}
                    onClick={() => decide(r, true)}
                  >
                    {busy === r.key ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <Check size={15} />
                    )}
                    {r.kind === "coa" ? "Apply" : "Approve"}
                  </button>
                  <button
                    className="btn-reject"
                    disabled={busy === r.key}
                    onClick={() => decide(r, false)}
                  >
                    <X size={15} />
                    Reject
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
