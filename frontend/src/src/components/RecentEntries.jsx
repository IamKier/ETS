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

export default function RecentEntries({ rows, loading }) {
  // Newest first. The calendar shows the same records as colour, but the
  // actual in/out times were only reachable by hovering a cell.
  const recent = [...rows]
    .sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in))
    .slice(0, LIMIT);

  return (
    <section className="card entries">
      <div className="entries-head">
        <h3>Recent entries</h3>
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
              <li key={r.clock_in}>
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
