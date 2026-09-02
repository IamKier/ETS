import { useState } from "react";
import {
  Mail,
  Shield,
  CalendarDays,
  Clock3,
  Sun,
  CalendarOff,
  Eye,
  EyeOff,
  LoaderCircle,
  Check,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import {
  DEFAULT_REST_DAYS,
  formatTime,
  restDayLabel,
} from "../lib/schedule.js";
import { parseDate } from "../lib/requests.js";

const MIN_LENGTH = 8;

function initials(name, email) {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email || "?").slice(0, 2).toUpperCase();
}

function formatDate(iso) {
  if (!iso) return "—";
  return parseDate(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function SettingsPage({ email, profile, onProfileChange }) {
  // ---- Profile -------------------------------------------------------
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameNotice, setNameNotice] = useState(null);

  // The profile arrives from App a moment after this page mounts, so the
  // input has to pick it up rather than staying stuck on the empty string
  // it was seeded with. Adjusted during render rather than in an effect:
  // an effect would paint the stale value first and then correct it, and
  // React re-runs this pass before committing anything to the DOM.
  const [seededName, setSeededName] = useState(profile?.full_name ?? null);
  if (profile?.full_name != null && profile.full_name !== seededName) {
    setSeededName(profile.full_name);
    setFullName(profile.full_name);
  }

  const trimmedName = fullName.trim();
  const nameChanged = trimmedName !== (profile?.full_name ?? "").trim();
  const canSaveName = trimmedName.length > 0 && nameChanged && !savingName;

  const saveName = async (e) => {
    e.preventDefault();
    if (!canSaveName) return;
    setSavingName(true);
    setNameNotice(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Written to both places on purpose. The employees row is what every
    // screen reads; user_metadata.full_name is what the account menu falls
    // back to before that row has loaded, and letting the two drift means
    // your name changes as the page settles.
    const { error } = await supabase
      .from("employees")
      .update({ full_name: trimmedName })
      .eq("id", user.id);

    if (error) {
      setSavingName(false);
      setNameNotice({ type: "error", text: error.message });
      return;
    }

    await supabase.auth.updateUser({ data: { full_name: trimmedName } });
    setSavingName(false);
    setNameNotice({ type: "success", text: "Name updated." });
    onProfileChange?.({ full_name: trimmedName });
  };

  // ---- Password ------------------------------------------------------
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState(null);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsCurrent = next.length > 0 && next === current;
  const canSavePassword =
    current.length > 0 &&
    next.length >= MIN_LENGTH &&
    next === confirm &&
    !sameAsCurrent &&
    !savingPassword;

  const savePassword = async (e) => {
    e.preventDefault();
    if (!canSavePassword) return;
    setSavingPassword(true);
    setPasswordNotice(null);

    // updateUser() changes the password on the strength of the session
    // alone, so an unlocked laptop is enough to lock the owner out of their
    // own account. Re-authenticating first is what makes this a password
    // change rather than a password reset.
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });

    if (authError) {
      setSavingPassword(false);
      setPasswordNotice({
        type: "error",
        text: "That is not your current password.",
      });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    setSavingPassword(false);

    if (error) {
      setPasswordNotice({ type: "error", text: error.message });
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    setPasswordNotice({
      type: "success",
      text: "Password changed. It applies the next time you sign in.",
    });
  };

  // ---- Employment (read only) ----------------------------------------
  const rows = [
    { icon: Mail, label: "Email", value: email },
    { icon: Shield, label: "Role", value: profile?.role ?? "employee" },
    {
      icon: Sun,
      label: "Leave quota",
      value: profile?.leave_quota == null ? "—" : `${profile.leave_quota} days`,
    },
    {
      icon: Clock3,
      label: "Shift start",
      value: formatTime(profile?.shift_start),
    },
    {
      icon: CalendarOff,
      label: "Rest days",
      value: profile?.rest_days
        ? restDayLabel(profile.rest_days)
        : restDayLabel(DEFAULT_REST_DAYS),
    },
    {
      icon: CalendarDays,
      label: "Started",
      value: formatDate(profile?.start_date),
    },
  ];

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1>Profile &amp; settings</h1>
        <p className="page-sub">
          Your details, and the things only you can change
        </p>
      </header>

      <div className="identity-card card">
        <span className="avatar avatar-lg" aria-hidden="true">
          {initials(profile?.full_name, email)}
        </span>
        <div className="identity-text">
          <strong>{profile?.full_name || email.split("@")[0]}</strong>
          <span>{email}</span>
        </div>
        <span className="chip">{profile?.role ?? "employee"}</span>
      </div>

      <section className="settings-section">
        <div className="section-head">
          <h2>Your name</h2>
        </div>
        <div className="card card-pad">
          <form onSubmit={saveName}>
            <div className="field">
              <label htmlFor="full_name">Full name</label>
              <input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Dela Cruz"
                autoComplete="name"
                required
              />
              <p className="field-hint">
                This is the name on your timesheet and on the approvals queue.
              </p>
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={!canSaveName}
            >
              {savingName && <LoaderCircle size={16} className="spin" />}
              {savingName ? "Saving..." : "Save name"}
            </button>
          </form>

          {nameNotice && (
            <div className={`form-message ${nameNotice.type}`} role="alert">
              {nameNotice.type === "success" && <Check size={15} />}
              {nameNotice.text}
            </div>
          )}
        </div>
      </section>

      <section className="settings-section">
        <div className="section-head">
          <h2>Password</h2>
        </div>
        <div className="card card-pad">
          <form onSubmit={savePassword}>
            <div className="field">
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="new-password">New password</label>
              <div className="input-affix">
                <input
                  id="new-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  required
                  aria-describedby="new-password-hint"
                />
                <button
                  type="button"
                  className="affix-btn"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide passwords" : "Show passwords"}
                  aria-pressed={show}
                  tabIndex={-1}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <p
                id="new-password-hint"
                className={`field-hint${
                  tooShort || sameAsCurrent ? " warn" : ""
                }`}
              >
                {sameAsCurrent
                  ? "Pick something different from your current password"
                  : tooShort
                    ? `${MIN_LENGTH - next.length} more character${
                        MIN_LENGTH - next.length === 1 ? "" : "s"
                      } needed`
                    : `At least ${MIN_LENGTH} characters`}
              </p>
            </div>

            <div className="field">
              <label htmlFor="confirm-password">Confirm new password</label>
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

            <button
              type="submit"
              className="btn-primary"
              disabled={!canSavePassword}
            >
              {savingPassword && <LoaderCircle size={16} className="spin" />}
              {savingPassword ? "Changing..." : "Change password"}
            </button>
          </form>

          {passwordNotice && (
            <div className={`form-message ${passwordNotice.type}`} role="alert">
              {passwordNotice.type === "success" && <Check size={15} />}
              {passwordNotice.text}
            </div>
          )}
        </div>
      </section>

      <section className="settings-section">
        <div className="section-head">
          <h2>Employment</h2>
          <span className="section-note">Set by HR</span>
        </div>
        <div className="card">
          <dl className="detail-list">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <div className="detail-row" key={row.label}>
                  <dt>
                    <Icon size={15} strokeWidth={2} aria-hidden="true" />
                    {row.label}
                  </dt>
                  <dd>{row.value}</dd>
                </div>
              );
            })}
          </dl>
        </div>
        <p className="page-note">
          These are fixed by your HR administrator — the database rejects a
          change to any of them from your own account. Ask HR if something
          here is wrong.
        </p>
      </section>
    </div>
  );
}
