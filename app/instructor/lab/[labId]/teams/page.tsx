"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { InstructorShell } from "@/components/instructor/InstructorShell";
import { useSave } from "@/components/ui/SaveStatus";
import { ROLE_LABEL, ROLE_ORDER } from "@/lib/constants";
import { getSupabase } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/format";
import type { Team, TeamRole } from "@/lib/types";

interface RosterRow {
  user_id: string; display_name: string; joined_at: string; team_id: string | null; team_role: TeamRole | null;
  last_seen_at: string | null; baseline_done: boolean; post_done: boolean; reflection_done: boolean;
}
interface OldProject { id: string; title: string; lab_id: string; team_name: string; lab_title: string }

function Teams({ labId }: { labId: string }) {
  const supabase = getSupabase();
  const { track } = useSave();
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [newTeam, setNewTeam] = useState("");
  const [oldProjects, setOldProjects] = useState<OldProject[]>([]);
  const [importId, setImportId] = useState("");
  const [importName, setImportName] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [{ data: r }, { data: t }, { data: p }] = await Promise.all([
      supabase.rpc("lab_roster", { p_lab: labId }),
      supabase.from("teams").select("*").eq("lab_id", labId).order("created_at"),
      supabase.from("projects").select("id,team_id,lab_id,title"),
    ]);
    setRoster((r as RosterRow[]) ?? []);
    setTeams((t as Team[]) ?? []);
    const all = (p as { id: string; team_id: string; lab_id: string; title: string }[]) ?? [];
    setProjects(Object.fromEntries(all.filter((x) => x.lab_id === labId).map((x) => [x.team_id, x.id])));
    const others = all.filter((x) => x.lab_id !== labId);
    if (others.length) {
      const [{ data: ot }, { data: ol }] = await Promise.all([
        supabase.from("teams").select("id,name").in("id", others.map((o) => o.team_id)),
        supabase.from("labs").select("id,title").in("id", Array.from(new Set(others.map((o) => o.lab_id)))),
      ]);
      setOldProjects(others.map((o) => ({
        id: o.id, title: o.title, lab_id: o.lab_id,
        team_name: (ot as { id: string; name: string }[] | null)?.find((x) => x.id === o.team_id)?.name ?? "Team",
        lab_title: (ol as { id: string; title: string }[] | null)?.find((x) => x.id === o.lab_id)?.title ?? "Earlier lab",
      })));
    } else setOldProjects([]);
  }, [labId, supabase]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`roster-${labId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `lab_id=eq.${labId}` }, () => load())
      .subscribe();
    const poll = setInterval(load, 20_000);
    return () => { clearInterval(poll); supabase.removeChannel(ch); };
  }, [labId, load, supabase]);

  const act = async (p: PromiseLike<{ error: { message: string } | null }>, text: string) => {
    const { error } = await track(p);
    if (!error) setNotice(text);
    load();
  };

  const createTeam = (e: FormEvent) => {
    e.preventDefault();
    act(supabase.from("teams").insert({ lab_id: labId, name: newTeam.trim() }), `Created ${newTeam.trim()}.`);
    setNewTeam("");
  };

  const unassigned = roster.filter((r) => !r.team_id);

  return (
    <div className="space-y-6">
      <p role="status" aria-live="polite" className="text-sm font-semibold text-navy">{notice}</p>
      <section aria-labelledby="assign-h" className="card card-pad">
        <h2 id="assign-h" className="section-title">Build teams</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <button type="button" className="btn-primary" disabled={unassigned.length === 0}
            onClick={() => act(supabase.rpc("auto_assign_teams", { p_lab: labId }), "Students placed into teams in the order they joined.")}>
            Auto-assign {unassigned.length} waiting student{unassigned.length === 1 ? "" : "s"}
          </button>
          <form onSubmit={createTeam} className="flex items-end gap-2">
            <div>
              <label htmlFor="new-team" className="label">New team name</label>
              <input id="new-team" className="input" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Examples: Team Atlas" />
            </div>
            <button type="submit" className="btn-secondary" disabled={!newTeam.trim()}>Create team</button>
          </form>
        </div>
      </section>

      <section aria-labelledby="teams-h">
        <h2 id="teams-h" className="section-title">Teams</h2>
        <ul className="mt-3 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {teams.map((t) => {
            const members = roster.filter((r) => r.team_id === t.id);
            return (
              <li key={t.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg">{t.name}</h3>
                  <span className="chip">{members.length} member{members.length === 1 ? "" : "s"}</span>
                </div>
                <ul className="mt-2 space-y-2">
                  {members.map((m) => (
                    <li key={m.user_id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-[8rem] font-semibold text-navy">{m.display_name}</span>
                      <label className="sr-only" htmlFor={`role-${m.user_id}`}>Role for {m.display_name}</label>
                      <select id={`role-${m.user_id}`} className="input w-auto py-1 text-sm" value={m.team_role ?? ""}
                        onChange={(e) => act(supabase.rpc("set_member_role", { p_team: t.id, p_user: m.user_id, p_role: e.target.value }), `Role updated for ${m.display_name}.`)}>
                        <option value="" disabled>No role</option>
                        {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <button type="button" className="btn-quiet btn-sm underline"
                        onClick={() => act(supabase.from("team_members").delete().eq("team_id", t.id).eq("user_id", m.user_id), `${m.display_name} removed from ${t.name}.`)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  {projects[t.id] && <Link href={`/project/${projects[t.id]}`} className="btn-primary btn-sm">Open project</Link>}
                  <button type="button" className="btn-secondary btn-sm" onClick={() => act(supabase.rpc("rotate_roles", { p_team: t.id }), `Roles rotated for ${t.name}.`)}>Rotate roles</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="roster-h" className="card card-pad">
        <h2 id="roster-h" className="section-title">Students who joined ({roster.length})</h2>
        <p className="mt-1 text-sm text-ink-muted">Names stay inside the app. Pilot exports replace them with codes.</p>
        <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Roster table">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Lab roster</caption>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-terra">
                <th scope="col" className="py-2 pr-3">Name</th>
                <th scope="col" className="py-2 pr-3">Team</th>
                <th scope="col" className="py-2 pr-3">Baseline</th>
                <th scope="col" className="py-2 pr-3">Post task</th>
                <th scope="col" className="py-2 pr-3">Reflection</th>
                <th scope="col" className="py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.user_id} className="border-b border-line">
                  <td className="py-2 pr-3 font-semibold text-navy">{r.display_name}</td>
                  <td className="py-2 pr-3">
                    <label className="sr-only" htmlFor={`team-${r.user_id}`}>Team for {r.display_name}</label>
                    <select id={`team-${r.user_id}`} className="input w-auto py-1 text-sm" value={r.team_id ?? ""}
                      onChange={(e) => e.target.value && act(supabase.rpc("assign_member", { p_team: e.target.value, p_user: r.user_id, p_role: null }), `${r.display_name} assigned.`)}>
                      <option value="">Not on a team</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">{r.baseline_done ? "✓ Done" : "Not yet"}</td>
                  <td className="py-2 pr-3">{r.post_done ? "✓ Done" : "Not yet"}</td>
                  <td className="py-2 pr-3">{r.reflection_done ? "✓ Done" : "Not yet"}</td>
                  <td className="py-2">{timeAgo(r.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="return-h" className="card card-pad">
        <h2 id="return-h" className="section-title">Returning Builder Mode</h2>
        <p className="mt-1 max-w-3xl text-sm">
          Bring a project from an earlier lab into this one. The project keeps all of its history and starts at REASSESS. Students from the old team who have joined this lab come along automatically.
        </p>
        {oldProjects.length === 0 ? <p className="mt-2 text-sm text-ink-muted">No projects from your earlier labs.</p> : (
          <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => {
            e.preventDefault();
            act(supabase.rpc("import_returning_project", { p_project: importId, p_new_lab: labId, p_team_name: importName.trim() }), "Project reopened in this lab.");
          }}>
            <div>
              <label htmlFor="imp-proj" className="label">Project</label>
              <select id="imp-proj" className="input" value={importId} onChange={(e) => {
                setImportId(e.target.value);
                setImportName(oldProjects.find((o) => o.id === e.target.value)?.team_name ?? "");
              }}>
                <option value="">Choose a project</option>
                {oldProjects.map((o) => <option key={o.id} value={o.id}>{o.team_name}: {o.title} ({o.lab_title})</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="imp-name" className="label">Team name in this lab</label>
              <input id="imp-name" className="input" value={importName} onChange={(e) => setImportName(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary" disabled={!importId || !importName.trim()}>Reopen project here</button>
          </form>
        )}
      </section>
    </div>
  );
}

export default function TeamsPage() {
  const { labId } = useParams<{ labId: string }>();
  return (
    <InstructorShell labId={labId} title="Teams">
      <Teams labId={labId} />
    </InstructorShell>
  );
}
