import {
  Check,
  AlertTriangle,
  X,
  Timer,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

// Status colour never travels alone: each tile pairs its coloured glyph
// with a written label, so the value survives greyscale and CVD.
// `upIsGood` decides the delta's polarity — more on-time days is an
// improvement, more late days is not.
const TILES = [
  {
    key: "onTime",
    label: "On time",
    icon: Check,
    tone: "good",
    upIsGood: true,
  },
  {
    key: "late",
    label: "Late",
    icon: AlertTriangle,
    tone: "warn",
    upIsGood: false,
  },
  { key: "absent", label: "Absent", icon: X, tone: "bad", upIsGood: false },
  { key: "hours", label: "Hours logged", icon: Timer, tone: "neutral" },
];

function formatHours(h) {
  if (!h) return "0h";
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins ? `${whole}h ${mins}m` : `${whole}h`;
}

function Delta({ now, before, upIsGood, period }) {
  if (before == null) return null;
  const diff = now - before;
  if (diff === 0) {
    return (
      <span className="delta delta-flat" title={`Same as ${period}`}>
        no change
      </span>
    );
  }
  const up = diff > 0;
  const good = up === upIsGood;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`delta ${good ? "delta-good" : "delta-bad"}`}
      title={`vs ${period}`}
    >
      <Arrow size={11} strokeWidth={3} aria-hidden="true" />
      {Math.abs(diff)}
    </span>
  );
}

export default function StatRow({ stats, previous, prevLabel, loading }) {
  return (
    <section className="stat-row" aria-label="This month at a glance">
      {TILES.map((tile) => {
        const { key, label, tone, upIsGood } = tile;
        // Held as a local rather than a destructured param: this config has
        // no eslint-plugin-react, so JSX does not count as usage and only
        // uppercase *variables* are exempt from no-unused-vars.
        const Icon = tile.icon;
        const isHours = key === "hours";

        // Target is workdays x 8h. A meter is the right form for one value
        // against a limit — a second number would just need mental division.
        const pct =
          isHours && stats.expected
            ? Math.min(100, (stats.hours / stats.expected) * 100)
            : 0;

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
              ) : isHours ? (
                formatHours(stats.hours)
              ) : (
                stats[key]
              )}
            </div>

            {!loading && (
              <div className="stat-foot">
                {isHours ? (
                  stats.expected ? (
                    <>
                      <span className="meter" aria-hidden="true">
                        <span
                          className="meter-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="stat-note">
                        of {formatHours(stats.expected)} expected
                      </span>
                    </>
                  ) : (
                    <span className="stat-note">no workdays yet</span>
                  )
                ) : (
                  <>
                    <Delta
                      now={stats[key]}
                      before={previous?.[key]}
                      upIsGood={upIsGood}
                      period={prevLabel}
                    />
                    {key === "late" && stats.lateMinutes > 0 && (
                      <span className="stat-note">
                        {stats.lateMinutes} min total
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
