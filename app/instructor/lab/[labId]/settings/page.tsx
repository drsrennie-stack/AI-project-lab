"use client";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { InstructorShell, useLab } from "@/components/instructor/InstructorShell";
import { useSave } from "@/components/ui/SaveStatus";
import { getSupabase } from "@/lib/supabase/client";
import type { Lab } from "@/lib/types";

type Editable = Pick<Lab, "title" | "challenge_title" | "challenge_text" | "date" | "start_time" | "end_time" | "team_size" | "status" |
  "baseline_prompt" | "post_prompt" | "curriculum_version" | "software_version" | "lab_version">;

function Settings({ labId }: { labId: string }) {
  const lab = useLab(labId);
  const supabase = getSupabase();
  const { track } = useSave();
  const [form, setForm] = useState<Editable | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (lab && !form) {
      const { title, challenge_title, challenge_text, date, start_time, end_time, team_size, status, baseline_prompt, post_prompt, curriculum_version, software_version, lab_version } = lab;
      setForm({ title, challenge_title, challenge_text, date, start_time, end_time, team_size, status, baseline_prompt, post_prompt, curriculum_version, software_version, lab_version });
    }
  }, [lab, form]);

  if (!form) return <p role="status">Loading...</p>;
  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => setForm({ ...form, [k]: v });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await track(supabase.from("labs").update({ ...form, date: form.date || null }).eq("id", labId));
    if (!error) setMsg("Lab settings saved.");
  };

  const text = (k: keyof Editable, label: string, rows?: number, hint?: string) => (
    <div>
      <label htmlFor={`ls-${k}`} className="label">{label}</label>
      {rows ? (
        <textarea id={`ls-${k}`} className="input" rows={rows} value={(form[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} aria-describedby={hint ? `ls-${k}-h` : undefined} />
      ) : (
        <input id={`ls-${k}`} className="input" value={(form[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} aria-describedby={hint ? `ls-${k}-h` : undefined} />
      )}
      {hint && <span id={`ls-${k}-h`} className="hint">{hint}</span>}
    </div>
  );

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
      <section className="card card-pad space-y-3" aria-labelledby="ls-basic">
        <h2 id="ls-basic" className="section-title">Lab session</h2>
        {text("title", "Lab title")}
        <div>
          <label htmlFor="ls-status" className="label">Status</label>
          <select id="ls-status" className="input" value={form.status} onChange={(e) => set("status", e.target.value as Lab["status"])} aria-describedby="ls-status-h">
            <option value="draft">Draft (students cannot join)</option>
            <option value="open">Open (students can join)</option>
            <option value="active">Active (lab running, students can still join)</option>
            <option value="complete">Complete (no new students)</option>
          </select>
          <span id="ls-status-h" className="hint">Students can join with the code only when the lab is Open or Active.</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div><label htmlFor="ls-date" className="label">Date</label><input id="ls-date" type="date" className="input" value={form.date ?? ""} onChange={(e) => set("date", e.target.value)} /></div>
          <div><label htmlFor="ls-st" className="label">Start</label><input id="ls-st" type="time" className="input" value={form.start_time?.slice(0, 5) ?? ""} onChange={(e) => set("start_time", e.target.value)} /></div>
          <div><label htmlFor="ls-et" className="label">End</label><input id="ls-et" type="time" className="input" value={form.end_time?.slice(0, 5) ?? ""} onChange={(e) => set("end_time", e.target.value)} /></div>
          <div><label htmlFor="ls-ts" className="label">Team size</label><input id="ls-ts" type="number" min={2} max={8} className="input" value={form.team_size} onChange={(e) => set("team_size", Number(e.target.value))} /></div>
        </div>
        {text("challenge_title", "Challenge title")}
        {text("challenge_text", "Challenge text", 10)}
      </section>
      <section className="card card-pad space-y-3" aria-labelledby="ls-assess">
        <h2 id="ls-assess" className="section-title">Individual tasks</h2>
        {text("baseline_prompt", "Baseline task (before teams form)", 6, "Keep the baseline and post tasks comparable so you can compare them.")}
        {text("post_prompt", "Post-lab task (end of day)", 6)}
        <h2 className="section-title pt-4">Pilot versions</h2>
        <p className="text-sm text-ink-muted">Increase a number whenever something meaningful changes. 1.0 to 1.1 for a minor change, 1.1 to 2.0 for a major workflow redesign.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {text("curriculum_version", "Curriculum")}
          {text("software_version", "Software")}
          {text("lab_version", "Lab")}
        </div>
      </section>
      <div className="flex items-center gap-3 lg:col-span-2">
        <button type="submit" className="btn-primary">Save settings</button>
        <span role="status" aria-live="polite" className="text-sm font-semibold text-navy">{msg}</span>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { labId } = useParams<{ labId: string }>();
  return <InstructorShell labId={labId} title="Lab settings"><Settings labId={labId} /></InstructorShell>;
}
