import { useState, useEffect } from "react";
import ClockInButton from "./src/components/ClockInButton";
import ClockOutButton from "./src/components/ClockOutButton";
import ClockSection from "./src/components/ClockSection";
import CalendarSection from "./src/components/CalendarSection";
import HRDashboard from "./src/pages/HRDashboard";
import UserPage from "./src/pages/UserPage";
import LoginPage from "./src/pages/LoginPage";
import { supabase } from "./supabaseClient";
import "./App.css";
function App() {
  const [page, setPage] = useState("dashboard");
  const [employeeView, setEmployeeView] = useState(false);
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
      <div
        className="sidebar"
        style={{ display: "flex", flexDirection: "column", height: "100%" }}
      >
        <div>
          <h1 className="sidebar-title">ETS</h1>
          {employeeView ? (
            <>
              <button
                className={page === "dashboard" ? "active" : ""}
                onClick={() => setPage("dashboard")}
              >
                Main Dashboard
              </button>
              <button
                className={page === "user" ? "active" : ""}
                onClick={() => setPage("user")}
              >
                User Page
              </button>
            </>
          ) : (
            <>
              <button
                className={page === "dashboard" ? "active" : ""}
                onClick={() => setPage("dashboard")}
              >
                Main Dashboard
              </button>
              <button
                className={page === "user" ? "active" : ""}
                onClick={() => setPage("user")}
              >
                User Page
              </button>
              <button
                className={page === "hr" ? "active" : ""}
                onClick={() => setPage("hr")}
              >
                HR Dashboard
              </button>
            </>
          )}
          <button
            className="employee-view-toggle"
            onClick={() => setEmployeeView((v) => !v)}
          >
            {employeeView ? "Exit Employee View" : "Employee View"}
          </button>
        </div>
        <button
          className="logout-btn"
          style={{ marginTop: "auto" }}
          onClick={async () => {
            await supabase.auth.signOut();
            setSession(null);
          }}
        >
          Logout
        </button>
      </div>
      <div className="main-content">
        {employeeView ? (
          <>
            {page === "dashboard" && (
              <div className="dashboard-section single-section">
                <ClockSection userId={session.user.id} />
                <CalendarSection userId={session.user.id} />
              </div>
            )}
            {page === "user" && <UserPage />}
          </>
        ) : (
          <>
            {page === "dashboard" && (
              <div className="dashboard-section single-section">
                <ClockSection userId={session.user.id} />
                <CalendarSection userId={session.user.id} />
              </div>
            )}
            {page === "user" && <UserPage />}
            {page === "hr" && <HRDashboard />}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
