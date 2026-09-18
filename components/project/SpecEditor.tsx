"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSave } from "@/components/ui/SaveStatus";
import { SPEC_FIELDS } from "@/lib/constants";
import type { Project, SpecField } from "@/lib/types";
import { useProject } from "./ProjectProvider";

type EditableKey = SpecField | "current_sprint_objective";

// Saves one field at a time with optimistic locking, so two people editing
// different fields never overwrite each other, and a stale edit is caught.
export function ProjectField({ field, label, help, rows = 3, readOnly }: {
  field: EditableKey; label: string; help?: string; rows?: number; readOnly?: boolean;
}) {
  const { data, supabase, refresh, nameOf } = useProject();
  const { track, fail } = useSave();
  const project = data.project!;
  const saved = project[field] as string;
  const [draft, setDraft] = useState(saved);
  const [dirty, setDirty] = useState(false);
  const [baseVersion, setBaseVersion] = useState(project.row_version);
  const [baseValue, setBaseValue] = useState(saved);
  const [conflict, setConflict] = useState<Project | null>(null);

  useEffect(() => {
    if (!dirty) {
      setDraft(saved);
      setBaseValue(saved);
      setBaseVersion(project.row_version);
    }
  }, [saved, project.row_version, dirty]);

  const save = async (version = baseVersion) => {
    if (!dirty || draft === baseValue) {
      setDirty(false);
      return;
    }
    const { data: res, error } = await track(
      supabase.rpc("update_project_fields", { p_project: project.id, p_expected_version: version, p_patch: { [field]: draft } }),
    );
    if (error) return;
    const r = res as { ok: boolean; conflict?: boolean; project: Project };
    if (r.conflict) {
      if ((r.project[field] as string) === baseValue) {
        // Someone changed a different field. Retry against the new version.
        return save(r.project.row_version);
      }
      setConflict(r.project);
      fail("A teammate changed this field. Review below.");
      return;
    }
    setDirty(false);
    setConflict(null);
    setBaseValue(draft);
    setBaseVersion(r.project.row_version);
    refresh(["project"]);
  };

  const id = `field-${field}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <textarea
        id={id}
        rows={rows}
        className="input"
        value={draft}
        readOnly={readOnly}
        aria-describedby={help ? `${id}-hint` : undefined}
        onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
        onBlur={() => save()}
      />
      {help && <span id={`${id}-hint`} className="hint">{help}</span>}
      {dirty && !conflict && <span className="hint">Unsaved. Saves when you leave the box.</span>}
      {conflict && (
        <div role="alert" className="mt-2 rounded-btn border-2 border-terra p-3 text-sm">
          <p className="font-semibold text-navy">
            {nameOf(conflict.updated_by)} saved a different version while you were typing. Nothing was overwritten.
          </p>
          <p className="mt-2"><span className="font-semibold">Their version:</span> {(conflict[field] as string) || "(empty)"}</p>
          <p className="mt-1"><span className="font-semibold">Your version:</span> {draft || "(empty)"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={() => { const v = conflict.row_version; setBaseValue(conflict[field] as string); setConflict(null); save(v); }}>Save mine instead</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => { setConflict(null); setDirty(false); setDraft(conflict[field] as string); refresh(["project"]); }}>Keep theirs</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SpecEditor() {
  const { data } = useProject();
  const base = `/project/${data.project!.id}`;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {SPEC_FIELDS.map((f) =>
        f.key === "selected_solution" ? (
          <div key={f.key}>
            <p className="label">{f.label}</p>
            <p className="rounded-btn border border-line-strong bg-page px-3 py-2">{data.project!.selected_solution || "Not chosen yet."}</p>
            <span className="hint">
              The team chooses a solution by accepting a decision. <Link href={`${base}/decision#decisions`}>Go to decisions</Link>
            </span>
          </div>
        ) : (
          <ProjectField key={f.key} field={f.key} label={f.label} help={f.help} />
        ),
      )}
    </div>
  );
}

export function SpecSummary() {
  const { data, nodesOf } = useProject();
  const p = data.project!;
  const critical = nodesOf("assumption_map").filter((n) => n.metadata?.critical === true);
  const evidence = nodesOf("evidence_map");
  const accepted = data.decisions.filter((d) => d.status === "accepted" || d.status === "modified");
  const rows: [string, string][] = SPEC_FIELDS.map((f) => [f.label, p[f.key]]);
  return (
    <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-bold uppercase tracking-wider text-terra">{k}</dt>
          <dd className={v ? "text-navy" : "text-ink-muted"}>{v || "Missing"}</dd>
        </div>
      ))}
      <div>
        <dt className="text-xs font-bold uppercase tracking-wider text-terra">Critical assumptions</dt>
        <dd>{critical.length ? <ul className="list-disc pl-5">{critical.map((n) => <li key={n.id}>{n.content}</li>)}</ul> : <span className="text-ink-muted">Missing</span>}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold uppercase tracking-wider text-terra">Relevant evidence</dt>
        <dd>{evidence.length ? <ul className="list-disc pl-5">{evidence.slice(0, 6).map((n) => <li key={n.id}>{n.content}</li>)}</ul> : <span className="text-ink-muted">Missing</span>}</dd>
      </div>
      <div className="md:col-span-2">
        <dt className="text-xs font-bold uppercase tracking-wider text-terra">Accepted decisions</dt>
        <dd>{accepted.length ? <ul className="list-disc pl-5">{accepted.map((d) => <li key={d.id}><span className="font-semibold">{d.title}.</span> {d.rationale}</li>)}</ul> : <span className="text-ink-muted">None yet</span>}</dd>
      </div>
    </dl>
  );
}
