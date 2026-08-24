import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, UserPlus, Copy, Check } from "lucide-react";
import { supabase } from "../../supabaseClient";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  role: "employee",
  leave_quota: 20,
  shift_start: "09:00:00",
};

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
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);

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
  }, [tick]);

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

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    setCreated(null);

    try {
      // The API needs proof the caller is HR — it holds the service role
      // key, so it cannot take the request at face value.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(`${API}/api/add-employee`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      setSaving(false);

      if (result.error) {
        setNotice({ type: "error", text: result.error });
        return;
      }
      setCreated({ email: result.email, password: result.tempPassword });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch {
      setSaving(false);
      setNotice({
        type: "error",
        text: `Could not reach the employee service at ${API}. Is the backend running?`,
      });
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

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
        <button
          className="btn-primary btn-inline"
          onClick={() => setShowForm((v) => !v)}
        >
          <UserPlus size={16} />
          {showForm ? "Cancel" : "Add employee"}
        </button>
      </header>

      {created && (
        <div className="handoff card">
          <div>
            <strong>{created.email}</strong> can sign in now with this temporary
            password. It is shown once — copy it before leaving this page, and
            have them change it from the login screen.
          </div>
          <div className="handoff-row">
            <code>{created.password}</code>
            <button className="icon-btn" onClick={copyPassword} title="Copy">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card card-pad form-card">
          <form onSubmit={handleSubmit}>
            <div className="field-pair">
              <div className="field">
                <label htmlFor="full_name">Full name</label>
                <input
                  id="full_name"
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  placeholder="Jane Dela Cruz"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="jane@company.com"
                  required
                />
              </div>
            </div>

            <div className="field-trio">
              <div className="field">
                <label htmlFor="role">Role</label>
                <select
                  id="role"
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                >
                  <option value="employee">Employee</option>
                  <option value="hr">HR</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="leave_quota">Leave quota</label>
                <input
                  id="leave_quota"
                  name="leave_quota"
                  type="number"
                  value={form.leave_quota}
                  onChange={handleChange}
                  min={0}
                />
              </div>
              <div className="field">
                <label htmlFor="shift_start">Shift start</label>
                <input
                  id="shift_start"
                  name="shift_start"
                  type="time"
                  value={form.shift_start}
                  onChange={handleChange}
                />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <UserPlus size={16} />
              )}
              {saving ? "Adding..." : "Add employee"}
            </button>
          </form>

          {notice && (
            <div className={`form-message ${notice.type}`} role="alert">
              {notice.text}
            </div>
          )}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading team...</div>
        ) : team.length === 0 ? (
          <div className="empty-state">
            No employees yet. Add the first one to get started.
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
