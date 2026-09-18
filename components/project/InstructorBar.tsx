"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSave } from "@/components/ui/SaveStatus";
import { STAGE_LABEL, stagesFor } from "@/lib/constants";
import type { Stage } from "@/lib/types";
import { useProject } from "./ProjectProvider";

export function InstructorBar() {
  const { data, supabase, me } = useProject();
  const { track } = useSave();
  const project = data.project!;
  const [stage, setStage] = useState<Stage>(project.current_stage);
  const [message, setMessage] = useState("");
  const [lock, setLock] = useState(false);
  const [sent, setSent] = useState("");

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await track(supabase.from("messages").insert({
      lab_id: project.lab_id, team_id: project.team_id, author_id: me, body: message.trim(),
    }));
    if (!error) { setMessage(""); setSent("Message sent to this team."); }
  };

  return (
    <section aria-label="Instructor controls" className="bg-navy text-white [&_*:focus-visible]:outline-white">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-end gap-4 px-4 py-3 text-sm">
        <p className="font-bold uppercase tracking-[0.2em]">Instructor view</p>
        <Link href={`/instructor/lab/${project.lab_id}`} className="text-white underline hover:text-white">Back to dashboard</Link>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="ib-stage" className="block text-xs font-semibold">Unlock stage</label>
            <select id="ib-stage" className="input py-1 text-sm" value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
              {stagesFor(project.flow).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-sm border-white bg-white text-navy hover:bg-navy-tint"
            onClick={() => track(supabase.rpc("set_stage", { p_project: project.id, p_stage: stage }))}>
            Set stage
          </button>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> Pause workspace</label>
          <button type="button" className="btn btn-sm border-white bg-white text-navy hover:bg-navy-tint"
            onClick={() => track(supabase.rpc("start_huddle", { p_project: project.id, p_reason: "Instructor called a huddle", p_lock: lock }))}>
            Trigger huddle
          </button>
          <button type="button" className="btn btn-sm border-white bg-white text-navy hover:bg-navy-tint"
            onClick={() => track(supabase.rpc("rotate_roles", { p_team: project.team_id }))}>
            Rotate roles
          </button>
        </div>
        <form onSubmit={send} className="flex flex-1 items-end gap-2">
          <div className="flex-1">
            <label htmlFor="ib-msg" className="block text-xs font-semibold">Message this team</label>
            <input id="ib-msg" className="input py-1 text-sm" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-sm border-white bg-white text-navy hover:bg-navy-tint" disabled={!message.trim()}>Send</button>
          <span role="status" aria-live="polite" className="text-xs">{sent}</span>
        </form>
      </div>
    </section>
  );
}
