import { useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { supabase } from "../../supabaseClient";

const MIN_LENGTH = 8;

export default function UpdatePasswordPage({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    password.length >= MIN_LENGTH && password === confirm && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setNotice(null);

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setNotice({ type: "error", text: error.message });
      return;
    }

    setNotice({ type: "success", text: "Password updated. Signing you in..." });
    // The recovery link already established a session, so leaving recovery
    // mode drops straight into the app.
    setTimeout(onDone, 900);
  };

  return (
    <div className="login-bg">
      <div className="login-panel">
        <div className="login-brand">
          <span className="login-mark">E</span>
          <p className="login-sub">Employee Timesheet System</p>
        </div>

        <h2 className="login-heading">Choose a new password</h2>
        <p className="login-lede">
          Pick something at least {MIN_LENGTH} characters long. You will stay
          signed in on this device once it is saved.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="new-password">New password</label>
            <div className="input-affix">
              <input
                id="new-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                aria-describedby="password-hint"
              />
              <button
                type="button"
                className="affix-btn"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                tabIndex={-1}
              >
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <p
              id="password-hint"
              className={`field-hint${tooShort ? " warn" : ""}`}
            >
              {tooShort
                ? `${MIN_LENGTH - password.length} more character${
                    MIN_LENGTH - password.length === 1 ? "" : "s"
                  } needed`
                : `At least ${MIN_LENGTH} characters`}
            </p>
          </div>

          <div className="field">
            <label htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {mismatch && (
              <p className="field-hint warn">Passwords do not match</p>
            )}
          </div>

          <button type="submit" className="btn-primary" disabled={!canSubmit}>
            {loading && <LoaderCircle size={16} className="spin" />}
            {loading ? "Saving..." : "Save password"}
          </button>
        </form>

        {notice && (
          <div className={`form-message ${notice.type}`} role="alert">
            {notice.text}
          </div>
        )}
      </div>
    </div>
  );
}
