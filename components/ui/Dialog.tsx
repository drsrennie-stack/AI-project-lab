"use client";
import { useEffect, useRef, type ReactNode } from "react";

// Native <dialog>: focus is trapped, Escape closes, focus returns to the opener.
export function Dialog({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dialog-title"
      className={`rounded-card border border-line bg-white p-0 text-ink backdrop:bg-navy/40 ${wide ? "w-[min(760px,94vw)]" : "w-[min(520px,94vw)]"}`}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id="dialog-title" className="text-lg">{title}</h2>
            <button type="button" className="btn-quiet btn-sm" onClick={onClose} aria-label="Close dialog">
              <span aria-hidden="true">{"✕"}</span>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
