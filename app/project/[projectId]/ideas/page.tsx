"use client";
import Link from "next/link";
import { MapWorkspace } from "@/components/maps/MapWorkspace";
import { useProject } from "@/components/project/ProjectProvider";

export default function IdeasPage() {
  const { data, nodesOf } = useProject();
  const inMatrix = nodesOf("idea_map").filter((n) => n.status === "in_matrix").length;
  return (
    <MapWorkspace type="idea_map">
      <div className="card border-2 border-navy p-4 text-center">
        <p className="eyebrow">The problem your team defined</p>
        <p className="mt-1 font-display text-xl font-bold text-navy">{data.project!.problem_statement || "Add a problem statement in the Project Specification."}</p>
      </div>
      <p className="text-sm">
        <span className="font-semibold text-navy">{inMatrix} idea{inMatrix === 1 ? "" : "s"} in the Decision Matrix.</span>{" "}
        Open a card and choose Send to Decision Matrix. <Link href={`/project/${data.project!.id}/decision`}>Go to the Decision Matrix</Link>
      </p>
    </MapWorkspace>
  );
}
