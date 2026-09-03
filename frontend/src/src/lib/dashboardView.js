// How much of the dashboard the user wants to see. Two independent axes:
// which panels are on at all, and how densely the ones that are on render.
// Someone who only ever clocks in and out can strip the page back to the
// clock; someone on a laptop screen can keep all four and just tighten
// them up.
//
// Kept out of DashboardPage so the shape is stated in one place and the
// menu and the page cannot drift apart on what a panel is called.

export const PANELS = [
  { key: "stats", label: "Monthly stats" },
  { key: "clock", label: "Clock" },
  { key: "entries", label: "Recent entries" },
  { key: "calendar", label: "Calendar" },
];

export const DEFAULT_VIEW = {
  compact: false,
  panels: { stats: true, clock: true, entries: true, calendar: true },
};

const KEY = "ets:dashboard";

// Same guard rail as the nav state in App.jsx: a private window, blocked
// site data, or a browser set to reject storage throws on access rather
// than returning null. Forgetting the layout is fine; crashing is not.
export function readView() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    return {
      compact: saved.compact === true,
      // Merged onto the defaults rather than replacing them, so a panel
      // added in a later version is on for people with an older key
      // already saved instead of silently missing.
      panels: { ...DEFAULT_VIEW.panels, ...(saved.panels || {}) },
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function writeView(view) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    /* not worth failing a render over */
  }
}
