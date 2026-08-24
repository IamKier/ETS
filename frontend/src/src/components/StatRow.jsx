import { Check, AlertTriangle, X, Timer } from "lucide-react";

// Status colour never travels alone: each tile pairs its coloured glyph
// with a written label, so the value survives greyscale and CVD.
const TILES = [
  { key: "onTime", label: "On time", icon: Check, tone: "good" },
  { key: "late", label: "Late", icon: AlertTriangle, tone: "warn" },
  { key: "absent", label: "Absent", icon: X, tone: "bad" },
  { key: "hours", label: "Hours logged", icon: Timer, tone: "neutral" },
];

function formatHours(h) {
  if (!h) return "0h";
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins ? `${whole}h ${mins}m` : `${whole}h`;
}

export default function StatRow({ stats, loading }) {
  return (
    <section className="stat-row" aria-label="This month at a glance">
      {TILES.map((tile) => {
        const { key, label, tone } = tile;
        // Held as a local rather than a destructured param: this config has
        // no eslint-plugin-react, so JSX does not count as usage and only
        // uppercase *variables* are exempt from no-unused-vars.
        const Icon = tile.icon;
        return (
          <div className="stat-tile" key={key}>
            <div className="stat-label">
              <Icon
                size={13}
                strokeWidth={2.5}
                className={`tone-${tone}`}
                aria-hidden="true"
              />
              {label}
            </div>
            <div className="stat-value">
              {loading ? (
                <span className="skeleton" aria-hidden="true" />
              ) : key === "hours" ? (
                formatHours(stats.hours)
              ) : (
                stats[key]
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
