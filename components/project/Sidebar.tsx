"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useSave } from "@/components/ui/SaveStatus";
import { ALERT_TYPES, DECISION_STATUS_LABEL, alertLabel, describeEvent } from "@/lib/constants";
import { clockTime, timeAgo } from "@/lib/format";
import type { Alert, AlertType } from "@/lib/types";
import { useProject } from "./ProjectProvider";

export function Sidebar() {
  return (
    <aside aria-label="Team activity" className="space-y-4 pt-4">
      <InstructorMessage />
      <AlertsPanel />
      <HuddleButton />
      <OpenDecisions />
      <Feed />
    </aside>
  );
}

function InstructorMessage() {
  const { data, nameOf } = useProject();
  const latest = data.messages[0];
  return (
    <section aria-labelledby="msg-h" className="card p-4">
      <h2 id="msg-h" className="eyebrow">Instructor message</h2>
      <div aria-live="polite">
        {latest ? (
          <div className="mt-2">
            <p className="font-semibold text-navy">{latest.body}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {latest.team_id ? "To your team" : "To the whole class"} · {nameOf(latest.author_id)} · {clockTime(latest.created_at)}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No messages yet.</p>
        )}
      </div>
      {data.messages.length > 1 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold text-navy">Earlier messages</summary>
          <ul className="mt-2 space-y-2">
            {data.messages.slice(1, 8).map((m) => (
              <li key={m.id}>{m.body} <span className="text-xs text-ink-muted">({clockTime(m.created_at)})</span></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function AlertsPanel() {
  const { data, me, myRole, nameOf, supabase, isInstructor } = useProject();
  const { track } = useSave();
  const [open, setOpen] = useState<null | "flag" | "attention">(null);
  const unresolved = data.alerts.filter((a) => a.status !== "resolved");

  const setStatus = (a: Alert, status: Alert["status"]) =>
    track(supabase.from("alerts").update({ status }).eq("id", a.id));

  return (
    <section aria-labelledby="alerts-h" className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="alerts-h" className="eyebrow">Alerts</h2>
        <span className={unresolved.length ? "chip-danger" : "chip"}>{unresolved.length} open</span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {myRole === "red_team" && (
          <button type="button" className="btn-accent w-full text-base" onClick={() => setOpen("flag")}>
            <span aria-hidden="true">{"⚑"}</span> FLAG ISSUE
          </button>
        )}
        {(myRole || isInstructor) && (
          <button type="button" className="btn-secondary w-full" onClick={() => setOpen("attention")}>Request team attention</button>
        )}
      </div>
      <ul className="mt-3 space-y-2" aria-live="polite">
        {unresolved.map((a) => (
          <li key={a.id} className={`rounded-btn border p-3 ${a.is_red_team_flag ? "border-2 border-terra" : "border-line"}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-terra">
              {a.is_red_team_flag ? "Red Team flag: " : ""}{alertLabel(a.alert_type)}
            </p>
            <p className="mt-1 font-semibold text-navy">{a.message}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {nameOf(a.created_by)} · {timeAgo(a.created_at)} · {a.status === "acknowledged" ? "Acknowledged" : "Unresolved"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {a.status === "unresolved" && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setStatus(a, "acknowledged")}>Acknowledge</button>
              )}
              <button type="button" className="btn-primary btn-sm" onClick={() => setStatus(a, "resolved")}>Mark resolved</button>
            </div>
          </li>
        ))}
      </ul>
      <AlertDialog key={open ?? "closed"} mode={open} onClose={() => setOpen(null)} me={me} />
    </section>
  );
}

function AlertDialog({ mode, onClose, me }: { mode: null | "flag" | "attention"; onClose: () => void; me: string | null }) {
  const { data, supabase } = useProject();
  const { track } = useSave();
  const [type, setType] = useState<AlertType>(mode === "attention" ? "team_decision_needed" : "evidence_problem");
  const [message, setMessage] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!me || !data.project) return;
    const { error } = await track(supabase.from("alerts").insert({
      project_id: data.project.id, created_by: me, alert_type: type, message: message.trim(), is_red_team_flag: mode === "flag",
    }));
    if (!error) {
      setMessage("");
      onClose();
    }
  };
  return (
    <Dialog open={mode !== null} onClose={onClose} title={mode === "flag" ? "Flag an issue" : "Request team attention"}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="alert-type" className="label">Type of issue</label>
          <select id="alert-type" className="input" value={type} onChange={(e) => setType(e.target.value as AlertType)}>
            {ALERT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="alert-msg" className="label">What does the team need to know?</label>
          <textarea id="alert-msg" className="input" required value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="Examples: Our main claim has no source yet." />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className={mode === "flag" ? "btn-accent" : "btn-primary"} disabled={!message.trim()}>
            {mode === "flag" ? "Raise flag" : "Send alert"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function HuddleButton() {
  const { data, supabase } = useProject();
  const { track } = useSave();
  const open = data.huddles.find((h) => !h.completed_at);
  const stage = data.project?.current_stage;
  const suggested =
    (stage === "DECIDE" && !data.huddles.some((h) => new Date(h.started_at) > new Date(data.project!.stage_started_at))) ||
    (stage === "BUILD" && data.prototypes.length === 1 && !data.huddles.some((h) => new Date(h.started_at) > new Date(data.prototypes[0].created_at))) ||
    (stage === "IMPROVE" && !data.huddles.some((h) => new Date(h.started_at) > new Date(data.project!.stage_started_at)));
  const start = () => track(supabase.rpc("start_huddle", { p_project: data.project!.id, p_reason: "Team started", p_lock: false }));
  return (
    <section aria-labelledby="huddle-h" className="card p-4">
      <h2 id="huddle-h" className="eyebrow">Huddle</h2>
      {open ? (
        <p className="mt-2 text-sm font-semibold text-navy">A huddle is open. It is at the top of your workspace.</p>
      ) : (
        <>
          {suggested && (
            <p className="mt-2 text-sm text-navy" role="status">
              <span className="font-bold">Suggested now.</span>{" "}
              {stage === "DECIDE" ? "You just finished EXPLORE." : stage === "BUILD" ? "You just finished your first build sprint." : "You just finished TEST."}
            </p>
          )}
          <button type="button" className="btn-secondary mt-2 w-full" onClick={start}>Start a team huddle</button>
        </>
      )}
    </section>
  );
}

function OpenDecisions() {
  const { data, nameOf } = useProject();
  const open = data.decisions.filter((d) => d.status === "proposed" || d.status === "under_discussion");
  return (
    <section aria-labelledby="dec-h" className="card p-4">
      <div className="flex items-center justify-between">
        <h2 id="dec-h" className="eyebrow">Current decisions</h2>
        <Link href={`/project/${data.project!.id}/decision#decisions`} className="text-sm font-semibold">Open board</Link>
      </div>
      {open.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">No open decisions.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {open.map((d) => (
            <li key={d.id} className="text-sm">
              <Link href={`/project/${data.project!.id}/decision#decision-${d.id}`} className="font-semibold">{d.title}</Link>
              <span className="block text-xs text-ink-muted">{DECISION_STATUS_LABEL[d.status]} · proposed by {nameOf(d.proposed_by)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Feed() {
  const { data, nameOf } = useProject();
  const [showMoves, setShowMoves] = useState(false);
  const events = data.events.filter((e) => showMoves || e.event_type !== "node_moved").slice(0, 60);
  return (
    <section aria-labelledby="feed-h" className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="feed-h" className="eyebrow">Team feed</h2>
        <label className="flex items-center gap-1 text-xs text-ink-muted">
          <input type="checkbox" checked={showMoves} onChange={(e) => setShowMoves(e.target.checked)} /> Show card moves
        </label>
      </div>
      <ol className="mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1" aria-live="polite" aria-relevant="additions" tabIndex={0} aria-label="Team feed, newest first">
        {events.map((e) => (
          <li key={e.id} className="text-sm">
            <span className="font-semibold text-navy">{nameOf(e.user_id)}</span> {describeEvent(e.event_type, e.metadata)}
            <span className="block text-xs text-ink-muted">
              <time dateTime={e.created_at}>{clockTime(e.created_at)}</time>{e.stage ? ` · ${e.stage}` : ""}
            </span>
          </li>
        ))}
        {events.length === 0 && <li className="text-sm text-ink-muted">Activity will appear here as your team works.</li>}
      </ol>
    </section>
  );
}
