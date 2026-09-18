"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppHeader } from "@/components/ui/AppHeader";
import { SaveIndicator } from "@/components/ui/SaveStatus";
import { ROLE_DESCRIPTION, ROLE_LABEL, STAGE_LABEL, creditMessage, stagesFor } from "@/lib/constants";
import { useProject } from "./ProjectProvider";
import { Sidebar } from "./Sidebar";
import { BottomPanels } from "./BottomPanels";
import { HuddlePanel } from "./HuddlePanel";
import { InstructorBar } from "./InstructorBar";
import type { Stage } from "@/lib/types";

export function RoomShell({ children }: { children: ReactNode }) {
  const { data, loading, error, isInstructor } = useProject();
  const openHuddle = data.huddles.find((h) => !h.completed_at);
  const locked = !!openHuddle?.lock_workspace;

  if (loading) {
    return (
      <>
        <AppHeader />
        <main id="main" className="p-8"><p role="status">Loading your project room...</p></main>
      </>
    );
  }
  if (error || !data.project || !data.team) {
    return (
      <>
        <AppHeader />
        <main id="main" className="mx-auto max-w-xl p-8">
          <h1>Project not available</h1>
          <p className="mt-3 text-ink-muted">{error || "This project could not be loaded."}</p>
          <Link href="/" className="btn-primary mt-6">Go home</Link>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader>
        <span className="hidden text-sm text-ink-muted sm:inline">{data.lab?.title}</span>
      </AppHeader>
      {isInstructor && <InstructorBar />}
      <RoomHeader />
      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 pb-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main id="main" tabIndex={-1} className="min-w-0 pt-4">
          <RoleRotationNotice />
          {openHuddle && <HuddlePanel huddle={openHuddle} />}
          {locked && !isInstructor ? (
            <p className="card card-pad mt-4 text-ink-muted">Your instructor paused the workspace for this huddle. Finish the huddle to continue.</p>
          ) : (
            children
          )}
          <BottomPanels />
        </main>
        <Sidebar />
      </div>
      <footer className="border-t border-line py-4 text-center text-xs text-ink-muted">
        AI Project Lab · Lab {data.lab?.lab_version} · Curriculum {data.lab?.curriculum_version} · Software {data.lab?.software_version}
      </footer>
    </>
  );
}

function RoomHeader() {
  const { data, nameOf, me, connection } = useProject();
  const project = data.project!;
  const team = data.team!;
  const pathname = usePathname();
  const base = `/project/${project.id}`;
  const credit = creditMessage(team.ai_credit_remaining, team.ai_credit_total);
  const [showChallenge, setShowChallenge] = useState(false);

  return (
    <section aria-label="Project header" className="border-b border-line bg-white">
      <div className="mx-auto max-w-[1500px] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">{data.lab?.challenge_title}</p>
            <h1 className="mt-1 text-2xl">
              <Link href={base} className="text-navy no-underline hover:text-terra">{team.name}</Link>
            </h1>
            <button
              type="button"
              className="mt-1 text-sm font-semibold text-navy underline"
              aria-expanded={showChallenge}
              aria-controls="challenge-text"
              onClick={() => setShowChallenge((s) => !s)}
            >
              {showChallenge ? "Hide the challenge" : "Read the challenge"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SaveIndicator />
            <span className={connection === "live" ? "chip" : "chip-warn"} role="status">
              <span aria-hidden="true">{connection === "live" ? "●" : "○"}</span>
              {connection === "live" ? "Live" : connection === "connecting" ? "Connecting" : "Reconnecting"}
            </span>
          </div>
        </div>

        <div id="challenge-text" hidden={!showChallenge} className="card card-pad mt-3 whitespace-pre-line text-[15px]">
          {data.lab?.challenge_text}
        </div>

        <StageProgress current={project.current_stage} flow={project.flow} />

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="card p-3">
            <p className="eyebrow">AI credits</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-navy">
              {Math.max(team.ai_credit_remaining, 0)}
              <span className="text-sm font-semibold text-ink-muted"> of {team.ai_credit_total} remaining</span>
            </p>
            {team.ai_credit_remaining < 0 && <p className="text-sm font-semibold text-danger">{Math.abs(team.ai_credit_remaining)} credits over budget</p>}
            {credit && (
              <p role="status" className={`mt-1 text-sm ${credit.tone === "neutral" ? "text-ink-muted" : "font-semibold text-danger"}`}>{credit.text}</p>
            )}
          </div>
          <div className="card p-3">
            <p className="eyebrow">Current sprint objective</p>
            <p className="mt-1 font-semibold text-navy">{project.current_sprint_objective || "Not set yet. Your team sets it at the end of a huddle."}</p>
          </div>
          <div className="card p-3">
            <p className="eyebrow">Team roles</p>
            <ul className="mt-1 space-y-1 text-sm">
              {data.members.map((m) => {
                const active = m.last_seen_at && Date.now() - new Date(m.last_seen_at).getTime() < 5 * 60_000;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2">
                    <span aria-hidden="true" className={active ? "text-ok" : "text-ink-faint"}>{active ? "●" : "○"}</span>
                    <span className="sr-only">{active ? "Online" : "Away"}</span>
                    <span className="font-semibold">{nameOf(m.user_id)}{m.user_id === me ? " (you)" : ""}</span>
                    {m.team_role && (
                      <span className={m.team_role === "red_team" ? "chip-terra" : "chip"} title={ROLE_DESCRIPTION[m.team_role]}>
                        {ROLE_LABEL[m.team_role]}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <nav aria-label="Project sections" className="mt-4 flex flex-wrap gap-2 text-sm">
          {[
            ["Project Room", ""], ["Problem", "/map/problem"], ["Stakeholders", "/map/stakeholders"], ["Evidence", "/map/evidence"],
            ["Assumptions", "/map/assumptions"], ["Ideas", "/ideas"], ["Decide", "/decision"], ["Build", "/build"],
            ["Test", "/test"], ["Improve", "/improve"], ["Show", "/show"],
            ...(project.flow === "returning" ? [["Reassess", "/reassess"]] : []),
          ].map(([label, href]) => {
            const full = base + href;
            const current = pathname === full;
            return (
              <Link key={label} href={full} aria-current={current ? "page" : undefined}
                className={`btn btn-sm ${current ? "border-navy bg-navy text-white hover:text-white" : "border-line bg-white text-navy hover:bg-navy-tint"}`}>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </section>
  );
}

export function StageProgress({ current, flow }: { current: Stage; flow: "standard" | "returning" }) {
  const stages = stagesFor(flow);
  const idx = stages.indexOf(current);
  return (
    <div className="mt-4 overflow-x-auto pb-1" tabIndex={0} role="region" aria-label="Project stages">
    <ol className="grid min-w-[620px] gap-2" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
      {stages.map((s, i) => {
        const state = i < idx ? "complete" : i === idx ? "current" : "locked";
        const cls = state === "complete" ? "state-complete" : state === "current" ? "state-current" : "state-locked";
        return (
          <li key={s} className={`${cls} rounded-btn px-2 py-2 text-center`} aria-current={state === "current" ? "step" : undefined}>
            <span className="block text-[10px] font-bold uppercase tracking-[0.15em]">
              {state === "complete" ? "Done" : state === "current" ? "Now" : "Locked"}
            </span>
            <span className="block text-xs font-extrabold sm:text-sm">
              <span aria-hidden="true">{state === "complete" ? "✓ " : ""}</span>
              {STAGE_LABEL[s].toUpperCase()}
            </span>
          </li>
        );
      })}
    </ol>
    </div>
  );
}

function RoleRotationNotice() {
  const { myRole } = useProject();
  const previous = useRef<string | null | undefined>(undefined);
  const [changed, setChanged] = useState<string | null>(null);
  useEffect(() => {
    if (previous.current !== undefined && previous.current !== myRole && myRole) {
      setChanged(myRole);
    }
    previous.current = myRole;
  }, [myRole]);
  if (!changed) return null;
  const role = changed as keyof typeof ROLE_LABEL;
  return (
    <div role="alert" className="card card-pad mb-4 border-2 border-terra">
      <p className="eyebrow">Role rotation</p>
      <p className="mt-1 text-lg font-bold text-navy">You are now the {ROLE_LABEL[role]}.</p>
      <p className="mt-1 text-ink-muted">{ROLE_DESCRIPTION[role]}</p>
      <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => setChanged(null)}>Got it</button>
    </div>
  );
}
