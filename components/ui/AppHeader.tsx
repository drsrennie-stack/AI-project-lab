"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { profile, isInstructor } = useSession();
  const router = useRouter();
  const signOut = async () => {
    await getSupabase().auth.signOut();
    router.push("/login");
    router.refresh();
  };
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href={isInstructor ? "/instructor" : "/"} className="font-display text-lg font-extrabold text-navy no-underline">
            AI Project <span className="text-terra">Lab</span>
          </Link>
          {children}
        </div>
        <nav aria-label="Account" className="flex items-center gap-2 text-sm">
          {isInstructor && <Link href="/instructor" className="btn-quiet btn-sm">Instructor</Link>}
          {profile && <span className="text-ink-muted">Signed in as <span className="font-semibold text-navy">{profile.display_name}</span></span>}
          {profile && <button type="button" onClick={signOut} className="btn-secondary btn-sm">Sign out</button>}
        </nav>
      </div>
    </header>
  );
}
