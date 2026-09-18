"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CROSS_TEAM_CATEGORIES } from "@/lib/constants";
import { getSupabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";
import type { GalleryCard, Lab } from "@/lib/types";

export function GalleryView({ labId }: { labId: string }) {
  const supabase = getSupabase();
  const [cards, setCards] = useState<GalleryCard[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("lab_gallery", { p_lab: labId });
    if (error) setError(error.message);
    else { setError(""); setCards(data as GalleryCard[]); }
  }, [labId, supabase]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`gallery-${labId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "labs", filter: `id=eq.${labId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [labId, load, supabase]);

  if (error) return <p className="card card-pad" role="status">{error}. Your instructor will open it after teams reach SHOW.</p>;
  if (!cards) return <p role="status">Loading gallery...</p>;

  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <li key={c.team_id} className="card card-pad">
          <p className="eyebrow">{c.team_name}</p>
          <h3 className="mt-1 text-xl">{c.prototype_title ?? "No prototype saved"}{c.prototype_version ? ` (V${c.prototype_version})` : ""}</h3>
          {c.prototype_link && <a href={c.prototype_link} target="_blank" rel="noopener" className="mt-1 inline-block text-sm">Open prototype<span className="sr-only"> for {c.team_name} (opens in a new tab)</span></a>}
          <dl className="mt-3 space-y-2 text-sm">
            {([
              ["How they defined the problem", c.problem_interpretation],
              ["Selected solution", c.selected_solution],
              ["Critical assumption", c.critical_assumption],
              ["Biggest test finding", c.biggest_test_finding],
              ["Major revision", c.major_revision],
              ["Next step", c.next_step],
            ] as const).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-bold uppercase tracking-wider text-terra">{k}</dt>
                <dd className={v ? "text-navy" : "text-ink-muted"}>{v || "Not recorded"}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

interface CrossRow { id: string; category: string; content: string; team_id: string | null; created_at: string }

export function CrossTeamAnalysis({ labId, teamId }: { labId: string; teamId?: string | null }) {
  const supabase = getSupabase();
  const { user } = useSession();
  const [lab, setLab] = useState<Lab | null>(null);
  const [rows, setRows] = useState<CrossRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [{ data: l }, { data: r }] = await Promise.all([
      supabase.from("labs").select("*").eq("id", labId).maybeSingle(),
      supabase.from("cross_team_responses").select("id,category,content,team_id,created_at").eq("lab_id", labId).order("created_at"),
    ]);
    setLab(l as Lab | null);
    setRows((r as CrossRow[]) ?? []);
  }, [labId, supabase]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`cross-${labId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cross_team_responses", filter: `lab_id=eq.${labId}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "labs", filter: `id=eq.${labId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [labId, load, supabase]);

  const add = async (e: FormEvent, category: string) => {
    e.preventDefault();
    if (!user) return;
    setErr("");
    const { error } = await supabase.from("cross_team_responses").insert({ lab_id: labId, team_id: teamId ?? null, category, content: (drafts[category] ?? "").trim(), author_id: user.id });
    if (error) setErr(error.message);
    else { setDrafts((d) => ({ ...d, [category]: "" })); load(); }
  };

  const isInstructor = !!user && lab?.created_by === user.id;
  if (lab && !lab.cross_team_unlocked && !isInstructor) {
    return <p className="card card-pad text-ink-muted">The class comparison activity opens after the gallery walk.</p>;
  }

  return (
    <section aria-labelledby="cross-h" className="space-y-4">
      <h2 id="cross-h" className="text-2xl">Cross-team analysis</h2>
      <p className="max-w-3xl">Every team started from the same challenge. Look across the gallery and add what you notice. Responses are shared with the whole class.</p>
      <p role="alert" className="text-sm font-semibold text-danger">{err}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {CROSS_TEAM_CATEGORIES.map((c) => (
          <div key={c.key} className="card p-4">
            <h3 className="text-sm uppercase tracking-[0.15em] text-terra">{c.label}</h3>
            <p className="font-semibold text-navy">{c.prompt}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" aria-live="polite">
              {rows.filter((r) => r.category === c.key).map((r) => <li key={r.id}>{r.content}</li>)}
            </ul>
            <form onSubmit={(e) => add(e, c.key)} className="mt-3 flex gap-2">
              <label htmlFor={`ct-${c.key}`} className="sr-only">Add to {c.label}</label>
              <input id={`ct-${c.key}`} className="input" value={drafts[c.key] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [c.key]: e.target.value }))} />
              <button type="submit" className="btn-primary btn-sm" disabled={!(drafts[c.key] ?? "").trim()}>Add</button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}
