import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Each status carries a glyph as well as a colour, so the grid stays
// readable in greyscale and for colour-vision deficiency.
const STATUS = {
  present: { glyph: "✓", label: "On time" },
  late: { glyph: "!", label: "Late" },
  absent: { glyph: "✕", label: "Absent" },
};

function time(iso) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(a, b) {
  const mins = Math.round((new Date(b) - new Date(a)) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function CalendarSection({
  year,
  month,
  byDay,
  empStart,
  canGoPrev,
  onPrev,
  onNext,
  onToday,
  loading,
}) {
  // Which cell the tooltip is pinned to. `title` was doing this job, but
  // it has a delay, never appears on touch, and keyboard users never see
  // it at all.
  const [active, setActive] = useState(null);

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const lastDay = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = new Date(year, month, 1).getDay();
  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();

  const monthLabel = new Date(year, month, 1).toLocaleString(undefined, {
    month: "long",
  });

  const describe = (d) => {
    const date = new Date(year, month, d);
    const row = byDay[d];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const beforeStart = empStart && date < empStart;

    let key = null;
    if (row) key = row.status === "late" ? "late" : "present";
    else if (date < startOfToday && !isWeekend && !beforeStart) key = "absent";

    return { date, row, isWeekend, beforeStart, key };
  };

  const show = (d) => (e) => {
    const cell = e.currentTarget;
    setActive({
      day: d,
      x: cell.offsetLeft + cell.offsetWidth / 2,
      y: cell.offsetTop,
    });
  };
  const hide = () => setActive(null);

  const activeInfo = active ? describe(active.day) : null;

  return (
    <section className="calendar-section">
      <div className="calendar-header">
        <div className="calendar-title">
          <span>
            {monthLabel} {year}
          </span>
          {!isCurrentMonth && onToday && (
            <button className="link-btn" onClick={onToday}>
              Today
            </button>
          )}
        </div>
        <div className="calendar-nav-group">
          <button
            className="calendar-nav"
            onClick={onPrev}
            disabled={!canGoPrev}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="calendar-nav"
            onClick={onNext}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="calendar-body">
        <div className="calendar-grid" aria-hidden="true">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="calendar-weekday">
              {d.slice(0, 1)}
            </div>
          ))}
        </div>

        <div className={`calendar-grid${loading ? " is-loading" : ""}`}>
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {Array.from({ length: lastDay }, (_, i) => i + 1).map((d) => {
            const { date, row, isWeekend, beforeStart, key } = describe(d);
            const meta = key ? STATUS[key] : null;
            const isToday = date.getTime() === startOfToday.getTime();

            const parts = [`${monthLabel} ${d}`];
            if (meta) parts.push(meta.label);
            if (row?.clock_out)
              parts.push(duration(row.clock_in, row.clock_out));

            return (
              <button
                type="button"
                key={d}
                className={[
                  "calendar-day",
                  key || "",
                  isToday ? "is-today" : "",
                  isWeekend ? "is-weekend" : "",
                  beforeStart ? "is-muted" : "",
                  active?.day === d ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={show(d)}
                onFocus={show(d)}
                onMouseLeave={hide}
                onBlur={hide}
                aria-label={parts.join(", ")}
              >
                <span className="day-num">{d}</span>
                {meta && (
                  <span className="day-glyph" aria-hidden="true">
                    {meta.glyph}
                  </span>
                )}
              </button>
            );
          })}

          {activeInfo && (
            <div
              className="cal-tip"
              style={{ left: active.x, top: active.y }}
              role="tooltip"
            >
              <div className="cal-tip-head">
                {activeInfo.date.toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </div>
              {activeInfo.key ? (
                <div className="cal-tip-status">
                  <i className={`state-dot tone-bg-${activeInfo.key}`} />
                  {STATUS[activeInfo.key].label}
                </div>
              ) : (
                <div className="cal-tip-muted">
                  {activeInfo.beforeStart
                    ? "Before start date"
                    : activeInfo.isWeekend
                      ? "Weekend"
                      : "No record"}
                </div>
              )}
              {activeInfo.row && (
                <div className="cal-tip-times">
                  {time(activeInfo.row.clock_in)} –{" "}
                  {activeInfo.row.clock_out
                    ? time(activeInfo.row.clock_out)
                    : "still in"}
                  {activeInfo.row.clock_out && (
                    <strong>
                      {duration(
                        activeInfo.row.clock_in,
                        activeInfo.row.clock_out,
                      )}
                    </strong>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="calendar-legend">
        {Object.entries(STATUS).map(([k, meta]) => (
          <span key={k}>
            <i className={`legend-swatch tone-bg-${k}`} />
            {meta.label}
          </span>
        ))}
      </div>
    </section>
  );
}
