"use client";
import { useRef, type KeyboardEvent } from "react";

export function Tabs({ tabs, active, onChange, label }: {
  tabs: { key: string; label: string; done?: boolean }[]; active: string; onChange: (k: string) => void; label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = tabs.length - 1;
    if (n >= 0) {
      e.preventDefault();
      onChange(tabs[n].key);
      refs.current[n]?.focus();
    }
  };
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex flex-wrap gap-2 border-b border-line pb-2">
      {tabs.map((t, i) => (
        <button
          key={t.key}
          ref={(el) => { refs.current[i] = el; }}
          role="tab"
          type="button"
          id={`tab-${t.key}`}
          aria-selected={active === t.key}
          aria-controls={`panel-${t.key}`}
          tabIndex={active === t.key ? 0 : -1}
          onClick={() => onChange(t.key)}
          onKeyDown={(e) => onKey(e, i)}
          className={`btn btn-sm ${active === t.key ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:bg-navy-tint"}`}
        >
          {t.label}
          {t.done && <span className="sr-only"> (complete)</span>}
          {t.done && <span aria-hidden="true">{"✓"}</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0}>
      {children}
    </div>
  );
}
