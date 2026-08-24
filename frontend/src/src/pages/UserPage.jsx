import { Mail, Shield, CalendarDays, Clock3, Sun } from "lucide-react";

function formatShift(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function UserPage({ email, profile }) {
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
      value: formatShift(profile?.shift_start),
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
        <h1>{profile?.full_name || "My profile"}</h1>
        <p className="page-sub">Your employment details</p>
      </header>

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
        Need something changed? Ask your HR administrator.
      </p>
    </div>
  );
}
