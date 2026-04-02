import { useState, useEffect } from "react";
import ClockInButton from "./src/components/ClockInButton";
import ClockOutButton from "./src/components/ClockOutButton";
import HRDashboard from "./src/pages/HRDashboard";
import UserInfo from "./src/components/UserInfo";
import LoginPage from "./src/pages/LoginPage";
import { supabase } from "./supabaseClient";
import "./App.css";
function App() {
  const [page, setPage] = useState("dashboard");
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      },
    );
    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  if (!session) {
    return (
      <LoginPage
        onLogin={() => setSession(supabase.auth.getSession().data.session)}
      />
    );
  }

  return (
    <div className="app-bg">
      <div className="sidebar">
        <h1 className="sidebar-title">ETS</h1>
        <button
          className={page === "dashboard" ? "active" : ""}
          onClick={() => setPage("dashboard")}
        >
          Main Dashboard
        </button>
        <button
          className={page === "hr" ? "active" : ""}
          onClick={() => setPage("hr")}
        >
          HR Dashboard
        </button>
      </div>
      <div className="main-content">
        <h1 className="app-title">Employee Tracking System</h1>
        {page === "dashboard" && (
          <>
            <UserInfo />
            <div className="clock-btn-row">
              <ClockInButton userId={session.user.id} />
              <ClockOutButton userId={session.user.id} />
            </div>
          </>
        )}
        {page === "hr" && <HRDashboard />}
      </div>
    </div>
  );
}

export default App;
