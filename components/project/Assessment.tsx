"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { REFLECTION_QUESTIONS } from "@/lib/constants";
import { getSupabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";
import type { Lab } from "@/lib/types";

function Confidence({ id, value, onChange, legend }: { id: string; value: number | null; onChange: (n: number) => void; legend: string }) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`flex cursor-pointer items-center gap-2 rounded-btn border px-3 py-2 ${value === n ? "border-2 border-navy" : "border-line"}`}>
            <input type="radio" name={id} checked={value === n} onChange={() => onChange(n)} />
            {n}{n === 1 ? " (not confident)" : n === 5 ? " (very confident)" : ""}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AssessmentForm({ labId, kind }: { labId: string; kind: "baseline" | "post" }) {
  const supabase = getSupabase();
  const { user } = useSession();
  const [lab, setLab] = useState<Lab | null>(null);
  const [startedAt] = useState(() => new Date().toISOString());
  const [existing, setExisting] = useState(false);
  const [form, setForm] = useState({ response: "", ai_tool_used: "", ai_interaction_count: 0, verification_performed: "", final_answer: "" });
  const [confidence, setConfidence] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("labs").select("*").eq("id", labId).maybeSingle().then(({ data }) => setLab(data as Lab | null));
    supabase.from("assessments").select("*").eq("lab_id", labId).eq("user_id", user.id).eq("kind", kind).maybeSingle().then(({ data }) => {
      if (data) {
        setExisting(true);
        setForm({ response: data.response, ai_tool_used: data.ai_tool_used, ai_interaction_count: data.ai_interaction_count, verification_performed: data.verification_performed, final_answer: data.final_answer });
        setConfidence(data.confidence_rating);
      }
    });
  }, [kind, labId, supabase, user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErr("");
    const { error } = await supabase.from("assessments").upsert(
      { lab_id: labId, user_id: user.id, kind, ...form, confidence_rating: confidence, started_at: startedAt, submitted_at: new Date().toISOString() },
      { onConflict: "lab_id,user_id,kind" },
    );
    if (error) setErr(error.message);
    else { setExisting(true); setMsg("Saved. Thank you."); }
  };

  const prompt = kind === "baseline" ? lab?.baseline_prompt : lab?.post_prompt;
  const t = (k: "response" | "verification_performed" | "final_answer", label: string, hint?: string) => (
    <div>
      <label htmlFor={`as-${k}`} className="label">{label}</label>
      <textarea id={`as-${k}`} className="input" rows={k === "response" ? 6 : 3} required={k !== "verification_performed"}
        value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} aria-describedby={hint ? `as-${k}-h` : undefined} />
      {hint && <span id={`as-${k}-h`} className="hint">{hint}</span>}
    </div>
  );

  return (
    <section aria-labelledby="as-h">
      <p className="eyebrow">{kind === "baseline" ? "Before the lab" : "End of the lab"} · on your own</p>
      <h1 id="as-h" className="mt-2">{kind === "baseline" ? "Baseline challenge" : "Post-lab challenge"}</h1>
      <div className="card card-pad mt-6">
        <h2 className="eyebrow">Your task</h2>
        <p className="mt-2 whitespace-pre-line text-lg text-navy">{prompt || "Your instructor has not added the task yet."}</p>
        <p className="mt-3 text-sm text-ink-muted">Work by yourself. You may use AI if you want to. Your answers are stored separately from your team project.</p>
      </div>
      <form onSubmit={submit} className="card card-pad mt-4 space-y-4">
        {t("response", "Your work", "Show how you approached the task and what you tried.")}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="as-tool" className="label">AI tool you used</label>
            <input id="as-tool" className="input" value={form.ai_tool_used} onChange={(e) => setForm((f) => ({ ...f, ai_tool_used: e.target.value }))}
              aria-describedby="as-tool-h" />
            <span id="as-tool-h" className="hint">Write None if you did not use AI.</span>
          </div>
          <div>
            <label htmlFor="as-count" className="label">How many times did you ask the AI something?</label>
            <input id="as-count" type="number" min={0} max={200} className="input" value={form.ai_interaction_count}
              onChange={(e) => setForm((f) => ({ ...f, ai_interaction_count: Math.max(0, Number(e.target.value) || 0) }))} />
          </div>
        </div>
        {t("verification_performed", "What did you check, and how?", "For example, compared the AI answer with a source. Write Nothing if you did not check.")}
        {t("final_answer", "Your final answer")}
        <Confidence id="as-conf" value={confidence} onChange={setConfidence} legend="How confident are you in your final answer?" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={!form.response.trim() || !form.final_answer.trim() || !confidence}>
            {existing ? "Update my answers" : "Submit"}
          </button>
          <span role="status" aria-live="polite" className="text-sm font-semibold text-navy">{msg}</span>
          <span role="alert" className="text-sm font-semibold text-danger">{err}</span>
        </div>
        {existing && kind === "baseline" && <Link href={`/lab/${labId}`} className="btn-secondary">Continue</Link>}
      </form>
    </section>
  );
}

export function ReflectionForm({ labId }: { labId: string }) {
  const supabase = getSupabase();
  const { user } = useSession();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("reflections").select("*").eq("lab_id", labId).eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setAnswers(Object.fromEntries(REFLECTION_QUESTIONS.map((q) => [q.key, data[q.key] ?? ""])));
        setConfidence(data.confidence_now);
      }
    });
  }, [labId, supabase, user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("reflections").upsert(
      { lab_id: labId, user_id: user.id, ...answers, confidence_now: confidence, submitted_at: new Date().toISOString() },
      { onConflict: "lab_id,user_id" },
    );
    if (error) setErr(error.message);
    else setMsg("Reflection saved. Thank you.");
  };

  return (
    <section aria-labelledby="rf-h" className="card card-pad mt-8">
      <h2 id="rf-h" className="text-2xl">Reflection</h2>
      <form onSubmit={submit} className="mt-4 space-y-4">
        {REFLECTION_QUESTIONS.map((q) => (
          <div key={q.key}>
            <label htmlFor={`rf-${q.key}`} className="label">{q.label}</label>
            <textarea id={`rf-${q.key}`} className="input" rows={3} value={answers[q.key] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))} />
          </div>
        ))}
        <Confidence id="rf-conf" value={confidence} onChange={setConfidence} legend="How confident are you now using AI for complex project work?" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary">Save reflection</button>
          <span role="status" aria-live="polite" className="text-sm font-semibold text-navy">{msg}</span>
          <span role="alert" className="text-sm font-semibold text-danger">{err}</span>
        </div>
      </form>
    </section>
  );
}
