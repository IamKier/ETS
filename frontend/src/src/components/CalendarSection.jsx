import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Each status carries a glyph as well as a colour, so the grid stays
// readable in greyscale and for colour-vision deficiency.
const STATUS = {
  present: { glyph: "✓", label: "On time" },
  late: { glyph: "!", label: "Late" },
  absent: { glyph: "×", label: "Absent" },
};

function hoursBetween(a, b) {
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
  loading,
}) {
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const lastDay = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = new Date(year, month, 1).getDay();

  const monthLabel = new Date(year, month, 1).toLocaleString(undefined, {
    month: "long",
  });

  const days = [];
  for (let d = 1; d <= lastDay; d++) days.push(d);

  return (
    <section className="calendar-section">
      <div className="calendar-header">
        <button
          className="calendar-nav"
          onClick={onPrev}
          disabled={!canGoPrev}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {monthLabel} {year}
        </span>
        <button
          className="calendar-nav"
          onClick={onNext}
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className={`calendar-grid${loading ? " is-loading" : ""}`}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="calendar-weekday" aria-hidden="true">
            {d}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((d) => {
          const date = new Date(year, month, d);
          const row = byDay[d];
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const beforeStart = empStart && date < empStart;

          let key = null;
          if (row) key = row.status === "late" ? "late" : "present";
          else if (date < startOfToday && !isWeekend && !beforeStart)
            key = "absent";

          const meta = key ? STATUS[key] : null;
          const isToday = date.getTime() === startOfToday.getTime();

          let title = `${monthLabel} ${d}`;
          if (meta) title += ` — ${meta.label}`;
          if (row?.clock_out) {
            title += ` · ${hoursBetween(row.clock_in, row.clock_out)}`;
          }

          return (
            <div
              key={d}
              className={[
                "calendar-day",
                key || "",
                isToday ? "is-today" : "",
                beforeStart ? "is-muted" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-glyph={meta?.glyph}
              title={title}
            >
              {d}
            </div>
          );
        })}
      </div>

      <div className="calendar-legend">
        {Object.entries(STATUS).map(([k, meta]) => (
          <span key={k}>
            <i className={`legend-swatch tone-${k}`} />
            {meta.label}
          </span>
        ))}
      </div>
    </section>
  );
}
