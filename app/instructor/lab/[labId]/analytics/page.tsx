"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { InstructorShell } from "@/components/instructor/InstructorShell";
import { getSupabase } from "@/lib/supabase/client";

type Row = Record<string, unknown>;
interface Export { exported_at: string; lab: Row; teams: Row[]; events: Row[]; ai_interactions: Row[]; assessments: Row[]; reflections: Row[]; cross_team: Row[] }

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Analytics({ labId }: { labId: string }) {
  const [data, setData] = useState<Export | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const { data: d, error } = await getSupabase().rpc("export_pilot_data", { p_lab: labId });
    if (error) setErr(error.message);
    else setData(d as Export);
  }, [labId]);
  useEffect(() => { load(); }, [load]);

  if (err) return <p role="alert" className="font-semibold text-danger">{err}</p>;
  if (!data) return <p role="status">Building export...</p>;
  const stamp = new Date(data.exported_at).toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const base = `ai-project-lab_${String(data.lab.lab_version)}_${stamp}`;
  const cols: [string, string][] = [
    ["team_id", "Team"], ["final_stage", "Stage"], ["maps_complete", "Maps done"], ["map_nodes", "Map cards"], ["decisions", "Decisions"],
    ["assumptions", "Assumptions"], ["evidence_entries", "Evidence"], ["ai_interactions", "AI logs"], ["credits_used", "Credits used"],
    ["ai_outputs_accepted", "AI accepted"], ["ai_outputs_modified", "AI changed"], ["ai_outputs_rejected", "AI rejected"],
    ["verification_actions", "Verifications"], ["huddles", "Huddles"], ["alerts_raised", "Alerts"], ["tests_conducted", "Tests"],
    ["prototype_versions", "Versions"], ["revisions_documented", "Revisions"], ["completion_status", "Completion"],
  ];

  return (
    <div className="space-y-6">
      <section className="card card-pad" aria-labelledby="exp-h">
        <h2 id="exp-h" className="section-title">De-identified pilot export</h2>
        <p className="mt-1 max-w-3xl text-sm">
          People appear as codes (P01, P02) and teams as T01, T02. Names, emails, and account ids are never included.
          Written answers are included for analysis, so skim them for names before you share the files.
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Lab {String(data.lab.lab_version)} · Curriculum {String(data.lab.curriculum_version)} · Software {String(data.lab.software_version)} · Built {new Date(data.exported_at).toLocaleString()}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => download(`${base}.json`, JSON.stringify(data, null, 2), "application/json")}>Download everything (JSON)</button>
          {([["teams", data.teams], ["events", data.events], ["ai_interactions", data.ai_interactions], ["assessments", data.assessments], ["reflections", data.reflections], ["cross_team", data.cross_team]] as const).map(([k, rows]) => (
            <button key={k} type="button" className="btn-secondary" disabled={rows.length === 0}
              onClick={() => download(`${base}_${k}.csv`, toCsv(rows as Row[]), "text/csv")}>
              {k.replace("_", " ")} CSV ({rows.length})
            </button>
          ))}
          <button type="button" className="btn-quiet" onClick={load}>Refresh</button>
        </div>
      </section>

      <section className="card card-pad" aria-labelledby="sum-h">
        <h2 id="sum-h" className="section-title">Team summary</h2>
        <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Team summary table">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <caption className="sr-only">Per-team pilot measures</caption>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-terra">
                {cols.map(([, l]) => <th key={l} scope="col" className="py-2 pr-3">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <tr key={String(t.team_id)} className="border-b border-line">
                  {cols.map(([k]) => <td key={k} className="py-2 pr-3">{String(t[k] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-pad" aria-labelledby="prepost-h">
        <h2 id="prepost-h" className="section-title">Baseline and post-lab comparison</h2>
        <PrePost rows={data.assessments} />
      </section>
    </div>
  );
}

function PrePost({ rows }: { rows: Row[] }) {
  const people = Array.from(new Set(rows.map((r) => String(r.person))));
  const avg = (kind: string, key: string) => {
    const vals = rows.filter((r) => r.kind === kind && typeof r[key] === "number").map((r) => r[key] as number);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "n/a";
  };
  const paired = people.filter((p) => rows.some((r) => r.person === p && r.kind === "baseline") && rows.some((r) => r.person === p && r.kind === "post")).length;
  return (
    <dl className="mt-3 grid gap-4 sm:grid-cols-3">
      <div><dt className="eyebrow">Paired responses</dt><dd className="font-display text-2xl font-extrabold text-navy">{paired}</dd></div>
      <div><dt className="eyebrow">Average confidence</dt><dd className="text-navy">Baseline {avg("baseline", "confidence_rating")} · Post {avg("post", "confidence_rating")}</dd></div>
      <div><dt className="eyebrow">Average AI interactions</dt><dd className="text-navy">Baseline {avg("baseline", "ai_interaction_count")} · Post {avg("post", "ai_interaction_count")}</dd></div>
    </dl>
  );
}

export default function AnalyticsPage() {
  const { labId } = useParams<{ labId: string }>();
  return <InstructorShell labId={labId} title="Pilot analytics"><Analytics labId={labId} /></InstructorShell>;
}
