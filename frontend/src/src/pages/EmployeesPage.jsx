import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LoaderCircle,
  UserPlus,
  Copy,
  Check,
  Search,
  Users,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import {
  DAY_SHORT,
  DEFAULT_REST_DAYS,
  formatTime,
  formatShiftRange,
} from "../lib/schedule.js";
import { parseDate } from "../lib/requests.js";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  role: "employee",
  leave_quota: 20,
  shift_start: "09:00:00",
};

// Mirrors the check constraint on employees.role in schema.sql and the
// ROLES array in the backend. All three have to agree — offering a role the
// database rejects produces a 400 the user cannot act on.
const ROLE_FILTERS = [
  { value: "all", label: "All roles" },
  { value: "employee", label: "Employee" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

const SORTS = [
  { value: "name", label: "Name" },
  { value: "role", label: "Role" },
  { value: "start_date", label: "Start date" },
  { value: "shift", label: "Shift start" },
];

// Admin outranks HR outranks employee, so "sort by role" gathers everyone
// with elevated access at the top instead of scattering them alphabetically.
const ROLE_RANK = { admin: 0, hr: 1, employee: 2 };

// shift_id and rest_days arrive with schedule.sql. Until that has been run
// they are not columns, and asking for them fails the whole select — so the
// directory would show nothing rather than showing the six fields that do
// exist. Postgres 42703 is undefined_column.
const RICH_COLUMNS =
  "id, full_name, email, role, leave_quota, shift_start, start_date, shift_id, rest_days";
const BASE_COLUMNS =
  "id, full_name, email, role, leave_quota, shift_start, start_date";

function initials(name, email) {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email || "?").slice(0, 2).toUpperCase();
}

// "Sa, Su" rather than restDayLabel()'s "Saturday, Sunday" — this sits in a
// table cell, where the full names wrap and shove every other column around.
function shortRestDays(restDays) {
  const days = [...(restDays?.length ? restDays : DEFAULT_REST_DAYS)].sort();
  if (!days.length) return "None";
  return days.map((d) => DAY_SHORT[d]).join(", ");
}

function formatDate(iso) {
  if (!iso) return "—";
  return parseDate(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function EmployeesPage() {
  const [people, setPeople] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [scheduleMissing, setScheduleMissing] = useState(false);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sort, setSort] = useState("name");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setLoadError(null);

      // Reads every row through the "hr reads all" policy in schema.sql,
      // which keys off the role claim on the caller's JWT.
      const read = (columns) =>
        supabase
          .from("employees")
          .select(columns)
          .order("full_name", { ascending: true });

      let { data: rows, error } = await read(RICH_COLUMNS);
      let degraded = false;
      if (error?.code === "42703") {
        degraded = true;
        ({ data: rows, error } = await read(BASE_COLUMNS));
      }

      // Shifts come from their own query rather than a PostgREST embed.
      // An embed would couple this page to the FK constraint name, and a
      // failure there would take the whole employee list down with it
      // instead of just the one column that needs it.
      const { data: shiftRows } = await supabase
        .from("shifts")
        .select("id, name, start_time, end_time, break_minutes");

      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        setPeople([]);
      } else {
        setPeople(rows ?? []);
      }
      setShifts(shiftRows ?? []);
      setScheduleMissing(degraded);
      setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const shiftById = useMemo(
    () => new Map(shifts.map((s) => [s.id, s])),
    [shifts],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = people.filter((p) => {
      if (roleFilter !== "all" && p.role !== roleFilter) return false;
      if (!needle) return true;
      return (
        (p.full_name || "").toLowerCase().includes(needle) ||
        (p.email || "").toLowerCase().includes(needle)
      );
    });

    const byName = (a, b) =>
      (a.full_name || "").localeCompare(b.full_name || "");

    return [...filtered].sort((a, b) => {
      if (sort === "role") {
        const rank = (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9);
        return rank || byName(a, b);
      }
      if (sort === "start_date") {
        // Newest hire first. A missing start_date sorts last rather than
        // reading as the epoch and jumping to the top.
        return (
          (b.start_date || "").localeCompare(a.start_date || "") || byName(a, b)
        );
      }
      if (sort === "shift") {
        return (
          (a.shift_start || "").localeCompare(b.shift_start || "") ||
          byName(a, b)
        );
      }
      return byName(a, b);
    });
  }, [people, query, roleFilter, sort]);

  const counts = useMemo(() => {
    let elevated = 0;
    people.forEach((p) => {
      if (p.role === "hr" || p.role === "admin") elevated += 1;
    });
    return { total: people.length, elevated };
  }, [people]);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    setCreated(null);

    try {
      // The API holds the service role key, so it cannot take the caller at
      // face value — it needs a token proving this is an HR or admin user.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(`${API}/api/add-employee`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        // The number input hands back a string; the API rejects a
        // leave_quota that is not a whole number.
        body: JSON.stringify({
          ...form,
          leave_quota: Number(form.leave_quota),
        }),
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
      reload();
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
      // Clipboard blocked, or the user declined. The password is on screen
      // either way, so this does not deserve an error.
      setCopied(false);
    }
  };

  const summary = loading
    ? "Loading..."
    : `${counts.total} ${counts.total === 1 ? "person" : "people"}` +
      (counts.elevated ? ` · ${counts.elevated} with HR access` : "");

  return (
    <div className="page page-wide">
      <header className="page-head page-head-row">
        <div>
          <h1>Employees</h1>
          <p className="page-sub">{summary}</p>
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

      {scheduleMissing && (
        <p className="page-note">
          Shift assignments and rest days are not set up yet — run
          <code> supabase/schedule.sql</code> to fill in those two columns.
        </p>
      )}

      <div className="directory-toolbar">
        <div className="search-field">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search employees"
          />
        </div>
        <div className="toolbar-selects">
          <label className="inline-field">
            <span>Role</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              {ROLE_FILTERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-field">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading employees...</div>
        ) : loadError ? (
          <div className="empty-state">Could not load employees: {loadError}</div>
        ) : people.length === 0 ? (
          <div className="empty-state">
            No employees yet. Add the first one to get started.
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <Users size={18} aria-hidden="true" />
            No one matches that search.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Shift</th>
                  <th scope="col">Rest days</th>
                  <th scope="col" className="num">
                    Leave quota
                  </th>
                  <th scope="col">Started</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const shift = shiftById.get(p.shift_id);
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="cell-person">
                          <span className="avatar" aria-hidden="true">
                            {initials(p.full_name, p.email)}
                          </span>
                          <span className="person-text">
                            <span className="person-name">{p.full_name}</span>
                            <span className="person-email">{p.email}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        {p.role === "employee" ? (
                          <span className="role-plain">Employee</span>
                        ) : (
                          <span className="chip">{p.role}</span>
                        )}
                      </td>
                      <td>
                        <span className="cell-stack">
                          <strong>
                            {shift ? shift.name : formatTime(p.shift_start)}
                          </strong>
                          <span className="cell-sub">
                            {shift
                              ? formatShiftRange(shift)
                              : "No shift assigned"}
                          </span>
                        </span>
                      </td>
                      {/* An em dash rather than the Sa/Su default: with the
                          column absent, printing the fallback would show a
                          roster nobody has actually set. */}
                      <td>
                        {scheduleMissing ? "—" : shortRestDays(p.rest_days)}
                      </td>
                      <td className="num">{p.leave_quota}</td>
                      <td>{formatDate(p.start_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && !loadError && visible.length > 0 && visible.length !== people.length && (
        <p className="mt-3 text-center text-xs text-ink-muted">
          Showing <span className="font-semibold text-accent">{visible.length}</span> of{" "}
          {people.length}.
        </p>
      )}
    </div>
  );
}
