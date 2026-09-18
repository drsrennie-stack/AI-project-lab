"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/ui/AppHeader";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/constants";
import { getSupabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";
import type { Lab, TeamRole } from "@/lib/types";

interface MyTeam { team_id: string; team_name: string; project_id: string; team_role: TeamRole | null }

// First-run flow: welcome, baseline, team assignment, role, challenge reveal, project room.
export default function LabPage() {
  const { labId } = useParams<{ labId: string }>();
  const supabase = getSupabase();
  const { user } = useSession();
  const [lab, setLab] = useState<Lab | null>(null);
  const [baselineDone, setBaselineDone] = useState<boolean | null>(null);
  const [team, setTeam] = useState<MyTeam | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: l, error: e }, { data: a }, { data: t }] = await Promise.all([
      supabase.from("labs").select("*").eq("id", labId).maybeSingle(),
      supabase.from("assessments").select("id").eq("lab_id", labId).eq("user_id", user.id).eq("kind", "baseline").maybeSingle(),
      supabase.rpc("my_team", { p_lab: labId }),
    ]);
    if (e || !l) setError("You have not joined this lab, or it does not exist.");
    setLab(l as Lab | null);
    setBaselineDone(!!a);
    setTeam((t as MyTeam | null) ?? null);
  }, [labId, supabase, user]);

  useEffect(() => { load(); }, [load]);

  // Wait for team assignment: realtime plus a slow poll as a fallback.
  useEffect(() => {
    if (!user || team) return;
    const channel = supabase.channel(`wait-${labId}-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    const poll = setInterval(load, 15_000);
    return () => { clearInterval(poll); supabase.removeChannel(channel); };
  }, [labId, load, supabase, team, user]);

  const storageKey = `lab-reveal-${labId}`;
  useEffect(() => {
    try { if (localStorage.getItem(storageKey) === "1") setRevealed(true); } catch { /* storage unavailable */ }
  }, [storageKey]);
  const reveal = () => {
    setRevealed(true);
    try { localStorage.setItem(storageKey, "1"); } catch { /* storage unavailable */ }
  };

  const step = !lab ? 0 : !baselineDone ? 1 : !team ? 2 : !revealed ? 3 : 4;
  const steps = ["Welcome", "Baseline challenge", "Team assignment", "Role and challenge", "Project Room"];

  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        {error && <p role="alert" className="font-semibold text-danger">{error} <Link href="/join">Enter a lab code</Link></p>}
        {lab && (
          <>
            <p className="eyebrow">{lab.title}</p>
            <h1 className="mt-2">Welcome to the AI Project Lab</h1>
            <ol className="mt-6 flex flex-wrap gap-2" aria-label="Getting started">
              {steps.map((s, i) => (
                <li key={s} aria-current={i + 1 === step ? "step" : undefined}
                  className={`${i + 1 < step ? "state-complete" : i + 1 === step ? "state-current" : "state-locked"} rounded-btn px-3 py-1 text-xs font-bold`}>
                  {i + 1 < step && <span aria-hidden="true">{"✓ "}</span>}{s}
                </li>
              ))}
            </ol>

            {step === 1 && (
              <section className="card card-pad mt-6" aria-labelledby="s1">
                <h2 id="s1">First, a short task on your own</h2>
                <p className="mt-2">
                  Before you meet your team, you will complete one task by yourself. It helps us see how the lab changes the way people work with AI. There is no grade for it.
                </p>
                <Link href={`/lab/${labId}/baseline`} className="btn-primary mt-4">Start the baseline task</Link>
              </section>
            )}

            {step === 2 && (
              <section className="card card-pad mt-6" aria-labelledby="s2" aria-live="polite">
                <h2 id="s2">Waiting for your team</h2>
                <p className="mt-2">Thanks for finishing the baseline task. Your instructor is putting teams together. This page updates on its own.</p>
              </section>
            )}

            {step === 3 && team && (
              <section className="mt-6 space-y-4" aria-labelledby="s3">
                <div className="card card-pad">
                  <p className="eyebrow">Your team</p>
                  <h2 id="s3" className="mt-1 text-3xl">{team.team_name}</h2>
                  {team.team_role && (
                    <div className="mt-4">
                      <p className="eyebrow">Your role</p>
                      <p className="mt-1 font-display text-2xl font-extrabold text-navy">{ROLE_LABEL[team.team_role]}</p>
                      <p className="mt-1">{ROLE_DESCRIPTION[team.team_role]}</p>
                      <p className="mt-2 text-sm text-ink-muted">Roles rotate later in the day, so everyone gets a turn at each one.</p>
                    </div>
                  )}
                </div>
                <button type="button" className="btn-accent" onClick={reveal}>Reveal the challenge</button>
              </section>
            )}

            {step === 4 && team && (
              <section className="mt-6 space-y-4" aria-labelledby="s4">
                <div className="card card-pad">
                  <p className="eyebrow">The challenge</p>
                  <h2 id="s4" className="mt-1 text-3xl">{lab.challenge_title}</h2>
                  <p className="mt-4 whitespace-pre-line text-lg">{lab.challenge_text}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href={`/project/${team.project_id}`} className="btn-primary">Enter the Project Room</Link>
                  {lab.gallery_unlocked && <Link href={`/lab/${labId}/gallery`} className="btn-secondary">Prototype Gallery</Link>}
                  <Link href={`/lab/${labId}/post`} className="btn-secondary">End-of-day task and reflection</Link>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
