"use client";
import { useEffect, useId, useState, type ReactNode } from "react";

export function Collapsible({ title, children, defaultOpen = false, id, badge }: {
  title: string; children: ReactNode; defaultOpen?: boolean; id?: string; badge?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const auto = useId();
  const panelId = `${id ?? auto}-panel`;
  // Open automatically when someone links to this section (for example #project-spec).
  useEffect(() => {
    if (!id) return;
    const check = () => { if (window.location.hash === `#${id}`) setOpen(true); };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [id]);
  return (
    <section id={id} className="card mt-4 scroll-mt-4">
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left font-display text-lg font-bold text-navy"
        >
          <span className="flex items-center gap-2">{title} {badge}</span>
          <span aria-hidden="true" className="text-terra">{open ? "−" : "+"}</span>
        </button>
      </h2>
      <div id={panelId} hidden={!open} className="border-t border-line px-5 py-4">
        {children}
      </div>
    </section>
  );
}
