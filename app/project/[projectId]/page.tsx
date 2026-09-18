"use client";
import Link from "next/link";
import { useProject } from "@/components/project/ProjectProvider";
import { StagePanel } from "@/components/project/StagePanel";
import { mapName } from "@/lib/constants";

export default function ProjectRoomPage() {
  const { data } = useProject();
  const base = `/project/${data.project!.id}`;
  const mapLinks: Record<string, string> = {
    problem_map: "map/problem", stakeholder_map: "map/stakeholders", evidence_map: "map/evidence", assumption_map: "map/assumptions",
    idea_map: "ideas", decision_matrix: "decision", workflow_map: "build?tab=workflow", human_ai_map: "build?tab=human_ai",
    failure_map: "test?tab=failure", version_map: "improve?tab=version",
  };
  return (
    <div className="space-y-6">
      {data.project!.flow === "returning" && data.project!.current_stage === "REASSESS" && (
        <div className="state-unlocked rounded-card p-4">
          <p className="eyebrow">Returning builder</p>
          <p className="mt-1 font-semibold text-navy">Welcome back. Start with the last session summary and the team check-in.</p>
          <Link href={`${base}/reassess`} className="btn-primary mt-3">Open the check-in</Link>
        </div>
      )}
      <StagePanel />
      <section aria-labelledby="maps-h" className="card card-pad">
        <h2 id="maps-h" className="section-title">Maps and activities</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {data.maps.map((m) => {
            const cls = m.status === "complete" ? "state-complete" : m.stage === data.project!.current_stage ? "state-unlocked" : "state-locked";
            return (
              <li key={m.id}>
                <Link href={`${base}/${mapLinks[m.map_type]}`} className={`${cls} block rounded-btn p-3 no-underline`}>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.15em]">{m.stage}</span>
                  <span className="block font-bold">{mapName(m.map_type)}</span>
                  <span className="block text-xs">{m.status === "complete" ? "✓ Complete" : m.status === "in_progress" ? "In progress" : "Not started"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
