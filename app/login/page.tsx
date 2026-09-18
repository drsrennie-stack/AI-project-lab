"use client";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/ui/AppHeader";
import { getSupabase } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<"signin" | "signup">(params.get("next") === "/join" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = getSupabase();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else {
        router.push(next);
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name.trim() }, emailRedirectTo: `${window.location.origin}${next}` },
      });
      if (error) setError(error.message);
      else if (!data.session) setNotice("Check your email to confirm your account, then come back and sign in.");
      else {
        router.push(next);
        router.refresh();
      }
    }
    setBusy(false);
  };

  return (
    <main id="main" className="mx-auto max-w-md px-4 py-10">
      <p className="eyebrow">AI Project Lab</p>
      <h1 className="mt-2">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
      <p className="mt-2 text-ink-muted">
        {mode === "signin" ? "Use the email and password you created for the lab." : "You only need a name your team will see, an email, and a password."}
      </p>
      <form onSubmit={submit} className="card card-pad mt-6 space-y-4" noValidate>
        {mode === "signup" && (
          <div>
            <label htmlFor="name" className="label">Name your team will see</label>
            <input id="name" className="input" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
            <span className="hint">A first name is enough.</span>
          </div>
        )}
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" className="input" required minLength={8} value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} aria-describedby="pw-hint" />
          <span id="pw-hint" className="hint">At least 8 characters.</span>
        </div>
        <div aria-live="assertive" className="text-sm">
          {error && <p className="font-semibold text-danger">{error}</p>}
          {notice && <p className="font-semibold text-navy">{notice}</p>}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy || !email || password.length < 8 || (mode === "signup" && !name.trim())}>
          {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm">
        {mode === "signin" ? "New to the lab? " : "Already have an account? "}
        <button type="button" className="font-semibold text-navy underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <>
      <AppHeader />
      <Suspense fallback={<p className="p-6" role="status">Loading...</p>}>
        <LoginForm />
      </Suspense>
    </>
  );
}
