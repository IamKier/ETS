import { useState } from "react";
import { PencilLine, Plus } from "lucide-react";
import RequestDialog from "./RequestDialog";

const LIMIT = 5;

function time(iso) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(a, b) {
  const mins = Math.round((new Date(b) - new Date(a)) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function RecentEntries({ rows, loading, userId, onChange }) {
  // null = closed. { entry } with entry null means "add a day that was
  // never clocked", which the dialog and the approval path both handle.
  const [correcting, setCorrecting] = useState(null);

  // Newest first. The calendar shows the same records as colour, but the
  // actual in/out times were only reachable by hovering a cell.
  const recent = [...rows]
    .sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in))
    .slice(0, LIMIT);

  return (
    <section className="card entries">
      <div className="entries-head">
        <h3>Recent entries</h3>
        <button
          className="link-btn"
          onClick={() => setCorrecting({ entry: null })}
        >
          <Plus size={14} /> Certify a day
        </button>
      </div>

      {loading ? (
        <div className="entries-empty">Loading...</div>
      ) : recent.length === 0 ? (
        <div className="entries-empty">No entries this month yet.</div>
      ) : (
        <ul className="entries-list">
          {recent.map((r) => {
            const d = new Date(r.clock_in);
            const late = r.status === "late";
            return (
              <li key={r.id ?? r.clock_in}>
                <span className="entry-date">
                  <strong>{d.getDate()}</strong>
                  <span>
                    {d.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                </span>
                <span className="entry-times">
                  {time(r.clock_in)} – {r.clock_out ? time(r.clock_out) : "—"}
                  {late && (
                    <span className="entry-flag">
                      late{r.late_minutes ? ` ${r.late_minutes}m` : ""}
                    </span>
                  )}
                </span>
                <span className="entry-total">
                  {r.clock_out ? duration(r.clock_in, r.clock_out) : "open"}
                </span>
                <button
                  className="entry-fix"
                  title="File a certificate of attendance"
                  aria-label={`Certificate of attendance for ${d.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`}
                  onClick={() => setCorrecting({ entry: r })}
                >
                  <PencilLine size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {correcting && (
        <RequestDialog
          kind="coa"
          userId={userId}
          entry={correcting.entry}
          onClose={() => setCorrecting(null)}
          onSaved={() => {
            setCorrecting(null);
            onChange?.();
          }}
        />
      )}
    </section>
  );
}
