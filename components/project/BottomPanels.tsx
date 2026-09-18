"use client";
import { Collapsible } from "@/components/ui/Collapsible";
import { ARTIFACT_TYPES } from "@/lib/constants";
import { clockTime } from "@/lib/format";
import { AILogForm, AILogList } from "./AILog";
import { useProject } from "./ProjectProvider";
import { SpecEditor, SpecSummary } from "./SpecEditor";

export function BottomPanels() {
  const { data, nameOf, nodesOf } = useProject();
  const evidence = nodesOf("evidence_map");
  const specMissing = [data.project!.problem_statement, data.project!.primary_user, data.project!.desired_outcome,
    data.project!.selected_solution, data.project!.requirements, data.project!.constraints, data.project!.success_criteria,
    data.project!.must_not_do].filter((v) => !v).length;
  return (
    <div className="mt-8">
      <Collapsible id="project-spec" title="Project Specification" badge={<span className={specMissing ? "chip" : "chip-navy"}>{specMissing ? `${specMissing} fields missing` : "Complete"}</span>}>
        <h3 className="mb-2">Summary</h3>
        <SpecSummary />
        <h3 className="mb-2 mt-6">Edit</h3>
        <SpecEditor />
      </Collapsible>

      <Collapsible id="version-history" title="Version history" badge={<span className="chip">{data.prototypes.length}</span>}>
        {data.prototypes.length === 0 ? (
          <p className="text-sm text-ink-muted">No prototype versions yet.</p>
        ) : (
          <ol className="space-y-3">
            {[...data.prototypes].reverse().map((v) => (
              <li key={v.id} className="rounded-btn border border-line p-3">
                <p className="font-bold text-navy">V{v.version_number}: {v.title}</p>
                <p className="text-xs text-ink-muted">
                  {ARTIFACT_TYPES.find((a) => a.key === v.artifact_type)?.label} · {nameOf(v.created_by)} · {clockTime(v.created_at)}
                </p>
                {v.description && <p className="mt-1 text-sm">{v.description}</p>}
                {v.artifact_url && (
                  <a href={v.artifact_url} target="_blank" rel="noopener" className="mt-1 inline-block text-sm">
                    Open prototype<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </li>
            ))}
          </ol>
        )}
      </Collapsible>

      <Collapsible id="evidence" title="Evidence" badge={<span className="chip">{evidence.length}</span>}>
        {evidence.length === 0 ? (
          <p className="text-sm text-ink-muted">No evidence yet. Add claims on the Evidence Map.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {evidence.map((n) => {
              const m = n.metadata as Record<string, string>;
              return (
                <li key={n.id} className="rounded-btn border border-line p-3">
                  <p className="font-semibold text-navy">{n.content}</p>
                  <p className="text-xs text-ink-muted">
                    {n.category.replace(/_/g, " ")} · {String(m.verification_status ?? "not_verified").replace(/_/g, " ")}
                    {m.source ? ` · ${m.source}` : ""}
                  </p>
                  {m.url && <a href={m.url} target="_blank" rel="noopener" className="text-xs">Source link<span className="sr-only"> (opens in a new tab)</span></a>}
                </li>
              );
            })}
          </ul>
        )}
      </Collapsible>

      <Collapsible id="ai-log" title="AI Interaction Log" badge={<span className="chip">{data.ai.length}</span>}>
        <h3 className="mb-3">Log AI use</h3>
        <AILogForm />
        <h3 className="mb-3 mt-6">Team log</h3>
        <AILogList />
      </Collapsible>
    </div>
  );
}
