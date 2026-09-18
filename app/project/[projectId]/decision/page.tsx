"use client";
import { useState } from "react";
import { DecisionBoard, DecisionMatrix, type ProposalSeed } from "@/components/project/Decisions";
import { SpecSummary } from "@/components/project/SpecEditor";

export default function DecisionPage() {
  const [seed, setSeed] = useState<ProposalSeed | null>(null);
  return (
    <div className="space-y-10">
      <DecisionMatrix
        onPropose={(title, value) => {
          setSeed({ title, spec_field: "selected_solution", spec_value: value });
          setTimeout(() => document.getElementById("d-title")?.focus(), 50);
        }}
      />
      <DecisionBoard seed={seed} />
      <section aria-labelledby="spec-sum-h" className="card card-pad">
        <h2 id="spec-sum-h" className="section-title">Project Specification</h2>
        <p className="mb-4 mt-1 text-sm text-ink-muted">BUILD unlocks when every part is filled in. Edit it in the Project Specification panel below.</p>
        <SpecSummary />
      </section>
    </div>
  );
}
