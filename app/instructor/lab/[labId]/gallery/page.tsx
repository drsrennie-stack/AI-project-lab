"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { InstructorShell, useLab } from "@/components/instructor/InstructorShell";
import { CrossTeamAnalysis, GalleryView } from "@/components/project/Gallery";
import { useSave } from "@/components/ui/SaveStatus";
import { getSupabase } from "@/lib/supabase/client";

function GalleryAdmin({ labId }: { labId: string }) {
  const lab = useLab(labId);
  const { track } = useSave();
  const [msg, setMsg] = useState("");
  const toggle = async (k: "gallery_unlocked" | "cross_team_unlocked", v: boolean, text: string) => {
    const { error } = await track(getSupabase().from("labs").update({ [k]: v }).eq("id", labId));
    if (!error) setMsg(text);
  };
  if (!lab) return <p role="status">Loading...</p>;
  return (
    <div className="space-y-8">
      <section className="card card-pad" aria-labelledby="gal-ctl">
        <h2 id="gal-ctl" className="section-title">Controls</h2>
        <p className="mt-1 text-sm text-ink-muted">Teams cannot see each other&apos;s work until you unlock the gallery. Their project rooms stay private either way.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className={lab.gallery_unlocked ? "btn-secondary" : "btn-accent"}
            onClick={() => toggle("gallery_unlocked", !lab.gallery_unlocked, lab.gallery_unlocked ? "Gallery hidden from students." : "Gallery unlocked for students.")}>
            {lab.gallery_unlocked ? "Hide gallery from students" : "Unlock PROTOTYPE GALLERY"}
          </button>
          <button type="button" className={lab.cross_team_unlocked ? "btn-secondary" : "btn-primary"}
            onClick={() => toggle("cross_team_unlocked", !lab.cross_team_unlocked, lab.cross_team_unlocked ? "Cross-team activity closed." : "Cross-team activity opened.")}>
            {lab.cross_team_unlocked ? "Close cross-team analysis" : "Open cross-team analysis"}
          </button>
        </div>
        <p role="status" aria-live="polite" className="mt-2 text-sm font-semibold text-navy">{msg}</p>
      </section>
      <GalleryView labId={labId} />
      <CrossTeamAnalysis labId={labId} />
    </div>
  );
}

export default function InstructorGalleryPage() {
  const { labId } = useParams<{ labId: string }>();
  return <InstructorShell labId={labId} title="Prototype Gallery"><GalleryAdmin labId={labId} /></InstructorShell>;
}
