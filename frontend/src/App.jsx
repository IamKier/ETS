import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardCheck,
  CalendarClock,
  CalendarRange,
  CircleUser,
  UsersRound,
  LogOut,
} from "lucide-react";
import DashboardPage from "./src/pages/DashboardPage";
import HRDashboard from "./src/pages/HRDashboard";
import UserPage from "./src/pages/UserPage";
import RequestsPage from "./src/pages/RequestsPage";
import SchedulePage from "./src/pages/SchedulePage";
import SchedulingPage from "./src/pages/SchedulingPage";
import ApprovalsPage from "./src/pages/ApprovalsPage";
import LoginPage from "./src/pages/LoginPage";
import UpdatePasswordPage from "./src/pages/UpdatePasswordPage";
import { supabase } from "./supabaseClient";
import "./App.css";

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "requests", label: "My requests", icon: CalendarDays },
  { key: "schedule", label: "My schedule", icon: CalendarClock },
  { key: "approvals", label: "Approvals", icon: ClipboardCheck, hrOnly: true },
  { key: "user", label: "My profile", icon: CircleUser },
  { key: "hr", label: "Team", icon: UsersRound, hrOnly: true },
  {
    key: "scheduling",
    label: "Scheduling",
    icon: CalendarRange,
    hrOnly: true,
  },
];

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

const isNavKey = (key) => NAV.some((item) => item.key === key);
const isHROnly = (key) => NAV.some((item) => item.key === key && item.hrOnly);

function initials(name, email) {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email || "?").slice(0, 2).toUpperCase();
}

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
    supabase
      .from("employees")
      .select(
        "full_name, role, leave_quota, shift_start, start_date, shift_id, rest_days",
      )
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data ?? null);
        setProfileOwner(userId);
      });
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
  const page = profileLoaded && isHROnly(storedPage) && !isHR
    ? "dashboard"
    : storedPage;

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
          {NAV.filter((item) => !item.hrOnly || showHR).map((item) => {
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

        <div className="account">
          <span className="avatar" aria-hidden="true">
            {initials(profile?.full_name, email)}
          </span>
          <span className="account-text">
            <span className="account-name">
              {profile?.full_name || email.split("@")[0]}
            </span>
            <span className="account-role">{profile?.role || "employee"}</span>
          </span>
          <button
            className="icon-btn"
            title="Sign out"
            aria-label="Sign out"
            onClick={async () => {
              await supabase.auth.signOut();
              // Otherwise the next person to sign in on this browser lands
              // on whatever page the last one left open.
              clearUI();
              setPage("dashboard");
              setEmployeeView(false);
              setProfile(null);
              setProfileOwner(null);
              setSession(null);
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="main-content">
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
            {page === "user" && <UserPage email={email} profile={profile} />}
            {page === "hr" && showHR && <HRDashboard />}
            {page === "scheduling" && showHR && <SchedulingPage />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
