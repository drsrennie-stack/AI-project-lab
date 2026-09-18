"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/ui/AppHeader";
import { getSupabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";

export default function JoinPage() {
  const router = useRouter();
  const { profile } = useSession();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile && !name) setName(profile.display_name);
  }, [profile, name]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await getSupabase().rpc("join_lab", { p_code: code, p_display_name: name });
    setBusy(false);
    if (error) setError(error.message);
    else router.push(`/lab/${data}`);
  };

  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto max-w-md px-4 py-10">
        <p className="eyebrow">Join a lab</p>
        <h1 className="mt-2">Enter your lab code</h1>
        <form onSubmit={submit} className="card card-pad mt-6 space-y-4">
          <div>
            <label htmlFor="code" className="label">Lab code</label>
            <input id="code" className="input font-mono text-2xl uppercase tracking-[0.3em]" required maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off" aria-describedby="code-hint" />
            <span id="code-hint" className="hint">Six letters and numbers from your instructor.</span>
          </div>
          <div>
            <label htmlFor="dname" className="label">Name your team will see</label>
            <input id="dname" className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div aria-live="assertive">{error && <p className="text-sm font-semibold text-danger">{error}</p>}</div>
          <button type="submit" className="btn-primary w-full" disabled={busy || code.trim().length < 6}>
            {busy ? "Joining..." : "Join lab"}
          </button>
        </form>
      </main>
    </>
  );
}
