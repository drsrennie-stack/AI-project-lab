"use client";
import { useState, type FormEvent } from "react";
import { MapCompletion } from "@/components/maps/MapWorkspace";
import { useSave } from "@/components/ui/SaveStatus";
import { ARTIFACT_TYPES } from "@/lib/constants";
import { clockTime } from "@/lib/format";
import type { ArtifactType, TestRow } from "@/lib/types";
import { useProject } from "./ProjectProvider";

export function PrototypeVersions({ heading = "Prototype versions", intro }: { heading?: string; intro?: string }) {
  const { data, me, supabase, nameOf, myRole, isInstructor } = useProject();
  const { track } = useSave();
  const next = (data.prototypes[data.prototypes.length - 1]?.version_number ?? 0) + 1;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ArtifactType>("url");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const canEdit = !!myRole || isInstructor;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await track(supabase.from("prototype_versions").insert({
      project_id: data.project!.id, title: title.trim(), description: description.trim(), artifact_type: type,
      artifact_url: url.trim(), notes: notes.trim(), created_by: me, version_number: next,
    }));
    if (!error) {
      setTitle(""); setDescription(""); setUrl(""); setNotes("");
      setMsg(`Prototype V${next} saved.`);
    }
  };

  const needsLink = ["url", "uploaded_file", "external_app", "document", "presentation"].includes(type);

  return (
    <section aria-labelledby="proto-h" className="space-y-4">
      <h2 id="proto-h" className="text-2xl">{heading}</h2>
      <p className="max-w-3xl">{intro ?? "A prototype does not have to be software. A paper sketch, a document, a slide deck, or a written description of a physical object all count."}</p>
      {canEdit && (
        <form onSubmit={submit} className="card card-pad space-y-3">
          <h3>Save Prototype V{next}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="pv-title" className="label">Title</label>
              <input id="pv-title" className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pv-type" className="label">What kind of prototype?</label>
              <select id="pv-type" className="input" value={type} onChange={(e) => setType(e.target.value as ArtifactType)}>
                {ARTIFACT_TYPES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="pv-desc" className="label">{type === "text_description" || type === "physical_prototype" ? "Describe the prototype" : "What does it do?"}</label>
            <textarea id="pv-desc" className="input" required={!needsLink} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {needsLink && (
            <div>
              <label htmlFor="pv-url" className="label">Link</label>
              <input id="pv-url" type="url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Examples: https://docs.google.com/..." />
              <span className="hint">Share links so your instructor can open them. Do not paste links to anything private.</span>
            </div>
          )}
          <div>
            <label htmlFor="pv-notes" className="label">Notes</label>
            <textarea id="pv-notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={!title.trim() || (!needsLink && !description.trim())}>Save V{next}</button>
            <span role="status" aria-live="polite" className="text-sm font-semibold text-navy">{msg}</span>
          </div>
        </form>
      )}
      <ol className="space-y-3">
        {[...data.prototypes].reverse().map((v) => (
          <li key={v.id} className="card p-4">
            <p className="font-display text-lg font-bold text-navy">V{v.version_number}: {v.title}</p>
            <p className="text-xs text-ink-muted">{ARTIFACT_TYPES.find((a) => a.key === v.artifact_type)?.label} · {nameOf(v.created_by)} · {clockTime(v.created_at)}</p>
            {v.description && <p className="mt-2 whitespace-pre-line">{v.description}</p>}
            {v.artifact_url && <a href={v.artifact_url} target="_blank" rel="noopener" className="mt-1 inline-block">Open V{v.version_number}<span className="sr-only"> (opens in a new tab)</span></a>}
            {v.notes && <p className="mt-1 text-sm text-ink-muted">Notes: {v.notes}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TestsPanel() {
  const { data, me, supabase, nameOf, myRole, isInstructor } = useProject();
  const { track } = useSave();
  const canEdit = !!myRole || isInstructor;
  const latest = data.prototypes[data.prototypes.length - 1];
  const [versionId, setVersionId] = useState<string>("");
  const [testType, setTestType] = useState("user_test");
  const [desc, setDesc] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [passed, setPassed] = useState<"" | "yes" | "no" | "partly">("");
  const [findings, setFindings] = useState("");
  const [msg, setMsg] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await track(supabase.from("tests").insert({
      project_id: data.project!.id, prototype_version_id: versionId || latest?.id || null, test_type: testType,
      test_description: desc.trim(), expected_result: expected.trim(), actual_result: actual.trim(),
      passed: passed === "yes" ? true : passed === "no" ? false : null, findings: findings.trim(), created_by: me,
    }));
    if (!error) { setDesc(""); setExpected(""); setActual(""); setPassed(""); setFindings(""); setMsg("Test saved."); }
  };

  return (
    <section aria-labelledby="tests-h" className="space-y-4">
      <h2 id="tests-h" className="text-2xl">Tests</h2>
      <p className="max-w-3xl">Write down what you expected before you test. Then record what actually happened and what you learned from it.</p>
      {canEdit && (
        <form onSubmit={submit} className="card card-pad space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="t-version" className="label">Which version did you test?</label>
              <select id="t-version" className="input" value={versionId || latest?.id || ""} onChange={(e) => setVersionId(e.target.value)}>
                {data.prototypes.length === 0 && <option value="">No prototype saved yet</option>}
                {data.prototypes.map((v) => <option key={v.id} value={v.id}>V{v.version_number}: {v.title}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="t-type" className="label">Type of test</label>
              <select id="t-type" className="input" value={testType} onChange={(e) => setTestType(e.target.value)}>
                <option value="user_test">Someone tried it</option>
                <option value="walkthrough">Team walkthrough</option>
                <option value="accuracy_check">Accuracy check</option>
                <option value="accessibility_check">Accessibility check</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="t-desc" className="label">What did you test and how?</label>
            <textarea id="t-desc" className="input" required value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="t-exp" className="label">What did you expect to happen?</label>
              <textarea id="t-exp" className="input" rows={2} value={expected} onChange={(e) => setExpected(e.target.value)} />
            </div>
            <div>
              <label htmlFor="t-act" className="label">What actually happened?</label>
              <textarea id="t-act" className="input" rows={2} value={actual} onChange={(e) => setActual(e.target.value)} />
            </div>
          </div>
          <fieldset>
            <legend className="label">Did it work the way you expected?</legend>
            <div className="flex flex-wrap gap-4">
              {[["yes", "Yes"], ["partly", "Partly"], ["no", "No"]].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="radio" name="t-passed" checked={passed === k} onChange={() => setPassed(k as typeof passed)} /> {l}</label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="t-find" className="label">Findings: what did you learn?</label>
            <textarea id="t-find" className="input" value={findings} onChange={(e) => setFindings(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={!desc.trim()}>Save test</button>
            <span role="status" aria-live="polite" className="text-sm font-semibold text-navy">{msg}</span>
          </div>
        </form>
      )}
      <ul className="space-y-3">
        {data.tests.map((t) => <TestCard key={t.id} test={t} nameOf={nameOf} />)}
      </ul>
    </section>
  );
}

function TestCard({ test: t, nameOf }: { test: TestRow; nameOf: (id: string) => string }) {
  const { data } = useProject();
  const v = data.prototypes.find((p) => p.id === t.prototype_version_id);
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-navy">{t.test_description}</p>
        <span className={t.passed === true ? "chip-navy" : t.passed === false ? "chip-terra" : "chip"}>
          {t.passed === true ? "Worked as expected" : t.passed === false ? "Did not work as expected" : "Partly or unclear"}
        </span>
      </div>
      <p className="text-xs text-ink-muted">{v ? `V${v.version_number}` : "No version"} · {nameOf(t.created_by)} · {clockTime(t.created_at)}</p>
      {t.expected_result && <p className="mt-2 text-sm"><span className="font-semibold">Expected:</span> {t.expected_result}</p>}
      {t.actual_result && <p className="mt-1 text-sm"><span className="font-semibold">Actual:</span> {t.actual_result}</p>}
      {t.findings ? <p className="mt-1 text-sm"><span className="font-semibold">Findings:</span> {t.findings}</p> : <p className="mt-1 text-sm text-ink-muted">No findings recorded yet.</p>}
    </li>
  );
}

const VERSION_STEPS = [
  { key: "what_happened", label: "What happened?", help: "What did the test show?" },
  { key: "why", label: "Why?", help: "What do you think caused it?" },
  { key: "evidence", label: "Evidence", help: "What supports that explanation?" },
  { key: "decision", label: "Decision", help: "What did the team decide to do?" },
  { key: "change", label: "Change", help: "What exactly changed in the next version?" },
] as const;

export function VersionMap() {
  const { data, me, supabase, mapOf, nodesOf, nameOf, myRole, isInstructor } = useProject();
  const { track } = useSave();
  const map = mapOf("version_map");
  const changes = nodesOf("version_map").filter((n) => n.node_type === "change");
  const canEdit = !!myRole || isInstructor;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [testId, setTestId] = useState("");
  const [msg, setMsg] = useState("");
  const v1 = data.prototypes[0];
  const v2 = data.prototypes[1];

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!map) return;
    const { error } = await track(supabase.from("map_nodes").insert({
      map_id: map.id, project_id: map.project_id, author_id: me, node_type: "change", category: "change",
      content: (draft.change ?? "").trim(), metadata: { ...draft, test_id: testId || null },
      x_position: 0, y_position: changes.length * 120,
    }));
    if (!error) { setDraft({}); setTestId(""); setMsg("Change documented."); }
  };

  return (
    <section aria-labelledby="vmap-h" className="space-y-4">
      <p className="eyebrow">IMPROVE</p>
      <h2 id="vmap-h" className="text-3xl">Version Map</h2>
      <p className="max-w-3xl">Trace each change from what your test showed to what you changed. Try to document at least three changes.</p>
      <MapCompletion type="version_map" title="Version Map" />
      <p className={changes.length >= 3 ? "chip-navy" : "chip-terra"} role="status">
        {changes.length} of 3 suggested changes documented
      </p>

      <ol className="space-y-2" aria-label="Version flow">
        <li className="state-complete rounded-card p-3 font-bold">VERSION 1{v1 ? `: ${v1.title}` : " (not saved yet)"}</li>
        {changes.map((c, i) => {
          const m = c.metadata as Record<string, string>;
          const test = data.tests.find((t) => t.id === m.test_id);
          return (
            <li key={c.id} className="card p-4">
              <p className="eyebrow">Change {i + 1} · {nameOf(c.author_id)}</p>
              <ol className="mt-2 space-y-1">
                <li className="text-sm"><span className="font-bold text-navy">TEST:</span> {test ? test.test_description : "Not linked"}</li>
                {VERSION_STEPS.map((s) => (
                  <li key={s.key} className="text-sm"><span aria-hidden="true" className="text-terra">{"↓"} </span><span className="font-bold uppercase text-navy">{s.label}</span> {m[s.key] || <span className="text-ink-muted">Missing</span>}</li>
                ))}
              </ol>
            </li>
          );
        })}
        <li className={`${v2 ? "state-complete" : "state-locked"} rounded-card p-3 font-bold`}>VERSION 2{v2 ? `: ${v2.title}` : " (not saved yet)"}</li>
      </ol>

      {canEdit && (
        <form onSubmit={add} className="card card-pad space-y-3">
          <h3>Document a change</h3>
          <div>
            <label htmlFor="vm-test" className="label">Which test led to this change?</label>
            <select id="vm-test" className="input" value={testId} onChange={(e) => setTestId(e.target.value)}>
              <option value="">Choose a test</option>
              {data.tests.map((t) => <option key={t.id} value={t.id}>{t.test_description.slice(0, 80)}</option>)}
            </select>
          </div>
          {VERSION_STEPS.map((s) => (
            <div key={s.key}>
              <label htmlFor={`vm-${s.key}`} className="label">{s.label}</label>
              <textarea id={`vm-${s.key}`} className="input" rows={2} required value={draft[s.key] ?? ""}
                aria-describedby={`vm-${s.key}-h`} onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))} />
              <span id={`vm-${s.key}-h`} className="hint">{s.help}</span>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={VERSION_STEPS.some((s) => !(draft[s.key] ?? "").trim())}>Save change</button>
            <span role="status" aria-live="polite" className="text-sm font-semibold text-navy">{msg}</span>
          </div>
        </form>
      )}
    </section>
  );
}

export function AIRejectionPanel() {
  const { data, me, supabase, nameOf, myRole, isInstructor } = useProject();
  const { track } = useSave();
  const canEdit = !!myRole || isInstructor;
  const [none, setNone] = useState(false);
  const [recommendation, setRecommendation] = useState("");
  const [tool, setTool] = useState("");
  const [decision, setDecision] = useState("rejected");
  const [rationale, setRationale] = useState("");
  const [justification, setJustification] = useState("");
  const [msg, setMsg] = useState("");
  const modifiedOrRejected = data.ai.filter((a) => a.disposition === "modified" || a.disposition === "rejected");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await track(supabase.from("ai_rejections").insert(none
      ? { project_id: data.project!.id, none_rejected: true, justification: justification.trim(), created_by: me }
      : { project_id: data.project!.id, recommendation: recommendation.trim(), source_tool: tool.trim(), team_decision: decision, rationale: rationale.trim(), created_by: me }));
    if (!error) setMsg("Reflection saved.");
  };

  return (
    <section aria-labelledby="rej-h" className="space-y-4">
      <h2 id="rej-h" className="text-2xl">Identify one AI recommendation your team modified or rejected.</h2>
      {data.aiRejections.length > 0 && (
        <ul className="space-y-2">
          {data.aiRejections.map((r) => (
            <li key={r.id} className="card state-complete p-4 text-sm">
              {r.none_rejected ? (
                <p><span className="font-bold">No AI recommendation was rejected.</span> {r.justification}</p>
              ) : (
                <>
                  <p><span className="font-bold">Recommendation:</span> {r.recommendation} ({r.source_tool || "tool not named"})</p>
                  <p><span className="font-bold">Team decision:</span> {r.team_decision === "modified" ? "Changed it" : "Rejected it"}</p>
                  <p><span className="font-bold">Why:</span> {r.rationale}</p>
                </>
              )}
              <p className="mt-1 text-xs text-ink-muted">Recorded by {nameOf(r.created_by)}</p>
            </li>
          ))}
        </ul>
      )}
      {modifiedOrRejected.length > 0 && (
        <div className="card p-4 text-sm">
          <p className="font-semibold text-navy">From your AI log, your team changed or rejected:</p>
          <ul className="mt-1 list-disc pl-5">{modifiedOrRejected.map((a) => <li key={a.id}>{a.task_description} ({a.tool_name})</li>)}</ul>
        </div>
      )}
      {canEdit && (
        <form onSubmit={submit} className="card card-pad space-y-3">
          <label className="flex items-center gap-2 font-semibold text-navy">
            <input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} />
            No AI recommendation was rejected.
          </label>
          {none ? (
            <div>
              <label htmlFor="rj-just" className="label">Explain why the team accepted every AI recommendation</label>
              <textarea id="rj-just" className="input" required value={justification} onChange={(e) => setJustification(e.target.value)} />
              <span className="hint">An honest answer is better than an invented one. Say how you checked the AI output.</span>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="rj-rec" className="label">What did the AI recommend?</label>
                <textarea id="rj-rec" className="input" required value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="rj-tool" className="label">Which AI tool?</label>
                  <input id="rj-tool" className="input" value={tool} onChange={(e) => setTool(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="rj-dec" className="label">What did the team decide?</label>
                  <select id="rj-dec" className="input" value={decision} onChange={(e) => setDecision(e.target.value)}>
                    <option value="rejected">We rejected it</option>
                    <option value="modified">We changed it</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="rj-why" className="label">Why?</label>
                <textarea id="rj-why" className="input" required value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </div>
            </>
          )}
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={none ? !justification.trim() : !recommendation.trim() || !rationale.trim()}>Save reflection</button>
            <span role="status" aria-live="polite" className="text-sm font-semibold text-navy">{msg}</span>
          </div>
        </form>
      )}
    </section>
  );
}
