"use client";
import Link from "next/link";
import { useState } from "react";
import { useSave } from "@/components/ui/SaveStatus";
import { STAGE_GUIDE, STAGE_LABEL } from "@/lib/constants";
import { useProject } from "./ProjectProvider";

export function StagePanel() {
  const { data, supabase, isInstructor, myRole, refresh } = useProject();
  const { track } = useSave();
  const project = data.project!;
  const gate = data.gate;
  const guide = STAGE_GUIDE[project.current_stage];
  const [msg, setMsg] = useState("");
  const base = `/project/${project.id}`;

  const advance = async () => {
    setMsg("");
    const { data: r, error } = await track(supabase.rpc("advance_stage", { p_project: project.id }));
    if (error) return setMsg(error.message);
    const res = r as { ok: boolean; reason?: string; stage?: string };
    if (res.ok) {
      setMsg(`Moved to ${res.stage}.`);
      refresh(["project", "team", "events"]);
    } else if (res.reason === "requirements_not_met") {
      setMsg("Not yet. Finish the items that are not checked.");
    }
  };

  const override = (key: string) => track(supabase.rpc("grant_override", { p_project: project.id, p_key: key, p_note: "" }));
  const gateKey = `gate:${project.current_stage}:${project.lab_id}`;
  const hasItemOverride = (key: string) => data.overrides.some((o) => o.gate_key === key);

  return (
    <section aria-labelledby="stage-h" className="card card-pad">
      <p className="eyebrow">Current stage</p>
      <h2 id="stage-h" className="mt-1 font-display text-4xl font-extrabold">{project.current_stage}</h2>

      <div className="mt-5 grid gap-6 md:grid-cols-3">
        <div>
          <h3 className="text-sm uppercase tracking-[0.15em] text-terra">Why this matters</h3>
          <p className="mt-2">{guide.why}</p>
        </div>
        <div>
          <h3 className="text-sm uppercase tracking-[0.15em] text-terra">Your team must</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {guide.mustDo.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <ul className="mt-3 flex flex-wrap gap-2">
            {guide.activities.map((a) => (
              <li key={a.label}>
                <Link href={a.href.startsWith("#") ? a.href : `${base}/${a.href}`} className="btn-secondary btn-sm">{a.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm uppercase tracking-[0.15em] text-terra">Done when</h3>
          {gate && gate.items.length > 0 ? (
            <ul className="mt-2 space-y-2" aria-live="polite">
              {gate.items.map((i) => (
                <li key={i.key} className="flex items-start gap-2">
                  <span aria-hidden="true" className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-btn text-xs font-bold ${i.met ? "state-complete" : "state-locked"}`}>
                    {i.met ? "✓" : ""}
                  </span>
                  <span className={i.met ? "font-semibold text-navy" : ""}>
                    {i.label}<span className="sr-only">{i.met ? ": done" : ": not done"}</span>
                    {isInstructor && i.overridable && !i.met && !hasItemOverride(i.key) && (
                      <button type="button" className="btn-quiet btn-sm ml-1 underline" onClick={() => override(i.key)}>Override</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-ink-muted">This is the final stage.</p>
          )}
          {gate?.gate_override && <p className="mt-2 text-sm font-semibold text-navy">Your instructor approved moving on.</p>}
        </div>
      </div>

      {gate?.next_stage && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          {(myRole || isInstructor) && (
            <button type="button" className="btn-accent" onClick={advance}
              aria-disabled={!(gate.all_met || gate.gate_override || isInstructor)}>
              Complete {project.current_stage} and move to {gate.next_stage}
            </button>
          )}
          {!gate.all_met && !gate.gate_override && (
            <span className="text-sm text-ink-muted">
              {STAGE_LABEL[gate.next_stage]} unlocks when every item is checked{isInstructor ? ". As instructor you can move the team on anyway." : "."}
            </span>
          )}
          {isInstructor && !gate.all_met && !gate.gate_override && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => override(gateKey)}>Approve this gate for the team</button>
          )}
          <span role="status" aria-live="polite" className="text-sm font-semibold text-navy">{msg}</span>
        </div>
      )}
    </section>
  );
}
