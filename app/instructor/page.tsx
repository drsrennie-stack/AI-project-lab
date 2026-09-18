"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { InstructorShell } from "@/components/instructor/InstructorShell";
import { getSupabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";
import type { Lab } from "@/lib/types";

const PILOT_CHALLENGE = `College students spend a lot of time studying, but the hours they put in do not tell them what they will be able to remember later.

Your challenge: design and prototype a system that helps college students
- learn something over time
- figure out what they do and do not know
- make better decisions about what to study next

Your solution should
- get learners actively pulling information from memory instead of rereading
- help the learner find their weak spots
- work across more than one study session
- help the learner decide what to do next`;

export default function InstructorHome() {
  const supabase = getSupabase();
  const { user } = useSession();
  const [labs, setLabs] = useState<Lab[]>([]);
  const [form, setForm] = useState({
    title: "AI Project Lab: Pilot 1", challenge_title: "The Learning Problem", challenge_text: PILOT_CHALLENGE,
    date: "", start_time: "09:00", end_time: "16:00", team_size: 4,
  });
  const [err, setErr] = useState("");

  const load = () => supabase.from("labs").select("*").eq("created_by", user?.id ?? "").order("created_at", { ascending: false }).then(({ data }) => setLabs((data as Lab[]) ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user) load(); }, [user]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    const { data, error } = await supabase.from("labs").insert({ ...form, date: form.date || null, created_by: user!.id }).select("id").single();
    if (error) return setErr(error.message);
    window.location.href = `/instructor/lab/${data.id}/settings`;
  };

  return (
    <InstructorShell title="Your labs">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby="labs-h" className="card card-pad">
          <h2 id="labs-h">Labs</h2>
          {labs.length === 0 ? <p className="mt-2 text-ink-muted">No labs yet.</p> : (
            <ul className="mt-3 space-y-3">
              {labs.map((l) => (
                <li key={l.id} className="rounded-btn border border-line p-3">
                  <Link href={`/instructor/lab/${l.id}`} className="font-bold">{l.title}</Link>
                  <p className="text-sm text-ink-muted">{l.date ?? "No date"} · {l.status} · code {l.join_code}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="new-h" className="card card-pad">
          <h2 id="new-h">Create a lab</h2>
          <form onSubmit={create} className="mt-4 space-y-3">
            <div>
              <label htmlFor="l-title" className="label">Lab title</label>
              <input id="l-title" className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label htmlFor="l-ct" className="label">Challenge title</label>
              <input id="l-ct" className="input" required value={form.challenge_title} onChange={(e) => setForm({ ...form, challenge_title: e.target.value })} />
            </div>
            <div>
              <label htmlFor="l-cx" className="label">Challenge text</label>
              <textarea id="l-cx" className="input" rows={10} required value={form.challenge_text} onChange={(e) => setForm({ ...form, challenge_text: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor="l-date" className="label">Date</label>
                <input id="l-date" type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label htmlFor="l-start" className="label">Start</label>
                <input id="l-start" type="time" className="input" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div>
                <label htmlFor="l-end" className="label">End</label>
                <input id="l-end" type="time" className="input" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
              <div>
                <label htmlFor="l-size" className="label">Team size</label>
                <input id="l-size" type="number" min={2} max={8} className="input" value={form.team_size} onChange={(e) => setForm({ ...form, team_size: Number(e.target.value) })} />
              </div>
            </div>
            <p role="alert" className="text-sm font-semibold text-danger">{err}</p>
            <button type="submit" className="btn-primary">Create lab</button>
            <p className="text-sm text-ink-muted">New labs start as drafts. Open the lab in settings when students should be able to join.</p>
          </form>
        </section>
      </div>
    </InstructorShell>
  );
}
