import { useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { supabase } from "../../supabaseClient";

// Dev-only password bypass. RLS keys off auth.uid() and the JWT role claim,
// so auth cannot be skipped outright without every query coming back empty —
// these buttons do sign in for real, they just supply the shared dev password
// from .env instead of asking for it. import.meta.env.DEV is false in any
// production build, so the whole block below is dropped when the app is built.
const DEV_PASSWORD = import.meta.env.VITE_DEV_PASSWORD;
const DEV_BYPASS = import.meta.env.DEV && Boolean(DEV_PASSWORD);

const DEV_ACCOUNTS = [
  { email: "test@ets-demo.com", name: "Test Employee", role: "hr" },
  { email: "ana.cruz@ets-demo.com", name: "Ana Cruz", role: "hr" },
  { email: "maria.santos@ets-demo.com", name: "Maria Santos", role: "employee" },
  { email: "ben.reyes@ets-demo.com", name: "Ben Reyes", role: "employee" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("login"); // "login" | "reset"
  const [notice, setNotice] = useState(null); // { type, text }
  // With the bypass on the form starts hidden, so the picker is the whole
  // screen rather than an extra step above a login nobody is going to use.
  const [showForm, setShowForm] = useState(!DEV_BYPASS);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) setNotice({ type: "error", text: error.message });
    // On success the auth listener in App swaps this screen out.
  };

  const handleDevLogin = async (account) => {
    setLoading(true);
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: DEV_PASSWORD,
    });
    setLoading(false);
    if (error) {
      // Almost always means seed-dev-passwords.js has not been run against
      // this project yet, so say that rather than just echoing "Invalid
      // login credentials".
      setNotice({
        type: "error",
        text: `${error.message} — run "node backend/seed-dev-passwords.js" to set the dev password on the demo accounts.`,
      });
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNotice(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    setNotice(
      error
        ? { type: "error", text: error.message }
        : {
            type: "success",
            text: "If that address has an account, a reset link is on its way.",
          },
    );
  };

  const switchMode = (next) => {
    setMode(next);
    setNotice(null);
  };

  const isReset = mode === "reset";

  return (
    <div className="login-bg">
      <div className="login-panel">
        <div className="login-brand">
          <span className="login-mark">E</span>
          <p className="login-sub">Employee Timesheet System</p>
        </div>

        <h2 className="login-heading">
          {isReset ? "Reset your password" : "Welcome back"}
        </h2>
        <p className="login-lede">
          {isReset
            ? "Enter your work email and we'll send you a reset link."
            : DEV_BYPASS && !showForm
              ? "Dev mode — pick an account to sign in as."
              : "Sign in to clock in, review your hours and request leave."}
        </p>

        {DEV_BYPASS && !isReset && (
          <div className="dev-accounts">
            {DEV_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className="dev-account"
                disabled={loading}
                onClick={() => handleDevLogin(account)}
              >
                <span className="dev-account-name">{account.name}</span>
                <span className="dev-account-role">{account.role}</span>
              </button>
            ))}
          </div>
        )}

        {(showForm || isReset) && (
          <form onSubmit={isReset ? handleReset : handleLogin}>
            <div className="field">
              <label htmlFor="login-email">Work email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            {!isReset && (
              <div className="field">
                <label htmlFor="login-password">Password</label>
                <div className="input-affix">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="affix-btn"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-pressed={showPassword}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading && <LoaderCircle size={16} className="spin" />}
              {loading
                ? isReset
                  ? "Sending..."
                  : "Signing in..."
                : isReset
                  ? "Send reset link"
                  : "Sign in"}
            </button>
          </form>
        )}

        {notice && (
          <div className={`form-message ${notice.type}`} role="alert">
            {notice.text}
          </div>
        )}

        {DEV_BYPASS && !isReset && !showForm ? (
          <button
            type="button"
            className="login-link"
            onClick={() => setShowForm(true)}
          >
            Sign in with a password instead
          </button>
        ) : (
          <button
            type="button"
            className="login-link"
            onClick={() => switchMode(isReset ? "login" : "reset")}
          >
            {isReset ? "Back to sign in" : "Forgot your password?"}
          </button>
        )}
      </div>
    </div>
  );
}
