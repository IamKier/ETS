import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardCheck,
  CalendarClock,
  CalendarRange,
  UsersRound,
  Contact,
  Grid3x3,
} from "lucide-react";
import DashboardPage from "./src/pages/DashboardPage";
import HRDashboard from "./src/pages/HRDashboard";
import EmployeesPage from "./src/pages/EmployeesPage";
import AttendanceMatrixPage from "./src/pages/AttendanceMatrixPage";
import SettingsPage from "./src/pages/SettingsPage";
import RequestsPage from "./src/pages/RequestsPage";
import SchedulePage from "./src/pages/SchedulePage";
import SchedulingPage from "./src/pages/SchedulingPage";
import ApprovalsPage from "./src/pages/ApprovalsPage";
import LoginPage from "./src/pages/LoginPage";
import UpdatePasswordPage from "./src/pages/UpdatePasswordPage";
import AccountMenu from "./src/components/AccountMenu";
import { supabase } from "./supabaseClient";
import "./App.css";

// Grouped rather than one flat list: with the HR pages added, eight
// undifferentiated items made "my own timesheet" and "everyone else's"
// look like the same kind of thing. The Manage group only renders for HR,
// so an employee still sees a plain three-item sidebar with no empty
// heading above it.
const NAV_GROUPS = [
  {
    label: "You",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { key: "requests", label: "My requests", icon: CalendarDays },
      { key: "schedule", label: "My schedule", icon: CalendarClock },
    ],
  },
  {
    label: "Manage",
    hrOnly: true,
    items: [
      { key: "approvals", label: "Approvals", icon: ClipboardCheck },
      { key: "hr", label: "Team", icon: UsersRound },
      { key: "employees", label: "Employees", icon: Contact },
      { key: "matrix", label: "Attendance matrix", icon: Grid3x3 },
      { key: "scheduling", label: "Scheduling", icon: CalendarRange },
    ],
  },
];

// Flattened once, so the key lookups below stay as cheap as they were.
const NAV = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, hrOnly: group.hrOnly === true })),
);

// Which page is open survives a reload. localStorage rather than the URL
// hash, because supabase-js parses its recovery token out of the hash
// (#access_token=...&type=recovery) — a hash router would be fighting it
// for the same slot on exactly the load where getting it wrong matters.
const UI_KEY = "ets:ui";

// Every accessor is wrapped: a private window, blocked site data, or a
// browser configured to reject storage throws on access rather than
// politely returning null. Forgetting the page is fine; crashing is not.
function readUI() {
  try {
    return JSON.parse(window.localStorage.getItem(UI_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeUI(patch) {
  try {
    window.localStorage.setItem(
      UI_KEY,
      JSON.stringify({ ...readUI(), ...patch }),
    );
  } catch {
    // Storage unavailable. The app still works, it just will not remember.
  }
}

function clearUI() {
  try {
    window.localStorage.removeItem(UI_KEY);
  } catch {
    // Nothing to do — there was nothing readable to clear.
  }
}

// Reachable, but deliberately not in the sidebar list: settings opens from
// the account block at the bottom, which is where people look for it.
const OFF_NAV = ["settings"];

const isNavKey = (key) =>
  OFF_NAV.includes(key) || NAV.some((item) => item.key === key);
const isHROnly = (key) => NAV.some((item) => item.key === key && item.hrOnly);

function App() {
  // Validated on the way in: a stored key from an older build, or one
  // edited by hand, must not leave the content area blank.
  const [storedPage, setPage] = useState(() => {
    const saved = readUI().page;
    return isNavKey(saved) ? saved : "dashboard";
  });
  const [employeeView, setEmployeeView] = useState(
    () => readUI().employeeView === true,
  );
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  // Which user the loaded profile belongs to. Deriving "loaded" from this
  // rather than a boolean means switching accounts invalidates it for free,
  // and an employee with no employees row still counts as loaded — it just
  // loaded to null.
  const [profileOwner, setProfileOwner] = useState(null);

  // supabase-js parses the recovery token out of the URL while it starts up,
  // which can fire PASSWORD_RECOVERY before the listener below subscribes.
  // Seeding from the hash closes that race.
  const [recovering, setRecovering] = useState(() =>
    /[#&]type=recovery/.test(window.location.hash),
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        // A reset link signs the user in before they have chosen a new
        // password, so this flag has to outrank the session below.
        if (event === "PASSWORD_RECOVERY") setRecovering(true);
      },
    );
    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  // Fetched once here and handed down, so the sidebar, dashboard and
  // profile page share a single query instead of three.
  const userId = session?.user?.id;
  useEffect(() => {
    // No clearing on sign-out: the login screen renders instead, and the
    // next sign-in refetches under its own userId.
    if (!userId) return;
    let cancelled = false;

    const read = (columns) =>
      supabase.from("employees").select(columns).eq("id", userId).single();

    // shift_id and rest_days only exist once schedule.sql has been applied.
    // Postgres rejects the whole select for one unknown column (42703), so
    // without this fallback the profile lands as null for every user — and
    // a null profile means role is unknown, which hides every HR tab from
    // the people who are supposed to see them.
    (async () => {
      let { data, error } = await read(
        "full_name, role, leave_quota, shift_start, start_date, shift_id, rest_days",
      );
      if (error?.code === "42703") {
        ({ data } = await read(
          "full_name, role, leave_quota, shift_start, start_date",
        ));
      }
      if (cancelled) return;
      setProfile(data ?? null);
      setProfileOwner(userId);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    writeUI({ employeeView });
  }, [employeeView]);

  const isHR = profile?.role === "hr" || profile?.role === "admin";
  const profileLoaded = userId != null && profileOwner === userId;

  // Resolved during render rather than corrected afterwards by an effect,
  // which would cost an extra render and briefly show the wrong page.
  //
  // A restored HR page has to survive until the role is actually known:
  // checking before the profile lands would knock every HR user off
  // Approvals on every refresh, because for that first moment isHR is
  // false for everyone.
  const page =
    profileLoaded && isHROnly(storedPage) && !isHR ? "dashboard" : storedPage;

  // Persisting the resolved page, not the requested one, so a fallback is
  // written through instead of being re-derived on every future load.
  useEffect(() => {
    writeUI({ page });
  }, [page]);

  const finishRecovery = () => {
    setRecovering(false);
    // Drop the recovery token from the address bar so a refresh or a shared
    // URL cannot replay it.
    window.history.replaceState(null, "", window.location.pathname);
  };

  if (recovering) return <UpdatePasswordPage onDone={finishRecovery} />;
  if (!session) return <LoginPage />;

  const showHR = isHR && !employeeView;

  // Employee view hides the HR tabs; drop back to the dashboard so toggling
  // while on one of them cannot leave the content area empty.
  const toggleEmployeeView = () => {
    setEmployeeView((v) => {
      if (!v && isHROnly(page)) setPage("dashboard");
      return !v;
    });
  };

  const email = session.user.email;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // Otherwise the next person to sign in on this browser lands on
    // whatever page the last one left open.
    clearUI();
    setPage("dashboard");
    setEmployeeView(false);
    setProfile(null);
    setProfileOwner(null);
    setSession(null);
  };

  // An HR page restored from storage renders nothing until the role is
  // confirmed. Saying so beats a blank panel that looks like a failure.
  const awaitingRole = isHROnly(page) && !profileLoaded;

  return (
    <div className="app-bg">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">E</span>
          <span className="brand-name">ETS</span>
        </div>

        <nav className="nav">
          {NAV_GROUPS.filter((group) => !group.hrOnly || showHR).map(
            (group) => (
              <div className="nav-group" key={group.label}>
                {/* An employee sees one group, so labelling it would be
                    a heading over the only thing on screen. */}
                {showHR && <p className="eyebrow nav-heading">{group.label}</p>}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      className={`nav-item${page === item.key ? " active" : ""}`}
                      onClick={() => setPage(item.key)}
                      aria-current={page === item.key ? "page" : undefined}
                    >
                      <Icon size={17} strokeWidth={2} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ),
          )}
        </nav>

        {isHR && (
          <label className="switch-row">
            <span>Employee view</span>
            <input
              type="checkbox"
              checked={employeeView}
              onChange={toggleEmployeeView}
            />
            <span className="switch" aria-hidden="true" />
          </label>
        )}
      </aside>

      <main className="main-content">
        <header className="topbar">
          <AccountMenu
            email={email}
            profile={profile}
            active={page === "settings"}
            onOpenSettings={() => setPage("settings")}
            onSignOut={handleSignOut}
          />
        </header>

        {awaitingRole ? (
          <div className="page">
            <div className="entries-empty">Loading...</div>
          </div>
        ) : (
          <>
            {page === "dashboard" && (
              <DashboardPage userId={session.user.id} profile={profile} />
            )}
            {page === "requests" && (
              <RequestsPage userId={session.user.id} profile={profile} />
            )}
            {page === "schedule" && <SchedulePage profile={profile} />}
            {page === "approvals" && showHR && <ApprovalsPage />}
            {page === "settings" && (
              <SettingsPage
                email={email}
                profile={profile}
                // Patched in place rather than refetched: the header menu
                // reads the same object, so without this your old name sits
                // in the corner until the next reload.
                onProfileChange={(patch) =>
                  setProfile((p) => ({ ...(p ?? {}), ...patch }))
                }
              />
            )}
            {page === "hr" && showHR && <HRDashboard />}
            {page === "employees" && showHR && <EmployeesPage />}
            {page === "matrix" && showHR && <AttendanceMatrixPage />}
            {page === "scheduling" && showHR && <SchedulingPage />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
