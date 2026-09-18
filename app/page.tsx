"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/ui/AppHeader";
import { getSupabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";
import type { Lab } from "@/lib/types";

export default function Home() {
  const { user, loading, isInstructor } = useSession();
  const [labs, setLabs] = useState<Lab[]>([]);

  useEffect(() => {
    if (!user) return;
    getSupabase().from("labs").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setLabs((data as Lab[]) ?? []));
  }, [user]);

  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto max-w-4xl px-4 py-10">
        <p className="eyebrow">AI Project Lab</p>
        <h1 className="mt-2 max-w-2xl text-4xl">
          One challenge. Four people. <span className="text-terra">Your</span> solution.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-muted">
          Work with your team to understand a real learning problem, use AI on purpose, build a prototype, test it, and make it better.
        </p>

        {loading ? (
          <p className="mt-8" role="status">Loading...</p>
        ) : !user ? (
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login?next=/join" className="btn-primary">Join a lab</Link>
            <Link href="/login" className="btn-secondary">Sign in</Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <section className="card card-pad" aria-labelledby="join-h">
              <h2 id="join-h">Join a lab</h2>
              <p className="mt-2 text-ink-muted">Your instructor will give you a six-character lab code.</p>
              <Link href="/join" className="btn-primary mt-4">Enter lab code</Link>
            </section>
            <section className="card card-pad" aria-labelledby="labs-h">
              <h2 id="labs-h">{isInstructor ? "Your labs" : "Labs you have joined"}</h2>
              {labs.length === 0 ? (
                <p className="mt-2 text-ink-muted">None yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {labs.map((l) => (
                    <li key={l.id}>
                      <Link href={isInstructor ? `/instructor/lab/${l.id}` : `/lab/${l.id}`}>{l.title}</Link>
                      <span className="ml-2 text-sm text-ink-muted">{l.date ?? ""}</span>
                    </li>
                  ))}
                </ul>
              )}
              {isInstructor && <Link href="/instructor" className="btn-secondary mt-4">Instructor home</Link>}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
