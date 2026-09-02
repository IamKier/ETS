import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { parseDate, toISODate } from "../lib/requests.js";
import { DAY_SHORT, DEFAULT_REST_DAYS } from "../lib/schedule.js";

// One column per calendar day, one row per employee. Every cell resolves to
// exactly one of these — the precedence below is what decides which, and it
// matters: someone who clocked in on a public holiday should read as worked,
// not as a holiday they sat out.
const CELL = {
  present: { label: "Present", short: "P" },
  late: { label: "Late", short: "L" },
  leave: { label: "On leave", short: "V" },
  ob: { label: "Official business", short: "B" },
  holiday: { label: "Holiday", short: "H" },
  rest: { label: "Rest day", short: "—" },
  absent: { label: "Absent", short: "A" },
  future: { label: "", short: "" },
};

// Drawn in the legend and counted in the per-row totals. `rest` and `future`
// are deliberately absent: neither is something anyone needs a tally of.
const COUNTED = ["present", "late", "leave", "ob", "absent"];

const MONTH_LABEL = (year, month) =>
  new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

function initials(name, email) {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email || "?").slice(0, 2).toUpperCase();
}

// Every day in the month, as local dates. Built from parts rather than from
// an ISO string, for the same reason parseDate exists: UTC midnight lands on
// the previous day for anyone west of Greenwich.
function daysInMonth(year, month) {
  const out = [];
  const last = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= last; d += 1) out.push(new Date(year, month, d));
  return out;
}

// Expands an inclusive start/end range into the ISO dates it covers, so a
// three-day leave marks all three columns rather than only its first.
function datesBetween(startISO, endISO) {
  const out = [];
  if (!startISO) return out;
  const end = parseDate(endISO || startISO);
  for (
    let d = parseDate(startISO);
    d <= end;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    out.push(toISODate(d));
  }
  return out;
}

export default function AttendanceMatrixPage() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [people, setPeople] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leave, setLeave] = useState([]);
  const [ob, setOb] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const days = useMemo(() => daysInMonth(year, month), [year, month]);
  const todayISO = toISODate(today);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setLoadError(null);

      const first = new Date(year, month, 1);
      const next = new Date(year, month + 1, 1);
      const firstISO = toISODate(first);
      const lastISO = toISODate(new Date(year, month + 1, 0));

      // rest_days arrives with schedule.sql. Asking for a column that does
      // not exist fails the whole select (Postgres 42703), so fall back to
      // the fields that predate it and let DEFAULT_REST_DAYS stand in —
      // which is exactly what the app assumed before rosters existed.
      const read = (columns) =>
        supabase
          .from("employees")
          .select(columns)
          .order("full_name", { ascending: true });

      let { data: rows, error } = await read(
        "id, full_name, email, role, rest_days",
      );
      if (error?.code === "42703") {
        ({ data: rows, error } = await read("id, full_name, email, role"));
      }

      // clock_in is timestamptz, so the range is bounded by instants, not
      // dates: everything from local midnight on the 1st up to (not
      // including) local midnight on the 1st of the next month.
      const { data: att } = await supabase
        .from("attendance")
        .select("user_id, clock_in, clock_out, status")
        .gte("clock_in", first.toISOString())
        .lt("clock_in", next.toISOString());

      // Only approved requests colour the grid. A pending one is not yet a
      // fact about the month, and showing it as though it were would have
      // HR reading absences that nobody has agreed to.
      const { data: leaveRows } = await supabase
        .from("leave_requests")
        .select("user_id, start_date, end_date, type")
        .eq("status", "approved")
        .lte("start_date", lastISO)
        .gte("end_date", firstISO);

      const { data: obRows } = await supabase
        .from("ob_requests")
        .select("user_id, start_date, end_date")
        .eq("status", "approved")
        .lte("start_date", lastISO)
        .gte("end_date", firstISO);

      const { data: holidayRows } = await supabase
        .from("holidays")
        .select("date, name, type")
        .gte("date", firstISO)
        .lte("date", lastISO);

      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        setPeople([]);
      } else {
        setPeople(rows ?? []);
      }
      setAttendance(att ?? []);
      setLeave(leaveRows ?? []);
      setOb(obRows ?? []);
      // Holidays live in schedule.sql. If that has not been applied the
      // query fails and the grid simply has no holiday column shading,
      // which is a smaller loss than refusing to render at all.
      setHolidays(holidayRows ?? []);
      setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const holidayByDate = useMemo(
    () => new Map(holidays.map((h) => [h.date, h])),
    [holidays],
  );

  // user_id -> ISO date -> the winning cell for that day, plus the tooltip
  // text. Built once per load rather than per cell: the naive version is a
  // scan of every attendance row for every one of the ~31 × N cells.
  const grid = useMemo(() => {
    const byUser = new Map();
    const ensure = (id) => {
      if (!byUser.has(id)) byUser.set(id, new Map());
      return byUser.get(id);
    };

    const claim = (userId, dateISO, kind, title) => {
      const cells = ensure(userId);
      // First writer wins, and the sources below run in precedence order.
      if (!cells.has(dateISO)) cells.set(dateISO, { kind, title });
    };

    attendance.forEach((row) => {
      const dateISO = toISODate(new Date(row.clock_in));
      const inAt = new Date(row.clock_in).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
      const outAt = row.clock_out
        ? new Date(row.clock_out).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "still in";
      claim(
        row.user_id,
        dateISO,
        row.status === "late" ? "late" : "present",
        `${inAt} – ${outAt}`,
      );
    });

    leave.forEach((row) => {
      datesBetween(row.start_date, row.end_date).forEach((d) =>
        claim(row.user_id, d, "leave", `${row.type} leave`),
      );
    });

    ob.forEach((row) => {
      datesBetween(row.start_date, row.end_date).forEach((d) =>
        claim(row.user_id, d, "ob", "Official business"),
      );
    });

    return byUser;
  }, [attendance, leave, ob]);

  // Resolves the cell a person gets on a day, falling through to the things
  // that are true of the day itself when nothing was filed for it.
  const cellFor = (person, date) => {
    const dateISO = toISODate(date);
    const claimed = grid.get(person.id)?.get(dateISO);
    if (claimed) return claimed;

    const holiday = holidayByDate.get(dateISO);
    if (holiday) return { kind: "holiday", title: holiday.name };

    const rest = person.rest_days?.length ? person.rest_days : DEFAULT_REST_DAYS;
    if (rest.includes(date.getDay())) return { kind: "rest", title: "Rest day" };

    // A working day that has not happened yet is not an absence.
    if (dateISO > todayISO) return { kind: "future", title: "" };
    return { kind: "absent", title: "No record" };
  };

  const rows = useMemo(
    () =>
      people.map((person) => {
        const cells = days.map((date) => ({
          date,
          dateISO: toISODate(date),
          ...cellFor(person, date),
        }));
        const totals = {};
        COUNTED.forEach((k) => {
          totals[k] = 0;
        });
        cells.forEach((c) => {
          if (c.kind in totals) totals[c.kind] += 1;
        });
        return { person, cells, totals };
      }),
    // cellFor closes over grid/holidayByDate/todayISO, all of which are
    // themselves memoised on the state below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, days, grid, holidayByDate, todayISO],
  );

  const step = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const atCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();

  // CSV rather than a print stylesheet: the thing people do with an
  // attendance matrix is paste it into payroll, not print it.
  const exportCSV = () => {
    const header = ["Employee", "Email", ...days.map((d) => d.getDate())];
    const body = rows.map((r) => [
      r.person.full_name,
      r.person.email,
      ...r.cells.map((c) => CELL[c.kind].short),
    ]);
    const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...body]
      .map((line) => line.map(escape).join(","))
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${year}-${String(month + 1).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page page-wide">
      <header className="page-head page-head-row">
        <div>
          <h1>Attendance matrix</h1>
          <p className="page-sub">
            {loading
              ? "Loading..."
              : `${people.length} ${
                  people.length === 1 ? "person" : "people"
                } · ${days.length} days`}
          </p>
        </div>
        <div className="matrix-controls">
          <button
            className="calendar-nav"
            onClick={() => step(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="matrix-month">{MONTH_LABEL(year, month)}</span>
          <button
            className="calendar-nav"
            onClick={() => step(1)}
            disabled={atCurrentMonth}
            aria-label="Next month"
            title={atCurrentMonth ? "This is the current month" : undefined}
          >
            <ChevronRight size={16} />
          </button>
          <button
            className="btn-primary btn-inline"
            onClick={exportCSV}
            disabled={loading || rows.length === 0}
          >
            <Download size={16} />
            CSV
          </button>
        </div>
      </header>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading attendance...</div>
        ) : loadError ? (
          <div className="empty-state">
            Could not load attendance: {loadError}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No employees to chart yet.</div>
        ) : (
          <div className="table-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th scope="col" className="matrix-name-head">
                    Employee
                  </th>
                  {days.map((d) => {
                    const iso = toISODate(d);
                    return (
                      <th
                        scope="col"
                        key={iso}
                        className={`matrix-day-head${
                          iso === todayISO ? " is-today" : ""
                        }`}
                      >
                        <span className="matrix-dow">
                          {DAY_SHORT[d.getDay()]}
                        </span>
                        <span className="matrix-dom">{d.getDate()}</span>
                      </th>
                    );
                  })}
                  {COUNTED.map((k) => (
                    <th scope="col" key={k} className="matrix-total-head">
                      {CELL[k].short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ person, cells, totals }) => (
                  <tr key={person.id}>
                    <th scope="row" className="matrix-name">
                      <span className="cell-person">
                        <span className="avatar" aria-hidden="true">
                          {initials(person.full_name, person.email)}
                        </span>
                        <span className="person-text">
                          <span className="person-name">
                            {person.full_name}
                          </span>
                          <span className="person-email">{person.email}</span>
                        </span>
                      </span>
                    </th>
                    {cells.map((c) => (
                      <td
                        key={c.dateISO}
                        className={`matrix-cell is-${c.kind}${
                          c.dateISO === todayISO ? " is-today" : ""
                        }`}
                        // Colour alone would leave present and late
                        // indistinguishable to anyone who cannot tell them
                        // apart, so every cell carries its letter too.
                        title={`${person.full_name} · ${c.dateISO} · ${
                          CELL[c.kind].label || "No data"
                        }${c.title ? ` · ${c.title}` : ""}`}
                      >
                        <span className="matrix-mark">{CELL[c.kind].short}</span>
                      </td>
                    ))}
                    {COUNTED.map((k) => (
                      <td key={k} className="matrix-total">
                        {totals[k] || "·"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="matrix-legend">
        {Object.entries(CELL)
          .filter(([kind]) => kind !== "future")
          .map(([kind, meta]) => (
            <span key={kind}>
              <i className={`matrix-swatch is-${kind}`} aria-hidden="true">
                {meta.short}
              </i>
              {meta.label}
            </span>
          ))}
      </div>

      <p className="page-note">
        A day counts as absent only once it has passed and the employee was
        rostered for it — rest days and holidays never do. Approved leave and
        official business fill the day; a clock-in outranks both, so working
        through a holiday still reads as worked.
      </p>
    </div>
  );
}
