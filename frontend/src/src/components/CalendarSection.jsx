import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LEAVE_TYPE_LABEL } from "../lib/requests";
import { DEFAULT_SCHEDULE } from "../lib/schedule";

// Two letters, not one: a single-letter row repeats S and T, so the only
// thing separating Sunday from Saturday is position — which is exactly
// what someone scanning the row is trying to work out.
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Each status is a distinct shape as well as a colour — disc, ring, bar —
// so the grid still reads in greyscale and with colour-vision deficiency.
// That redundancy is what lets the cells themselves stay unfilled: the hue
// keeps its full saturation, it just occupies 6px instead of a whole cell.
const STATUS = {
  present: { label: "On time" },
  late: { label: "Late" },
  absent: { label: "Absent" },
  // Neutral by design. The other three are performance states drawn from
  // the reserved status palette; approved leave is not a judgement about
  // anyone, so it gets a shape in muted grey rather than a fourth hue
  // competing inside that palette.
  leave: { label: "Leave" },
  // A holiday is not an absence and not a performance state, so like leave
  // it stays out of the reserved status palette.
  holiday: { label: "Holiday" },
  // Official business is worked time, so it reads as a working state
  // rather than an absence — but it is credited, not clocked, and that
  // difference is worth being able to see.
  ob: { label: "Official business" },
};

// Kept in sync with the width in App.css. The tooltip has to be pinned
// inside the grid at the edge columns, and clamping needs a number.
const TIP_WIDTH = 168;
const TIP_GAP = 8;
// Keeps the arrow clear of the 8px corner radius.
const TIP_ARROW_INSET = 16;

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
  leaveByDay = {},
  obByDay = {},
  schedule = DEFAULT_SCHEDULE,
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
    // "Weekend" is now whatever this employee's rest days are.
    const isWeekend = schedule.isRestDay(date);
    const holiday = schedule.holidayOn(date);
    const beforeStart = empStart && date < empStart;

    // An attendance row outranks leave: if they clocked in that day, that
    // is what happened, whatever the leave calendar said was planned.
    const leave = !isWeekend && !beforeStart ? (leaveByDay[d] ?? null) : null;
    const ob = !isWeekend && !beforeStart ? (obByDay[d] ?? null) : null;

    let key = null;
    if (row) key = row.status === "late" ? "late" : "present";
    else if (ob) key = "ob";
    else if (leave) key = "leave";
    // A holiday outranks absence: nobody was expected in.
    else if (holiday && !isWeekend) key = "holiday";
    else if (
      date < startOfToday &&
      !isWeekend &&
      !holiday &&
      !beforeStart
    )
      key = "absent";

    return { date, row, leave, ob, holiday, isWeekend, beforeStart, key };
  };

  // The legend was three static swatches restating what the colours already
  // mean. Counting the month as it is read makes that same row answer "how
  // did this month go" without anyone tallying cells by eye.
  const tally = { present: 0, late: 0, absent: 0, leave: 0, ob: 0, holiday: 0 };
  for (let d = 1; d <= lastDay; d++) {
    const { key } = describe(d);
    if (key) tally[key]++;
  }
  const tracked =
    tally.present +
    tally.late +
    tally.absent +
    tally.leave +
    tally.ob +
    tally.holiday;

  const show = (d) => (e) => {
    const cell = e.currentTarget;
    const grid = cell.parentElement;
    const centre = cell.offsetLeft + cell.offsetWidth / 2;

    // At the Sunday and Saturday columns a centred tooltip hangs outside the
    // card and gets clipped. Pin it inside the grid instead and slide the
    // arrow the other way so it still points at its own cell. Below about
    // 170px of grid there is nothing to pin it to — both clamps fight and
    // it overflows either side — so a narrow grid just centres it.
    const half = TIP_WIDTH / 2;
    const width = grid.clientWidth;
    const x =
      width <= TIP_WIDTH
        ? width / 2
        : Math.min(Math.max(centre, half), width - half);

    // Held off the rounded corners, where the arrow would otherwise poke
    // out of the side of the bubble instead of the bottom of it.
    const reach = half - TIP_ARROW_INSET;
    const arrow = Math.max(-reach, Math.min(centre - x, reach));

    // The top row has nothing above it but the weekday header, which the
    // tooltip would land on top of. Those cells get it underneath instead.
    const below = cell.offsetTop < cell.offsetHeight;

    setActive({
      day: d,
      x,
      y: below
        ? cell.offsetTop + cell.offsetHeight + TIP_GAP
        : cell.offsetTop - TIP_GAP,
      arrow,
      below,
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
            <div
              key={i}
              className={`calendar-weekday${
                schedule.restDays.includes(i) ? " is-weekend" : ""
              }`}
            >
              {d}
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
                {/* Always rendered, so numbers sit on one baseline whether
                    or not the day has a record. */}
                <span
                  className={key ? `day-mark mark-${key}` : "day-mark"}
                  aria-hidden="true"
                />
              </button>
            );
          })}

          {activeInfo && (
            <div
              className={active.below ? "cal-tip is-below" : "cal-tip"}
              style={{
                left: active.x,
                top: active.y,
                "--arrow": `${active.arrow}px`,
              }}
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
                  <i className={`day-mark mark-${activeInfo.key}`} />
                  {activeInfo.ob
                    ? "Official business"
                    : activeInfo.leave
                      ? LEAVE_TYPE_LABEL[activeInfo.leave.type]
                      : activeInfo.key === "holiday"
                        ? activeInfo.holiday.name
                        : STATUS[activeInfo.key].label}
                </div>
              ) : (
                <div className="cal-tip-muted">
                  {activeInfo.beforeStart
                    ? "Before start date"
                    : activeInfo.holiday
                      ? activeInfo.holiday.name
                      : activeInfo.isWeekend
                        ? "Rest day"
                        : "No record"}
                </div>
              )}
              {activeInfo.ob && !activeInfo.row && (
                <div className="cal-tip-times">
                  {activeInfo.ob.destination}
                </div>
              )}
              {activeInfo.leave?.reason && !activeInfo.row && (
                <div className="cal-tip-times">{activeInfo.leave.reason}</div>
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
          <span key={k} className={tally[k] ? undefined : "is-empty"}>
            <i className={`day-mark mark-${k}`} />
            {meta.label}
            <b className="legend-count">{tally[k]}</b>
          </span>
        ))}
        {tracked === 0 && (
          <span className="legend-note">Nothing recorded yet</span>
        )}
      </div>
    </section>
  );
}
