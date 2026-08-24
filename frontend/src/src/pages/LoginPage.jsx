import { useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { supabase } from "../../supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("login"); // "login" | "reset"
  const [notice, setNotice] = useState(null); // { type, text }

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
            : "Sign in to clock in, review your hours and request leave."}
        </p>

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
                  aria-label={showPassword ? "Hide password" : "Show password"}
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

        {notice && (
          <div className={`form-message ${notice.type}`} role="alert">
            {notice.text}
          </div>
        )}

        <button
          type="button"
          className="login-link"
          onClick={() => switchMode(isReset ? "login" : "reset")}
        >
          {isReset ? "Back to sign in" : "Forgot your password?"}
        </button>
      </div>
    </div>
  );
}
