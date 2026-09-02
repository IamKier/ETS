import { useEffect, useRef, useState } from "react";
import { ChevronDown, Settings, LogOut } from "lucide-react";

function initials(name, email) {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email || "?").slice(0, 2).toUpperCase();
}

export default function AccountMenu({
  email,
  profile,
  active,
  onOpenSettings,
  onSignOut,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const itemsRef = useRef([]);

  // Pointer down rather than click: a click listener fires after the
  // browser has already moved focus, so a mousedown on the page behind the
  // menu would leave it open under the thing the user just clicked.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        // Focus goes back to what opened the menu, otherwise it lands on
        // <body> and the next Tab starts from the top of the page.
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

  // Opening with the keyboard should land on the first item; opening with
  // the mouse should not steal the pointer's place, but focusing anyway is
  // harmless and keeps the two paths identical.
  useEffect(() => {
    if (open) itemsRef.current[0]?.focus();
  }, [open]);

  // Up and down wrap around the two items, which is what a menu is expected
  // to do once focus is inside it.
  const onItemKeyDown = (e, index) => {
    const items = itemsRef.current.filter(Boolean);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const delta = e.key === "ArrowDown" ? 1 : -1;
    items[(index + delta + items.length) % items.length]?.focus();
  };

  const choose = (action) => {
    setOpen(false);
    action();
  };

  const name = profile?.full_name || email.split("@")[0];

  return (
    <div className="account-anchor" ref={rootRef}>
      <button
        className={`account-btn${active ? " active" : ""}`}
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account"
      >
        <span className="avatar" aria-hidden="true">
          {initials(profile?.full_name, email)}
        </span>
        <span className="account-text">
          <span className="account-name">{name}</span>
          <span className="account-role">{profile?.role || "employee"}</span>
        </span>
        <ChevronDown
          size={15}
          className={`account-chevron${open ? " is-open" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="account-menu" role="menu" aria-label="Account">
          <button
            type="button"
            role="menuitem"
            ref={(el) => {
              itemsRef.current[0] = el;
            }}
            onKeyDown={(e) => onItemKeyDown(e, 0)}
            onClick={() => choose(onOpenSettings)}
          >
            <Settings size={15} />
            Profile &amp; settings
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            ref={(el) => {
              itemsRef.current[1] = el;
            }}
            onKeyDown={(e) => onItemKeyDown(e, 1)}
            onClick={() => choose(onSignOut)}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
