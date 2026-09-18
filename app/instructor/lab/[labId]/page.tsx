"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { InstructorShell, useLab } from "@/components/instructor/InstructorShell";
import { StageProgress } from "@/components/project/RoomShell";
import { useSave } from "@/components/ui/SaveStatus";
import { getSupabase } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/format";
import type { DashboardTeam, Stage } from "@/lib/types";

const INDICATOR = {
  green: { label: "Progressing", symbol: "●", cls: "chip-ok" },
  yellow: { label: "Needs attention", symbol: "▲", cls: "chip-warn" },
  red: { label: "Likely stuck", symbol: "■", cls: "chip-danger" },
} as const;

function Dashboard({ labId }: { labId: string }) {
  const supabase = getSupabase();
  const { track } = useSave();
  const lab = useLab(labId);
  const [teams, setTeams] = useState<DashboardTeam[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [err, setErr] = useState("");
  const [classMsg, setClassMsg] = useState("");
  const [lock, setLock] = useState(false);
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("lab_dashboard", { p_lab: labId });
    if (error) setErr(error.message);
    else { setErr(""); setTeams(data as DashboardTeam[]); setUpdatedAt(new Date()); }
  }, [labId, supabase]);

  useEffect(() => {
    load();
    const soon = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(load, 1500); };
    const ch = supabase.channel(`dash-${labId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events", filter: `lab_id=eq.${labId}` }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `lab_id=eq.${labId}` }, soon)
      .subscribe();
    const poll = setInterval(load, 30_000); // time-based flags (inactivity) need a clock
    return () => { clearInterval(poll); supabase.removeChannel(ch); };
  }, [labId, load, supabase]);

  const sendClass = async (e: FormEvent) => {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await track(supabase.from("messages").insert({ lab_id: labId, team_id: null, author_id: u.user!.id, body: classMsg.trim() }));
    if (!error) { setClassMsg(""); setNotice("Announcement sent to every team."); }
  };

  const labUpdate = async (patch: Record<string, unknown>, text: string) => {
    const { error } = await track(supabase.from("labs").update(patch).eq("id", labId));
    if (!error) setNotice(text);
  };

  const counts = teams ? { red: teams.filter((t) => t.indicator === "red").length, yellow: teams.filter((t) => t.indicator === "yellow").length } : null;

  return (
    <div className="space-y-6">
      <section aria-labelledby="class-h" className="card card-pad">
        <h2 id="class-h" className="section-title">Whole class</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <form onSubmit={sendClass} className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="class-msg" className="label">Class announcement</label>
              <input id="class-msg" className="input" value={classMsg} onChange={(e) => setClassMsg(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary" disabled={!classMsg.trim()}>Send</button>
          </form>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> Pause workspaces during huddle</label>
            <button type="button" className="btn-secondary" onClick={async () => { await track(supabase.rpc("start_huddle_for_lab", { p_lab: labId, p_reason: "Instructor called a class huddle", p_lock: lock })); setNotice("Huddle started for every team."); load(); }}>
              Huddle all teams
            </button>
            <button type="button" className="btn-secondary" onClick={async () => { await track(supabase.rpc("rotate_roles_for_lab", { p_lab: labId })); setNotice("Roles rotated for every team."); load(); }}>
              ROLE ROTATION for all teams
            </button>
            {lab && (
              <button type="button" className={lab.gallery_unlocked ? "btn-secondary" : "btn-accent"}
                onClick={() => labUpdate({ gallery_unlocked: !lab.gallery_unlocked }, lab.gallery_unlocked ? "Gallery hidden." : "Prototype Gallery unlocked for students.")}>
                {lab.gallery_unlocked ? "Hide Prototype Gallery" : "Unlock Prototype Gallery"}
              </button>
            )}
          </div>
        </div>
        <p role="status" aria-live="polite" className="mt-2 text-sm font-semibold text-navy">{notice}</p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title">Teams</h2>
        <p className="text-sm text-ink-muted" role="status" aria-live="polite">
          {counts && `${counts.red} likely stuck, ${counts.yellow} need attention. `}
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}.` : ""}
        </p>
      </div>
      <p className="text-sm text-ink-muted">Indicators describe workflow state only, not the quality of student work.</p>
      {err && <p role="alert" className="font-semibold text-danger">{err}</p>}
      {!teams ? <p role="status">Loading teams...</p> : teams.length === 0 ? (
        <p className="card card-pad">No teams yet. <Link href={`/instructor/lab/${labId}/teams`}>Create or assign teams</Link>.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {teams.map((t) => <TeamCard key={t.team_id} team={t} labId={labId} onChange={load} />)}
        </ul>
      )}
    </div>
  );
}

function TeamCard({ team: t, labId, onChange }: { team: DashboardTeam; labId: string; onChange: () => void }) {
  const supabase = getSupabase();
  const { track } = useSave();
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState("");
  const ind = INDICATOR[t.indicator];

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await track(supabase.from("messages").insert({ lab_id: labId, team_id: t.team_id, author_id: u.user!.id, body: msg.trim() }));
    if (!error) { setMsg(""); setSent("Sent."); }
  };

  const stat = (label: string, value: string | number, warn = false) => (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-terra">{label}</dt>
      <dd className={`font-semibold ${warn ? "text-danger" : "text-navy"}`}>{value}</dd>
    </div>
  );

  return (
    <li className={`card p-4 ${t.indicator === "red" ? "border-2 border-danger" : t.indicator === "yellow" ? "border-2 border-warn" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xl">{t.team_name}</h3>
          <p className="text-sm text-ink-muted">{t.current_stage} for {t.minutes_in_stage} min{t.flow === "returning" ? " · returning project" : ""}</p>
        </div>
        <span className={ind.cls}><span aria-hidden="true">{ind.symbol}</span> {ind.label}</span>
      </div>
      <div className="mt-3"><StageProgress current={t.current_stage as Stage} flow={t.flow as "standard" | "returning"} /></div>

      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        {stat("Credits left", t.credits_remaining, t.credits_remaining < 25)}
        {stat("Active now", `${t.active_members} of ${t.members}`, t.members > 0 && t.active_members === 0)}
        {stat("Last activity", timeAgo(t.last_activity))}
        {stat("Required maps", `${t.required_maps_complete} of ${t.required_maps}`)}
        {stat("Open alerts", t.open_alerts, t.open_alerts > 0)}
        {stat("Open decisions", t.open_decisions)}
        {stat("Verification", `${t.evidence_verified} of ${t.evidence_claims} claims${t.ai_verification_pending ? `, ${t.ai_verification_pending} AI pending` : ""}`)}
        {stat("Prototype", t.prototype_versions ? `V${t.prototype_versions}` : "None")}
        {stat("Huddle", t.huddle_open ? "Open now" : t.last_huddle_at ? timeAgo(t.last_huddle_at) : "None yet")}
      </dl>

      {t.gate.items.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-terra">Incomplete to leave {t.current_stage}</p>
          <ul className="mt-1 text-sm">
            {t.gate.items.filter((i) => !i.met).map((i) => <li key={i.key}>{"○"} {i.label}</li>)}
            {t.gate.items.every((i) => i.met) && <li className="font-semibold text-navy">{"✓"} Ready to move on</li>}
          </ul>
        </div>
      )}

      {t.flags.length > 0 && (
        <ul className="mt-3 space-y-1" aria-label="Flags">
          {t.flags.map((f) => (
            <li key={f.key} className={f.level === "red" ? "chip-danger" : "chip-warn"}>
              <span aria-hidden="true">{f.level === "red" ? "■" : "▲"}</span> {f.label}
            </li>
          ))}
        </ul>
      )}
      {t.sprint_objective && <p className="mt-3 text-sm"><span className="font-semibold">Sprint objective:</span> {t.sprint_objective}</p>}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        <Link href={`/project/${t.project_id}`} className="btn-primary btn-sm">Open project</Link>
        <button type="button" className="btn-secondary btn-sm" onClick={async () => { await track(supabase.rpc("start_huddle", { p_project: t.project_id, p_reason: "Instructor called a huddle", p_lock: false })); onChange(); }}>
          Trigger huddle
        </button>
        {!t.gate.all_met && t.gate.next_stage && (
          <button type="button" className="btn-secondary btn-sm"
            onClick={async () => { await track(supabase.rpc("grant_override", { p_project: t.project_id, p_key: `gate:${t.current_stage}:${labId}`, p_note: "Approved from dashboard" })); onChange(); }}>
            Approve gate
          </button>
        )}
      </div>
      <form onSubmit={send} className="mt-2 flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={`tm-${t.team_id}`} className="sr-only">Message {t.team_name}</label>
          <input id={`tm-${t.team_id}`} className="input py-1 text-sm" placeholder={`Message ${t.team_name}`} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </div>
        <button type="submit" className="btn-secondary btn-sm" disabled={!msg.trim()}>Send</button>
        <span role="status" className="text-xs text-navy">{sent}</span>
      </form>
    </li>
  );
}

export default function LabDashboardPage() {
  const { labId } = useParams<{ labId: string }>();
  return (
    <InstructorShell labId={labId} title="Live dashboard">
      <Dashboard labId={labId} />
    </InstructorShell>
  );
}
