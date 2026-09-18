"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppHeader } from "@/components/ui/AppHeader";
import { SaveIndicator, SaveProvider } from "@/components/ui/SaveStatus";
import { getSupabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";
import type { Lab } from "@/lib/types";

export function useLab(labId: string) {
  const [lab, setLab] = useState<Lab | null>(null);
  const supabase = getSupabase();
  useEffect(() => {
    const load = () => supabase.from("labs").select("*").eq("id", labId).maybeSingle().then(({ data }) => setLab(data as Lab | null));
    load();
    const ch = supabase.channel(`lab-row-${labId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "labs", filter: `id=eq.${labId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [labId, supabase]);
  return lab;
}

export function InstructorShell({ labId, title, children }: { labId?: string; title: string; children: ReactNode }) {
  const { isInstructor, loading } = useSession();
  const pathname = usePathname();
  const lab = useLab(labId ?? "00000000-0000-0000-0000-000000000000");
  const links = labId
    ? [
        ["Live dashboard", `/instructor/lab/${labId}`],
        ["Teams", `/instructor/lab/${labId}/teams`],
        ["Prototype Gallery", `/instructor/lab/${labId}/gallery`],
        ["Pilot analytics", `/instructor/lab/${labId}/analytics`],
        ["Lab settings", `/instructor/lab/${labId}/settings`],
      ]
    : [];
  return (
    <SaveProvider>
      <AppHeader />
      <div className="bg-white">
        <div className="mx-auto max-w-[1500px] px-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Instructor{lab ? ` · ${lab.title}` : ""}</p>
              <h1 className="mt-1">{title}</h1>
              {lab && (
                <p className="mt-1 text-sm text-ink-muted">
                  Join code <span className="font-mono text-lg font-bold tracking-[0.2em] text-navy">{lab.join_code}</span> · Status {lab.status} · Team size {lab.team_size}
                </p>
              )}
            </div>
            <SaveIndicator />
          </div>
          {labId && (
            <nav aria-label="Lab sections" className="mt-4 flex flex-wrap gap-2">
              <Link href="/instructor" className="btn-quiet btn-sm">All labs</Link>
              {links.map(([label, href]) => (
                <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
                  className={`btn btn-sm ${pathname === href ? "border-navy bg-navy text-white hover:text-white" : "border-line bg-white text-navy hover:bg-navy-tint"}`}>
                  {label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>
      <main id="main" className="mx-auto max-w-[1500px] px-4 py-6">
        {loading ? <p role="status">Loading...</p> : !isInstructor ? (
          <p className="card card-pad">This area is for instructors. Ask the lab owner to set your account role to instructor.</p>
        ) : children}
      </main>
    </SaveProvider>
  );
}
