"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSave } from "@/components/ui/SaveStatus";
import { RETURN_STATUS } from "@/lib/constants";
import type { ReturnTicket } from "@/lib/types";
import { useProject } from "./ProjectProvider";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-5 first:border-t-0">
      <h2 className="text-xl">{title}</h2>
      <div className="mt-2 space-y-1">{children}</div>
    </section>
  );
}
const Empty = () => <p className="text-ink-muted">Nothing recorded yet.</p>;

// Built entirely from saved project data.
export function ProjectStory() {
  const { data, nodesOf, nameOf } = useProject();
  const p = data.project!;
  const problemNodes = nodesOf("problem_map");
  const evidence = nodesOf("evidence_map");
  const assumptions = nodesOf("assumption_map");
  const failures = nodesOf("failure_map");
  const changes = nodesOf("version_map").filter((n) => n.node_type === "change");
  const humanTasks = nodesOf("human_ai_map").filter((n) => n.category === "human" || n.category === "human_ai");
  const v1 = data.prototypes[0];
  const vLast = data.prototypes.length > 1 ? data.prototypes[data.prototypes.length - 1] : undefined;
  const credits = data.ai.reduce((a, x) => a + x.credit_cost, 0);
  const verifiedEvidence = evidence.filter((n) => n.metadata?.verification_status === "verified" || n.metadata?.verification_status === "contradicted");
  const verifiedAI = data.ai.filter((a) => a.verification_completed);
  const ticket = data.returnTickets[0];
  const firstEvents = [...data.events].reverse();
  const firstProblemAt = firstEvents.find((e) => e.metadata?.map_type === "problem_map")?.created_at;

  const list = (items: string[]) => (items.length ? <ul className="list-disc pl-5">{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : <Empty />);

  return (
    <article aria-labelledby="story-h" className="card card-pad">
      <p className="eyebrow">Project Story</p>
      <h1 id="story-h" className="mt-1 text-3xl">{data.team!.name}</h1>
      <p className="mt-1 text-sm text-ink-muted">Generated from your team&apos;s saved work. Update the work and this page updates too.</p>

      <Block title="Problem">{p.problem_statement ? <p>{p.problem_statement}</p> : <Empty />}</Block>
      <Block title="User">{p.primary_user ? <p>{p.primary_user}</p> : <Empty />}</Block>
      <Block title="What We Initially Thought">
        {list(problemNodes.filter((n) => new Date(n.created_at) <= new Date(new Date(firstProblemAt ?? p.created_at).getTime() + 30 * 60_000)).map((n) => `${n.category}: ${n.content}`))}
      </Block>
      <Block title="Evidence">{list(evidence.map((n) => `${n.content} (${String(n.metadata?.verification_status ?? "not verified").replace(/_/g, " ")})`))}</Block>
      <Block title="Assumptions">{list(assumptions.map((n) => `${n.metadata?.critical ? "CRITICAL: " : ""}${n.content} [${n.category.replace(/_/g, " ")}]`))}</Block>
      <Block title="Selected Solution">{p.selected_solution ? <p>{p.selected_solution}</p> : <Empty />}</Block>
      <Block title="Prototype V1">{v1 ? <p><span className="font-semibold">{v1.title}.</span> {v1.description}</p> : <Empty />}</Block>
      <Block title="Testing">{list(data.tests.map((t) => `${t.test_description}${t.findings ? `. Finding: ${t.findings}` : ""}`))}</Block>
      <Block title="What Failed">
        {list([
          ...data.tests.filter((t) => t.passed === false).map((t) => t.actual_result || t.test_description),
          ...failures.map((n) => `${n.category.replace(/_/g, " ")}: ${n.content}`),
        ])}
      </Block>
      <Block title="What Changed">{list(changes.map((c) => String((c.metadata as Record<string, string>).change ?? c.content)))}</Block>
      <Block title="Prototype V2">{vLast ? <p><span className="font-semibold">V{vLast.version_number}: {vLast.title}.</span> {vLast.description}</p> : <Empty />}</Block>
      <Block title="AI Use Summary">
        <p>{data.ai.length} logged interactions using {credits} of {data.team!.ai_credit_total} credits.</p>
        <p>
          Accepted {data.ai.filter((a) => a.disposition === "accepted").length}, changed {data.ai.filter((a) => a.disposition === "modified").length},
          rejected {data.ai.filter((a) => a.disposition === "rejected").length}.
          {data.ai.some((a) => a.over_budget) ? " Some logs went over budget." : ""}
        </p>
        <p>Tools used: {Array.from(new Set(data.ai.map((a) => a.tool_name))).join(", ") || "none"}.</p>
      </Block>
      <Block title="What We Verified">
        {list([...verifiedEvidence.map((n) => `${n.content} (${String(n.metadata?.verification_status)})`), ...verifiedAI.map((a) => `AI output checked: ${a.task_description}`)])}
      </Block>
      <Block title="Human Contributions">
        {list([
          ...humanTasks.map((n) => `${n.category === "human" ? "Human" : "Human + AI"}: ${n.content}`),
          ...data.decisions.filter((d) => d.status === "accepted" || d.status === "modified").map((d) => `Team decision: ${d.title}`),
        ])}
        <p className="text-sm text-ink-muted">Contributors: {data.members.map((m) => nameOf(m.user_id)).join(", ")}</p>
      </Block>
      <Block title="AI Recommendations Modified/Rejected">
        {list(data.aiRejections.map((r) => (r.none_rejected ? `None rejected. ${r.justification}` : `${r.recommendation} (${r.team_decision}). ${r.rationale}`)))}
      </Block>
      <Block title="Final Status">
        <p>Stage: {p.current_stage}. Prototype version {p.current_version}.</p>
        {ticket && <p>Return Ticket: {RETURN_STATUS.find((s) => s.key === ticket.current_status)?.label}</p>}
      </Block>
      <Block title="Next Step">{ticket?.next_build_objective ? <p>{ticket.next_build_objective}</p> : p.current_sprint_objective ? <p>{p.current_sprint_objective}</p> : <Empty />}</Block>
    </article>
  );
}

export function ReturnTicketForm() {
  const { data, me, supabase, nameOf, myRole, isInstructor } = useProject();
  const { track } = useSave();
  const last = data.returnTickets[0];
  const [form, setForm] = useState({ current_status: "continue_building", what_works: "", what_does_not_work: "", what_we_learned: "", next_build_objective: "" });
  const [msg, setMsg] = useState("");
  const canEdit = !!myRole || isInstructor;

  useEffect(() => {
    if (last) setForm({ current_status: last.current_status, what_works: last.what_works, what_does_not_work: last.what_does_not_work, what_we_learned: last.what_we_learned, next_build_objective: last.next_build_objective });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await track(supabase.from("return_tickets").insert({ ...form, project_id: data.project!.id, lab_id: data.project!.lab_id, created_by: me }));
    if (!error) setMsg("Return Ticket saved. Your team will see it when you come back.");
  };
  const f = (k: keyof typeof form, label: string) => (
    <div>
      <label htmlFor={`rt-${k}`} className="label">{label}</label>
      <textarea id={`rt-${k}`} className="input" rows={2} required value={form[k]} onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))} />
    </div>
  );

  return (
    <section id="return-ticket" aria-labelledby="rt-h" className="card card-pad scroll-mt-4">
      <p className="eyebrow">End of session</p>
      <h2 id="rt-h" className="mt-1 text-2xl">Return Ticket</h2>
      {last && <p className="mt-1 text-sm text-ink-muted">Last saved by {nameOf(last.created_by)}. Saving again adds a new ticket and keeps the old one.</p>}
      {canEdit ? (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <fieldset>
            <legend className="label">Project status</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {RETURN_STATUS.map((s) => (
                <label key={s.key} className={`flex items-center gap-2 rounded-btn border p-2 ${form.current_status === s.key ? "border-2 border-navy" : "border-line"}`}>
                  <input type="radio" name="rt-status" checked={form.current_status === s.key} onChange={() => setForm((x) => ({ ...x, current_status: s.key as ReturnTicket["current_status"] }))} />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
          {f("what_works", "What works?")}
          {f("what_does_not_work", "What does not work yet?")}
          {f("what_we_learned", "What did we learn?")}
          {f("next_build_objective", "What is our next build objective?")}
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary">Save Return Ticket</button>
            <span role="status" aria-live="polite" className="text-sm font-semibold text-navy">{msg}</span>
          </div>
        </form>
      ) : last ? (
        <p className="mt-3">{last.next_build_objective}</p>
      ) : null}
      <p className="mt-4 text-sm">
        When the lab ends, each person also completes the <Link href={`/lab/${data.project!.lab_id}/post`}>individual post-lab task and reflection</Link>.
        {data.lab?.gallery_unlocked && <> The <Link href={`/lab/${data.project!.lab_id}/gallery`}>Prototype Gallery</Link> is open.</>}
      </p>
    </section>
  );
}

interface Summary {
  previous_lab_title: string | null;
  return_ticket: Partial<ReturnTicket> | null;
  selected_solution: string;
  problem_statement: string;
  latest_prototype: { version: number; title: string; artifact_url: string } | null;
  tests: number;
}

export function ReassessPanel() {
  const { data, me, supabase, myRole } = useProject();
  const { track } = useSave();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [form, setForm] = useState({ what_changed: "", still_works: "", does_not_work: "", next_objective: "" });
  const [msg, setMsg] = useState("");
  const project = data.project!;
  const done = data.checkins.some((c) => c.lab_id === project.lab_id);

  useEffect(() => {
    supabase.rpc("last_session_summary", { p_project: project.id }).then(({ data: s }) => setSummary(s as Summary));
  }, [project.id, supabase]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await track(supabase.from("returning_checkins").insert({ ...form, project_id: project.id, lab_id: project.lab_id, created_by: me }));
    if (!error) setMsg("Check-in saved. You can move on to TEST from the Project Room.");
  };
  const rt = summary?.return_ticket;
  const q = (k: keyof typeof form, label: string) => (
    <div>
      <label htmlFor={`ri-${k}`} className="label">{label}</label>
      <textarea id={`ri-${k}`} className="input" rows={2} required value={form[k]} onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))} />
    </div>
  );

  return (
    <div className="space-y-6">
      <section aria-labelledby="last-h" className="card card-pad">
        <p className="eyebrow">Returning builder mode</p>
        <h2 id="last-h" className="mt-1 text-3xl">LAST SESSION SUMMARY</h2>
        {!summary ? <p role="status">Loading...</p> : (
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            <div><dt className="eyebrow">Session</dt><dd>{summary.previous_lab_title ?? "Earlier session"}</dd></div>
            <div><dt className="eyebrow">Problem</dt><dd>{summary.problem_statement || "Not recorded"}</dd></div>
            <div><dt className="eyebrow">Selected solution</dt><dd>{summary.selected_solution || "Not recorded"}</dd></div>
            <div><dt className="eyebrow">Latest prototype</dt><dd>{summary.latest_prototype ? `V${summary.latest_prototype.version}: ${summary.latest_prototype.title}` : "None"}</dd></div>
            <div><dt className="eyebrow">Status you left it in</dt><dd>{RETURN_STATUS.find((s) => s.key === rt?.current_status)?.label ?? "No Return Ticket"}</dd></div>
            <div><dt className="eyebrow">Next objective you set</dt><dd>{rt?.next_build_objective || "Not recorded"}</dd></div>
            <div><dt className="eyebrow">What worked</dt><dd>{rt?.what_works || "Not recorded"}</dd></div>
            <div><dt className="eyebrow">What did not work</dt><dd>{rt?.what_does_not_work || "Not recorded"}</dd></div>
          </dl>
        )}
      </section>
      <section aria-labelledby="checkin-h" className="card card-pad">
        <h2 id="checkin-h" className="text-2xl">Team check-in</h2>
        {done && <p className="chip-navy mt-2">{"✓"} Completed for this session</p>}
        {myRole && (
          <form onSubmit={submit} className="mt-4 space-y-3">
            {q("what_changed", "What changed since last time?")}
            {q("still_works", "What still works?")}
            {q("does_not_work", "What does not?")}
            {q("next_objective", "What is your next objective?")}
            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary">Save check-in</button>
              <span role="status" aria-live="polite" className="text-sm font-semibold text-navy">{msg}</span>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
