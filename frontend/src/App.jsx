import { useState, useEffect } from "react";
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
    return <LoginPage />;
  }

  // Employee view hides the HR tab; drop back to the dashboard so toggling
  // while on the HR page cannot leave the content area empty.
  const toggleEmployeeView = () => {
    setEmployeeView((v) => {
      if (!v && page === "hr") setPage("dashboard");
      return !v;
    });
  };

  const navButton = (key, label) => (
    <button
      className={page === key ? "active" : ""}
      onClick={() => setPage(key)}
    >
      {label}
    </button>
  );

  return (
    <div className="app-bg">
      <div className="sidebar">
        <h1 className="sidebar-title">ETS</h1>
        {navButton("dashboard", "Main Dashboard")}
        {navButton("user", "User Page")}
        {!employeeView && navButton("hr", "HR Dashboard")}
        <button className="employee-view-toggle" onClick={toggleEmployeeView}>
          {employeeView ? "Exit Employee View" : "Employee View"}
        </button>
        <button
          className="logout-btn"
          onClick={async () => {
            await supabase.auth.signOut();
            setSession(null);
          }}
        >
          Logout
        </button>
      </div>

      <div className="main-content">
        {page === "dashboard" && (
          <div className="single-section">
            <ClockSection userId={session.user.id} />
            <CalendarSection userId={session.user.id} />
          </div>
        )}
        {page === "user" && <UserPage />}
        {page === "hr" && !employeeView && <HRDashboard />}
      </div>
    </div>
  );
}

export default App;
