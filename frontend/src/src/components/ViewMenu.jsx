import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, Check, Rows2, Rows3 } from "lucide-react";
import { PANELS } from "../lib/dashboardView";

// The dashboard's own view control: which panels are on, and how tightly
// they render. Modelled on AccountMenu — same outside-pointerdown close,
// same Escape-returns-focus — because a second popover that behaved
// differently from the first would be the odd one out.
export default function ViewMenu({ view, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  // Pointer down rather than click: a click listener fires after the
  // browser has moved focus, leaving the menu open under whatever was
  // just clicked behind it.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Unlike the account menu, this one stays open while you click through
  // it: turning three panels off is one trip, not three.
  const togglePanel = (key) =>
    onChange({
      ...view,
      panels: { ...view.panels, [key]: !view.panels[key] },
    });

  const hidden = PANELS.filter((p) => !view.panels[p.key]).length;

  return (
    <div className="view-anchor" ref={rootRef}>
      <button
        type="button"
        className={`view-btn${open ? " is-open" : ""}`}
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        View
        {/* The count is the only clue on a collapsed page that anything is
            missing, so it is worth the pixels. */}
        {hidden > 0 && <span className="view-badge">{hidden} hidden</span>}
      </button>

      {open && (
        <div className="view-menu" aria-label="Dashboard view">
          <p className="view-menu-label">Density</p>
          <button
            type="button"
            onClick={() => onChange({ ...view, compact: false })}
            aria-pressed={!view.compact}
          >
            <Rows2 size={15} aria-hidden="true" />
            Comfortable
            {!view.compact && (
              <Check size={15} className="view-check" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...view, compact: true })}
            aria-pressed={view.compact}
          >
            <Rows3 size={15} aria-hidden="true" />
            Compact
            {view.compact && (
              <Check size={15} className="view-check" aria-hidden="true" />
            )}
          </button>

          <p className="view-menu-label">Panels</p>
          {PANELS.map((panel) => (
            <button
              key={panel.key}
              type="button"
              onClick={() => togglePanel(panel.key)}
              aria-pressed={view.panels[panel.key]}
            >
              {/* A box that fills in, rather than an icon that disappears:
                  an empty row and a missing row look the same otherwise. */}
              <span
                className={`view-box${view.panels[panel.key] ? " is-on" : ""}`}
                aria-hidden="true"
              >
                {view.panels[panel.key] && <Check size={11} strokeWidth={3} />}
              </span>
              {panel.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
