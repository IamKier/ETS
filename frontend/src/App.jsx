import { useState, useEffect } from "react";
import { LayoutDashboard, CircleUser, UsersRound, LogOut } from "lucide-react";
import DashboardPage from "./src/pages/DashboardPage";
import HRDashboard from "./src/pages/HRDashboard";
import UserPage from "./src/pages/UserPage";
import LoginPage from "./src/pages/LoginPage";
import UpdatePasswordPage from "./src/pages/UpdatePasswordPage";
import { supabase } from "./supabaseClient";
import "./App.css";

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "user", label: "My profile", icon: CircleUser },
  { key: "hr", label: "Team", icon: UsersRound, hrOnly: true },
];

function initials(name, email) {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email || "?").slice(0, 2).toUpperCase();
}

function App() {
  const [page, setPage] = useState("dashboard");
  const [employeeView, setEmployeeView] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

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
      .select("full_name, role, leave_quota, shift_start, start_date")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setProfile(data ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const finishRecovery = () => {
    setRecovering(false);
    // Drop the recovery token from the address bar so a refresh or a shared
    // URL cannot replay it.
    window.history.replaceState(null, "", window.location.pathname);
  };

  if (recovering) return <UpdatePasswordPage onDone={finishRecovery} />;
  if (!session) return <LoginPage />;

  const isHR = profile?.role === "hr" || profile?.role === "admin";
  const showHR = isHR && !employeeView;

  // Employee view hides the HR tab; drop back to the dashboard so toggling
  // while on that page cannot leave the content area empty.
  const toggleEmployeeView = () => {
    setEmployeeView((v) => {
      if (!v && page === "hr") setPage("dashboard");
      return !v;
    });
  };

  const email = session.user.email;

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
              setSession(null);
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        {page === "dashboard" && (
          <DashboardPage userId={session.user.id} profile={profile} />
        )}
        {page === "user" && <UserPage email={email} profile={profile} />}
        {page === "hr" && showHR && <HRDashboard />}
      </main>
    </div>
  );
}

export default App;
