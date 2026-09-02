import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";

function initials(name, email) {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email || "?").slice(0, 2).toUpperCase();
}

function timeOf(iso) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HRDashboard() {
  const [team, setTeam] = useState([]);
  const [today, setToday] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);

      // Both reads rely on the "hr reads all" policies in schema.sql, which
      // check the role claim on the caller's JWT.
      const { data: people } = await supabase
        .from("employees")
        .select("id, full_name, email, role, shift_start")
        .order("full_name", { ascending: true });

      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data: rows } = await supabase
        .from("attendance")
        .select("user_id, clock_in, clock_out, status")
        .gte("clock_in", start.toISOString());

      if (cancelled) return;
      const map = {};
      (rows ?? []).forEach((r) => {
        map[r.user_id] = r;
      });

      setTeam(people ?? []);
      setToday(map);
      setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    let inNow = 0;
    let late = 0;
    team.forEach((p) => {
      const row = today[p.id];
      if (!row) return;
      if (row.status === "late") late += 1;
      if (!row.clock_out) inNow += 1;
    });
    return { inNow, late, notIn: team.length - Object.keys(today).length };
  }, [team, today]);

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Team</h1>
          <p className="page-sub">
            {loading
              ? "Loading..."
              : `${team.length} ${team.length === 1 ? "person" : "people"} · ${
                  summary.inNow
                } clocked in now`}
          </p>
        </div>
      </header>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading team...</div>
        ) : team.length === 0 ? (
          <div className="empty-state">
            No employees yet. Add the first one from the Employees page.
          </div>
        ) : (
          <ul className="people">
            {team.map((p) => {
              const row = today[p.id];
              let state = { cls: "absent", label: "Not in" };
              if (row && !row.clock_out)
                state = {
                  cls: row.status === "late" ? "late" : "present",
                  label:
                    row.status === "late"
                      ? `In ${timeOf(row.clock_in)} · late`
                      : `In ${timeOf(row.clock_in)}`,
                };
              else if (row)
                state = {
                  cls: "done",
                  label: `${timeOf(row.clock_in)} – ${timeOf(row.clock_out)}`,
                };

              return (
                <li className="person" key={p.id}>
                  <span className="avatar" aria-hidden="true">
                    {initials(p.full_name, p.email)}
                  </span>
                  <span className="person-text">
                    <span className="person-name">{p.full_name}</span>
                    <span className="person-email">{p.email}</span>
                  </span>
                  {p.role !== "employee" && (
                    <span className="chip">{p.role}</span>
                  )}
                  <span className={`state state-${state.cls}`}>
                    <i className="state-dot" aria-hidden="true" />
                    {state.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
