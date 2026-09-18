"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CrossTeamAnalysis, GalleryView } from "@/components/project/Gallery";
import { AppHeader } from "@/components/ui/AppHeader";
import { getSupabase } from "@/lib/supabase/client";

export default function StudentGalleryPage() {
  const { labId } = useParams<{ labId: string }>();
  const [teamId, setTeamId] = useState<string | null>(null);
  useEffect(() => {
    getSupabase().rpc("my_team", { p_lab: labId }).then(({ data }) => setTeamId((data as { team_id: string } | null)?.team_id ?? null));
  }, [labId]);
  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto max-w-[1300px] space-y-10 px-4 py-10">
        <div>
          <p className="eyebrow">Show</p>
          <h1 className="mt-2">Prototype Gallery</h1>
          <p className="mt-2 max-w-3xl text-ink-muted">Same challenge, different teams. Notice where your thinking matched and where it went in a different direction.</p>
          <Link href={`/lab/${labId}`} className="mt-2 inline-block text-sm">Back to the lab</Link>
        </div>
        <GalleryView labId={labId} />
        <CrossTeamAnalysis labId={labId} teamId={teamId} />
      </main>
    </>
  );
}
