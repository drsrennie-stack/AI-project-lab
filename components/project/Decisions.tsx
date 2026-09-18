"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { MapCompletion } from "@/components/maps/MapWorkspace";
import { useSave } from "@/components/ui/SaveStatus";
import { CRITERIA, DECISION_STATUS_LABEL, MATRIX_NOTICE, RESPONSE_LABEL, SPEC_FIELDS } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { Criterion, Decision, DecisionResponse, SpecField } from "@/lib/types";
import { useProject } from "./ProjectProvider";

export function DecisionMatrix({ onPropose }: { onPropose: (title: string, value: string) => void }) {
  const { data, nodesOf, supabase, me, myRole, isInstructor } = useProject();
  const { track } = useSave();
  const concepts = nodesOf("idea_map").filter((n) => n.status === "in_matrix");
  const canEdit = !!myRole || isInstructor;
  const [localScores, setLocalScores] = useState<Record<string, number>>({});

  const scoreOf = (nodeId: string, c: Criterion) =>
    localScores[`${nodeId}:${c}`] ?? data.scores.find((s) => s.idea_node_id === nodeId && s.criterion === c)?.score;

  const setScore = async (nodeId: string, c: Criterion, value: number) => {
    setLocalScores((s) => ({ ...s, [`${nodeId}:${c}`]: value }));
    await track(supabase.from("matrix_scores").upsert(
      { idea_node_id: nodeId, project_id: data.project!.id, criterion: c, score: value, updated_by: me },
      { onConflict: "idea_node_id,criterion" },
    ));
  };

  return (
    <section aria-labelledby="matrix-h" className="space-y-4">
      <header>
        <p className="eyebrow">DECIDE</p>
        <h2 id="matrix-h" className="mt-1 text-3xl">Decision Matrix</h2>
        <p className="mt-2 max-w-3xl">
          Compare at least three solution concepts. Score each criterion from 1 (weak) to 5 (strong). Talk about the scores as a team before you choose.
        </p>
      </header>
      <div className="state-unlocked rounded-card p-4">
        <p className="font-bold text-navy">{MATRIX_NOTICE}</p>
      </div>
      <MapCompletion type="decision_matrix" title="Decision Matrix" />

      {concepts.length === 0 ? (
        <p className="card card-pad">
          No concepts yet. Open an idea on the <Link href={`/project/${data.project!.id}/ideas`}>Idea Map</Link> and choose Send to Decision Matrix.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line" tabIndex={0} role="region" aria-label="Decision Matrix table">
          <table className="w-full min-w-[860px] text-left text-sm">
            <caption className="sr-only">Decision Matrix. Rows are solution concepts, columns are criteria scored 1 to 5.</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="p-3 text-xs uppercase tracking-wider text-terra">Concept</th>
                {CRITERIA.map((c) => (
                  <th key={c.key} scope="col" className="p-2 text-xs uppercase tracking-wider text-terra">
                    {c.label}
                    <span className="block normal-case tracking-normal text-ink-muted">{c.help}</span>
                  </th>
                ))}
                <th scope="col" className="p-2 text-xs uppercase tracking-wider text-terra">Total</th>
                <th scope="col" className="p-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {concepts.map((n) => {
                const vals = CRITERIA.map((c) => scoreOf(n.id, c.key));
                const total = vals.reduce<number>((a, v) => a + (v ?? 0), 0);
                const missing = vals.filter((v) => v === undefined).length;
                return (
                  <tr key={n.id} className="border-b border-line align-top">
                    <th scope="row" className="p-3 font-semibold text-navy">{n.content}</th>
                    {CRITERIA.map((c) => (
                      <td key={c.key} className="p-2">
                        <label className="sr-only" htmlFor={`s-${n.id}-${c.key}`}>{c.label} score for {n.content}</label>
                        <select id={`s-${n.id}-${c.key}`} className="input w-16 px-2 py-1" disabled={!canEdit}
                          value={scoreOf(n.id, c.key) ?? ""} onChange={(e) => setScore(n.id, c.key, Number(e.target.value))}>
                          <option value="" disabled>-</option>
                          {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                    ))}
                    <td className="p-2 font-bold text-navy">{total}{missing > 0 && <span className="block text-xs font-normal text-ink-muted">{missing} not scored</span>}</td>
                    <td className="p-2">
                      {canEdit && (
                        <button type="button" className="btn-secondary btn-sm" onClick={() => onPropose(`Choose "${n.content.slice(0, 60)}" as our solution`, n.content)}>
                          Propose as our solution
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data.project!.selected_solution && (
        <p className="card card-pad"><span className="eyebrow block">Selected solution</span><span className="mt-1 block text-lg font-bold text-navy">{data.project!.selected_solution}</span></p>
      )}
    </section>
  );
}

export interface ProposalSeed { title: string; spec_field: SpecField | ""; spec_value: string }

export function DecisionBoard({ seed, onSeedUsed }: { seed?: ProposalSeed | null; onSeedUsed?: () => void }) {
  const { data, me, supabase, myRole, isInstructor } = useProject();
  const { track } = useSave();
  const canEdit = !!myRole || isInstructor;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const [specField, setSpecField] = useState<SpecField | "">("");
  const [specValue, setSpecValue] = useState("");
  const [lastSeed, setLastSeed] = useState<ProposalSeed | null>(null);

  if (seed && seed !== lastSeed) {
    setLastSeed(seed);
    setTitle(seed.title);
    setSpecField(seed.spec_field);
    setSpecValue(seed.spec_value);
    onSeedUsed?.();
  }

  const propose = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await track(supabase.from("decisions").insert({
      project_id: data.project!.id, proposed_by: me, title: title.trim(), description: description.trim(),
      evidence_reference: evidence.trim(), spec_field: specField || null, spec_value: specField ? specValue.trim() : "",
    }));
    if (!error) { setTitle(""); setDescription(""); setEvidence(""); setSpecField(""); setSpecValue(""); }
  };

  const open = data.decisions.filter((d) => d.status === "proposed" || d.status === "under_discussion");
  const closed = data.decisions.filter((d) => !(d.status === "proposed" || d.status === "under_discussion"));

  return (
    <section id="decisions" aria-labelledby="dboard-h" className="scroll-mt-4 space-y-4">
      <h2 id="dboard-h" className="text-2xl">Team decisions</h2>
      {canEdit && (
        <form id="propose-form" onSubmit={propose} className="card card-pad space-y-3">
          <h3>Propose a decision</h3>
          <div>
            <label htmlFor="d-title" className="label">Decision</label>
            <input id="d-title" className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Examples: Focus on students in their first semester" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="d-desc" className="label">Why are you proposing this?</label>
              <textarea id="d-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label htmlFor="d-ev" className="label">Evidence it is based on</label>
              <textarea id="d-ev" className="input" rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Examples: Test 2 findings, Evidence Map claim about rereading" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="d-field" className="label">If accepted, update the Project Specification?</label>
              <select id="d-field" className="input" value={specField} onChange={(e) => setSpecField(e.target.value as SpecField | "")}>
                <option value="">No, just record the decision</option>
                {SPEC_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            {specField && (
              <div>
                <label htmlFor="d-value" className="label">New text for {SPEC_FIELDS.find((f) => f.key === specField)?.label}</label>
                <textarea id="d-value" className="input" rows={2} required value={specValue} onChange={(e) => setSpecValue(e.target.value)} />
              </div>
            )}
          </div>
          <button type="submit" className="btn-primary" disabled={!title.trim() || (!!specField && !specValue.trim())}>Propose decision</button>
        </form>
      )}

      <div>
        <h3 className="mb-2">Open ({open.length})</h3>
        {open.length === 0 && <p className="text-sm text-ink-muted">No open decisions.</p>}
        <ul className="space-y-3">{open.map((d) => <DecisionCard key={d.id} decision={d} />)}</ul>
      </div>
      <div>
        <h3 className="mb-2">Resolved ({closed.length})</h3>
        <ul className="space-y-3">{closed.map((d) => <DecisionCard key={d.id} decision={d} />)}</ul>
      </div>
    </section>
  );
}

function DecisionCard({ decision: d }: { decision: Decision }) {
  const { data, me, nameOf, supabase, myRole, isInstructor } = useProject();
  const { track } = useSave();
  const responses = data.responses.filter((r) => r.decision_id === d.id);
  const mine = responses.find((r) => r.user_id === me);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [rationale, setRationale] = useState(d.rationale);
  const [finalValue, setFinalValue] = useState(d.spec_value);
  const [resolveErr, setResolveErr] = useState("");
  const isOpen = d.status === "proposed" || d.status === "under_discussion";
  const canEdit = !!myRole || isInstructor;

  const respond = (type: DecisionResponse["response_type"]) =>
    track(supabase.from("decision_responses").upsert(
      { decision_id: d.id, project_id: d.project_id, user_id: me, response_type: type, comment: comment.trim() },
      { onConflict: "decision_id,user_id" },
    ));

  const resolve = async (status: Decision["status"]) => {
    setResolveErr("");
    if (["accepted", "modified", "rejected"].includes(status) && !rationale.trim()) {
      setResolveErr("Write the team's rationale first.");
      return;
    }
    const patch: Partial<Decision> = { status, rationale: rationale.trim() };
    if (d.spec_field && finalValue.trim()) patch.spec_value = finalValue.trim();
    const { error } = await track(supabase.from("decisions").update(patch).eq("id", d.id));
    if (error) setResolveErr(error.message);
  };

  const counts = (["support", "question", "modify", "reject"] as const).map((k) => [k, responses.filter((r) => r.response_type === k).length] as const);

  return (
    <li id={`decision-${d.id}`} className={`card scroll-mt-4 p-4 ${d.status === "accepted" || d.status === "modified" ? "state-complete" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-bold text-navy">{d.title}</p>
          <p className="text-xs text-ink-muted">Proposed by {nameOf(d.proposed_by)} · {timeAgo(d.created_at)}</p>
        </div>
        <span className={isOpen ? "chip-terra" : d.status === "rejected" ? "chip" : "chip-navy"}>{DECISION_STATUS_LABEL[d.status]}</span>
      </div>
      {d.description && <p className="mt-2">{d.description}</p>}
      {d.evidence_reference && <p className="mt-1 text-sm"><span className="font-semibold">Evidence:</span> {d.evidence_reference}</p>}
      {d.spec_field && (
        <p className="mt-1 text-sm"><span className="font-semibold">Updates {SPEC_FIELDS.find((f) => f.key === d.spec_field)?.label}:</span> {d.spec_value}</p>
      )}
      <p className="mt-2 text-sm text-ink-muted">{counts.map(([k, n]) => `${RESPONSE_LABEL[k]} ${n}`).join(" · ")}</p>
      {responses.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {responses.map((r) => (
            <li key={r.id}><span className="font-semibold">{nameOf(r.user_id)}:</span> {RESPONSE_LABEL[r.response_type]}{r.comment ? `. ${r.comment}` : ""}</li>
          ))}
        </ul>
      )}
      {!isOpen && d.rationale && <p className="mt-2 text-sm"><span className="font-semibold">Rationale:</span> {d.rationale}</p>}

      {isOpen && myRole && (
        <div className="mt-3 border-t border-line pt-3">
          <label htmlFor={`c-${d.id}`} className="label">Your response (optional comment)</label>
          <input id={`c-${d.id}`} className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Respond to this decision">
            {(["support", "question", "modify", "reject"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={mine?.response_type === k}
                className={`btn btn-sm ${mine?.response_type === k ? "border-navy bg-navy text-white" : "border-navy bg-white text-navy"}`}
                onClick={() => respond(k)}>
                {RESPONSE_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      )}

      {isOpen && canEdit && (
        <div className="mt-3 border-t border-line pt-3">
          <label htmlFor={`r-${d.id}`} className="label">Team rationale</label>
          <textarea id={`r-${d.id}`} className="input" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)}
            placeholder="Examples: Three of us supported it after the test showed users skipped session two." />
          {d.spec_field && (
            <>
              <label htmlFor={`fv-${d.id}`} className="label mt-2">Final text for {SPEC_FIELDS.find((f) => f.key === d.spec_field)?.label} (edit if the team changed it)</label>
              <textarea id={`fv-${d.id}`} className="input" rows={2} value={finalValue} onChange={(e) => setFinalValue(e.target.value)} />
            </>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={() => resolve("accepted")}>Mark accepted</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => resolve("modified")}>Accepted with changes</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => resolve("rejected")}>Mark rejected</button>
          </div>
          <p role="status" aria-live="polite" className="mt-1 text-sm font-semibold text-danger">{resolveErr}</p>
        </div>
      )}
      {!isOpen && canEdit && (
        <button type="button" className="btn-quiet btn-sm mt-2 underline" onClick={() => resolve("under_discussion")}>Reopen for discussion</button>
      )}
    </li>
  );
}
