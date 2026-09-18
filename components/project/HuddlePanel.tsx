"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useSave } from "@/components/ui/SaveStatus";
import { timeAgo } from "@/lib/format";
import type { Huddle } from "@/lib/types";
import { useProject } from "./ProjectProvider";

const QUESTIONS = [
  { key: "learned", label: "What did you learn since the last huddle?" },
  { key: "recommendation", label: "What do you recommend the team do next?" },
  { key: "uncertainty", label: "What are you still unsure about?" },
  { key: "team_need", label: "What do you need from the team?" },
] as const;

type Answers = Record<(typeof QUESTIONS)[number]["key"], string>;

export function HuddlePanel({ huddle }: { huddle: Huddle }) {
  const { data, me, nameOf, supabase, myRole, isInstructor } = useProject();
  const { track } = useSave();
  const responses = data.huddleResponses.filter((r) => r.huddle_id === huddle.id);
  const mine = responses.find((r) => r.user_id === me);
  const [answers, setAnswers] = useState<Answers>({ learned: "", recommendation: "", uncertainty: "", team_need: "" });
  const [objective, setObjective] = useState("");
  const [err, setErr] = useState("");

  // Load my saved answers once. Later refreshes must not overwrite text I am still typing.
  const mineId = mine?.id;
  useEffect(() => {
    if (mine) setAnswers({ learned: mine.learned, recommendation: mine.recommendation, uncertainty: mine.uncertainty, team_need: mine.team_need });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineId]);

  const saveMine = async (e: FormEvent) => {
    e.preventDefault();
    if (!me) return;
    await track(supabase.from("huddle_responses").upsert(
      { huddle_id: huddle.id, project_id: huddle.project_id, user_id: me, ...answers },
      { onConflict: "huddle_id,user_id" },
    ));
  };

  const complete = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    const { error } = await track(supabase.rpc("complete_huddle", { p_huddle: huddle.id, p_objective: objective }));
    if (error) setErr(error.message);
  };

  const pendingNames = data.members.filter((m) => !responses.some((r) => r.user_id === m.user_id)).map((m) => nameOf(m.user_id));

  return (
    <section aria-labelledby="huddle-title" className="card card-pad mb-4 border-2 border-navy" role="region">
      <p className="eyebrow">Team huddle</p>
      <h2 id="huddle-title" className="mt-1 text-2xl">Pause and regroup</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Started {timeAgo(huddle.started_at)} by {nameOf(huddle.triggered_by)}{huddle.reason ? ` (${huddle.reason})` : ""}.
        Everyone answers on their own, then the team agrees on the next sprint objective.
      </p>

      {myRole && (
        <form onSubmit={saveMine} className="mt-4 grid gap-3 md:grid-cols-2">
          {QUESTIONS.map((q) => (
            <div key={q.key}>
              <label htmlFor={`h-${q.key}`} className="label">{q.label}</label>
              <textarea id={`h-${q.key}`} className="input" value={answers[q.key]}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))} />
            </div>
          ))}
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary">{mine ? "Update my response" : "Submit my response"}</button>
          </div>
        </form>
      )}

      <div className="mt-5">
        <h3>Team responses ({responses.length} of {data.members.length})</h3>
        {pendingNames.length > 0 && <p className="text-sm text-ink-muted">Waiting on: {pendingNames.join(", ")}</p>}
        <ul className="mt-2 grid gap-3 md:grid-cols-2">
          {responses.map((r) => (
            <li key={r.id} className="rounded-btn border border-line p-3 text-sm">
              <p className="font-bold text-navy">{nameOf(r.user_id)}</p>
              {QUESTIONS.map((q) => r[q.key] && (
                <p key={q.key} className="mt-1"><span className="font-semibold">{q.label}</span> {r[q.key]}</p>
              ))}
            </li>
          ))}
        </ul>
      </div>

      {(myRole || isInstructor) && (
        <form onSubmit={complete} className="mt-5 border-t border-line pt-4">
          <label htmlFor="next-objective" className="label">NEXT SPRINT OBJECTIVE</label>
          <input id="next-objective" className="input" value={objective} onChange={(e) => setObjective(e.target.value)}
            placeholder="Examples: Test V1 with two classmates and record what confused them." />
          <div aria-live="assertive">{err && <p className="mt-1 text-sm font-semibold text-danger">{err}</p>}</div>
          <button type="submit" className="btn-accent mt-3" disabled={!objective.trim()}>Finish huddle and set objective</button>
        </form>
      )}
    </section>
  );
}
