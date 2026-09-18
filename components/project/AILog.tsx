"use client";
import { useState, type FormEvent } from "react";
import { useSave } from "@/components/ui/SaveStatus";
import { AI_TOOLS, INTERACTION_TYPES } from "@/lib/constants";
import { clockTime } from "@/lib/format";
import type { AIInteraction, InteractionType } from "@/lib/types";
import { useProject } from "./ProjectProvider";

export function AILogForm({ onDone }: { onDone?: () => void }) {
  const { data, me, supabase, myRole } = useProject();
  const { track } = useSave();
  const [tool, setTool] = useState(AI_TOOLS[0]);
  const [otherTool, setOtherTool] = useState("");
  const [task, setTask] = useState("");
  const [type, setType] = useState<InteractionType>("quick_clarification");
  const [usefulness, setUsefulness] = useState<string>("");
  const [disposition, setDisposition] = useState<string>("");
  const [verifyRequired, setVerifyRequired] = useState(false);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const cost = INTERACTION_TYPES.find((t) => t.key === type)!.cost;
  const remaining = data.team!.ai_credit_remaining;

  if (!myRole) return <p className="text-sm text-ink-muted">Only team members log AI use.</p>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!me) return;
    const toolName = tool === "Other approved tool" ? otherTool.trim() || "Other" : tool;
    const { error } = await track(supabase.from("ai_interactions").insert({
      project_id: data.project!.id, user_id: me, tool_name: toolName, task_description: task.trim(), interaction_type: type,
      credit_cost: cost, result_usefulness: usefulness || null, disposition: disposition || null,
      verification_required: verifyRequired, notes: notes.trim(),
    }));
    if (!error) {
      setTask(""); setNotes(""); setUsefulness(""); setDisposition(""); setVerifyRequired(false);
      setMsg(`Logged. ${cost} credit${cost === 1 ? "" : "s"} used.`);
      onDone?.();
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="ai-tool" className="label">AI tool</label>
          <select id="ai-tool" className="input" value={tool} onChange={(e) => setTool(e.target.value)}>
            {AI_TOOLS.map((t) => <option key={t}>{t}</option>)}
          </select>
          {tool === "Other approved tool" && (
            <>
              <label htmlFor="ai-tool-other" className="label mt-2">Tool name</label>
              <input id="ai-tool-other" className="input" value={otherTool} onChange={(e) => setOtherTool(e.target.value)} />
            </>
          )}
        </div>
        <div>
          <label htmlFor="ai-task" className="label">What did you ask AI to do?</label>
          <textarea id="ai-task" className="input" required rows={2} value={task} onChange={(e) => setTask(e.target.value)}
            placeholder="Examples: Asked it to critique our assumption map." />
        </div>
      </div>
      <fieldset>
        <legend className="label">How big was the request?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {INTERACTION_TYPES.map((t) => (
            <label key={t.key} className={`flex cursor-pointer gap-2 rounded-btn border p-3 text-sm ${type === t.key ? "border-2 border-navy" : "border-line"}`}>
              <input type="radio" name="ai-type" value={t.key} checked={type === t.key} onChange={() => setType(t.key)} />
              <span>
                <span className="font-bold text-navy">{t.label}: {t.cost} credit{t.cost === 1 ? "" : "s"}</span>
                <span className="block text-ink-muted">{t.help}</span>
              </span>
            </label>
          ))}
        </div>
        {remaining - cost < 0 && (
          <p className="mt-2 text-sm font-semibold text-danger" role="status">This log will be marked OVER BUDGET. You can still save it.</p>
        )}
      </fieldset>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="ai-useful" className="label">Was the result useful?</label>
          <select id="ai-useful" className="input" value={usefulness} onChange={(e) => setUsefulness(e.target.value)}>
            <option value="">Not sure yet</option>
            <option value="useful">Useful</option>
            <option value="partially_useful">Partly useful</option>
            <option value="not_useful">Not useful</option>
          </select>
        </div>
        <div>
          <label htmlFor="ai-disp" className="label">What did the team do with it?</label>
          <select id="ai-disp" className="input" value={disposition} onChange={(e) => setDisposition(e.target.value)}>
            <option value="">Not decided yet</option>
            <option value="accepted">Accepted it</option>
            <option value="modified">Changed it</option>
            <option value="rejected">Rejected it</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm font-semibold text-navy">
            <input type="checkbox" checked={verifyRequired} onChange={(e) => setVerifyRequired(e.target.checked)} />
            This output needs to be checked
          </label>
        </div>
      </div>
      <div>
        <label htmlFor="ai-notes" className="label">Notes</label>
        <textarea id="ai-notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!task.trim()}>Log AI use ({cost} credit{cost === 1 ? "" : "s"})</button>
        <span role="status" aria-live="polite" className="text-sm text-navy">{msg}</span>
      </div>
    </form>
  );
}

export function AILogList() {
  const { data, nameOf, supabase } = useProject();
  const { track } = useSave();
  const update = (a: AIInteraction, patch: Partial<AIInteraction>) =>
    track(supabase.from("ai_interactions").update(patch).eq("id", a.id));
  if (data.ai.length === 0) return <p className="text-sm text-ink-muted">No AI use logged yet.</p>;
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="AI interaction log table">
      <table className="w-full min-w-[720px] text-left text-sm">
        <caption className="sr-only">AI interaction log</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wider text-terra">
            <th scope="col" className="py-2 pr-3">When</th>
            <th scope="col" className="py-2 pr-3">Who and tool</th>
            <th scope="col" className="py-2 pr-3">Task</th>
            <th scope="col" className="py-2 pr-3">Credits</th>
            <th scope="col" className="py-2 pr-3">Team did</th>
            <th scope="col" className="py-2">Checked</th>
          </tr>
        </thead>
        <tbody>
          {data.ai.map((a) => (
            <tr key={a.id} className="border-b border-line align-top">
              <td className="py-2 pr-3">{clockTime(a.created_at)}<span className="block text-xs text-ink-muted">{a.stage}</span></td>
              <td className="py-2 pr-3">{nameOf(a.user_id)}<span className="block text-xs text-ink-muted">{a.tool_name}</span></td>
              <td className="py-2 pr-3">{a.task_description}{a.notes && <span className="block text-xs text-ink-muted">{a.notes}</span>}</td>
              <td className="py-2 pr-3">
                {a.credit_cost}
                {a.over_budget && <span className="chip-danger ml-1">OVER BUDGET</span>}
              </td>
              <td className="py-2 pr-3">
                <label className="sr-only" htmlFor={`disp-${a.id}`}>What the team did with this output</label>
                <select id={`disp-${a.id}`} className="input py-1 text-sm" value={a.disposition ?? ""}
                  onChange={(e) => update(a, { disposition: (e.target.value || null) as AIInteraction["disposition"] })}>
                  <option value="">Not decided</option>
                  <option value="accepted">Accepted</option>
                  <option value="modified">Changed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </td>
              <td className="py-2">
                {a.verification_required ? (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={a.verification_completed}
                      onChange={(e) => update(a, { verification_completed: e.target.checked })} />
                    {a.verification_completed ? "Verified" : "Needs checking"}
                  </label>
                ) : (
                  <span className="text-ink-muted">Not needed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
