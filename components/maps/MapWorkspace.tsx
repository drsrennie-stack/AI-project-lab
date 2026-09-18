"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useProject } from "@/components/project/ProjectProvider";
import { useSave } from "@/components/ui/SaveStatus";
import { MAP_CONFIG, THINK_FIRST_TEXT, critiquePrompts, type MapConfig } from "@/lib/constants";
import type { MapRequirement, MapType } from "@/lib/types";
import { MapBoard } from "./MapBoard";

export function useMapRequirements(type: MapType) {
  const { data, supabase, mapOf } = useProject();
  const map = mapOf(type);
  const [reqs, setReqs] = useState<MapRequirement[]>([]);
  const nodeCount = map ? data.nodes.filter((n) => n.map_id === map.id).length : 0;
  const signature = map
    ? data.nodes.filter((n) => n.map_id === map.id).map((n) => `${n.category}:${n.status}:${n.updated_at}`).join("|") +
      data.scores.length + data.overrides.length
    : "";
  useEffect(() => {
    if (!map) return;
    supabase.rpc("map_requirements", { p_map: map.id }).then(({ data: r }) => setReqs((r as MapRequirement[]) ?? []));
  }, [map, signature, supabase]);
  return { map, reqs, met: reqs.length > 0 && reqs.every((r) => r.met), nodeCount };
}

export function MapCompletion({ type, title }: { type: MapType; title: string }) {
  const { supabase, isInstructor, myRole } = useProject();
  const { track } = useSave();
  const { map, reqs, met } = useMapRequirements(type);
  const [msg, setMsg] = useState("");
  if (!map) return null;
  const complete = map.status === "complete";

  const setStatus = async (status: "complete" | "in_progress") => {
    setMsg("");
    const { error } = await track(supabase.from("maps").update({ status }).eq("id", map.id));
    if (error) setMsg(error.message);
    else setMsg(status === "complete" ? `${title} marked complete.` : `${title} reopened.`);
  };

  return (
    <section aria-labelledby={`${type}-req`} className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${type}-req`} className="eyebrow">Minimum to complete</h2>
        <span className={complete ? "chip-navy" : "chip"}>{complete ? "✓ Complete" : map.status === "in_progress" ? "In progress" : "Not started"}</span>
      </div>
      <ul className="mt-2 space-y-1" aria-live="polite">
        {reqs.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className={`inline-flex h-5 w-5 flex-none items-center justify-center rounded-btn text-xs ${r.met ? "state-complete" : "state-locked"}`}>{r.met ? "✓" : ""}</span>
            <span className={r.met ? "font-semibold text-navy" : ""}>
              {r.label} <span className="font-normal text-ink-muted">({Math.min(r.have, r.need)} of {r.need})</span>
            </span>
            <span className="sr-only">{r.met ? "done" : "not done"}</span>
          </li>
        ))}
      </ul>
      {(myRole || isInstructor) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {complete ? (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setStatus("in_progress")}>Reopen map</button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setStatus("complete")} aria-disabled={!met && !isInstructor}
              disabled={!met && !isInstructor}>
              Mark {title} complete
            </button>
          )}
          {!met && !complete && isInstructor && <span className="text-sm text-ink-muted">Instructor: you can complete it before the minimum is met.</span>}
          <span role="status" className="text-sm font-semibold text-navy">{msg}</span>
        </div>
      )}
    </section>
  );
}

export function CritiquePanel({ config, unlocked }: { config: MapConfig; unlocked: boolean }) {
  const { data, nodesOf, mapOf } = useProject();
  const [copied, setCopied] = useState("");
  const [open, setOpen] = useState(false);
  const zones = [...config.categories, ...(mapOf(config.type)?.custom_categories ?? [])];
  const text = zones
    .map((z) => {
      const items = nodesOf(config.type).filter((n) => n.category === z.key).map((n) => `- ${n.content}`);
      return items.length ? `${z.label}:\n${items.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  const prompts = critiquePrompts(config.title, data.lab?.challenge_title ?? "our project", text);

  const copy = async (label: string, t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(`${label} prompt copied. Paste it into your AI tool, then log the AI use.`);
    } catch {
      setCopied("Copy did not work. Select the prompt text and copy it by hand.");
    }
  };

  return (
    <section aria-labelledby={`${config.type}-ai`} className="card p-4">
      <h2 id={`${config.type}-ai`} className="eyebrow">Ask AI to critique</h2>
      {!unlocked ? (
        <div className="state-locked mt-2 rounded-btn p-3">
          <p className="font-bold uppercase tracking-[0.15em] text-navy">Think first</p>
          <p className="mt-1 text-sm">{THINK_FIRST_TEXT}</p>
          <p className="mt-1 text-sm">Critique prompts unlock when the minimum above is met.</p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm">
            This app does not talk to AI. Copy a prompt into the AI tool your class uses, discuss the answer as a team, and log the interaction.
          </p>
          <button type="button" className="btn-secondary btn-sm mt-2" aria-expanded={open} aria-controls={`${config.type}-prompts`} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide prompts" : "Show critique prompts"}
          </button>
          <div id={`${config.type}-prompts`} hidden={!open} className="mt-3 space-y-3">
            {prompts.map((p) => (
              <div key={p.label} className="rounded-btn border border-line p-3">
                <p className="font-semibold text-navy">{p.label}</p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-xs text-ink-muted">{p.text}</pre>
                <button type="button" className="btn-primary btn-sm mt-2" onClick={() => copy(p.label, p.text)}>Copy prompt</button>
              </div>
            ))}
            <p role="status" aria-live="polite" className="text-sm font-semibold text-navy">{copied}</p>
          </div>
        </>
      )}
    </section>
  );
}

function CustomCategories({ type }: { type: MapType }) {
  const { supabase, mapOf, myRole, isInstructor } = useProject();
  const { track } = useSave();
  const map = mapOf(type);
  const [label, setLabel] = useState("");
  if (!map || !(myRole || isInstructor)) return null;
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const key = `custom_${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    if (map.custom_categories.some((c) => c.key === key)) return;
    const { error } = await track(supabase.from("maps").update({ custom_categories: [...map.custom_categories, { key, label: label.trim() }] }).eq("id", map.id));
    if (!error) setLabel("");
  };
  return (
    <form onSubmit={add} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="custom-cat" className="label">Add your own category</label>
        <input id="custom-cat" className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
      </div>
      <button type="submit" className="btn-secondary" disabled={!label.trim()}>Add category</button>
    </form>
  );
}

export function MapWorkspace({ type, children, hideHeader }: { type: keyof typeof MAP_CONFIG; children?: ReactNode; hideHeader?: boolean }) {
  const config = MAP_CONFIG[type];
  const { data } = useProject();
  const { met, map } = useMapRequirements(type);
  const unlocked = !config.thinkFirst || met || map?.status === "complete";
  const inStage = data.project?.current_stage === config.stage;
  return (
    <div className="space-y-4">
      {!hideHeader && (
        <header>
          <p className="eyebrow">{config.stage}</p>
          <h2 className="mt-1 text-3xl">{config.title}</h2>
          {!inStage && <p className="mt-1 text-sm text-ink-muted">Your team is in {data.project?.current_stage}. You can still view and add to this map.</p>}
        </header>
      )}
      {config.thinkFirst && !unlocked && (
        <div className="state-unlocked rounded-card p-4">
          <p className="font-display text-lg font-extrabold uppercase tracking-[0.15em] text-terra">Think first</p>
          <p className="mt-1 font-semibold text-navy">{THINK_FIRST_TEXT}</p>
        </div>
      )}
      <p className="max-w-3xl">{config.intro}</p>
      {children}
      <div className="grid gap-4 xl:grid-cols-2">
        <MapCompletion type={type} title={config.title} />
        <CritiquePanel config={config} unlocked={unlocked} />
      </div>
      {config.allowCustomCategories && <CustomCategories type={type} />}
      <MapBoard config={config} />
    </div>
  );
}
