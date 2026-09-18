"use client";
import { Suspense } from "react";
import { MapWorkspace } from "@/components/maps/MapWorkspace";
import { PrototypeVersions } from "@/components/project/BuildTest";
import { useProject } from "@/components/project/ProjectProvider";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { useTab } from "@/components/ui/useTab";

function BuildInner() {
  const { data, mapOf } = useProject();
  const [tab, setTab] = useTab(["prototype", "human_ai", "workflow"], "prototype");
  return (
    <div>
      <p className="eyebrow">BUILD</p>
      <h2 className="mb-4 mt-1 text-3xl">Build workspace</h2>
      <Tabs label="Build activities" active={tab} onChange={setTab} tabs={[
        { key: "prototype", label: "Prototype versions", done: data.prototypes.length > 0 },
        { key: "human_ai", label: "Human / AI Map", done: mapOf("human_ai_map")?.status === "complete" },
        { key: "workflow", label: "Workflow Map", done: data.nodes.some((n) => n.map_id === mapOf("workflow_map")?.id) },
      ]} />
      <TabPanel id={tab}>
        {tab === "prototype" && <PrototypeVersions />}
        {tab === "human_ai" && <MapWorkspace type="human_ai_map" />}
        {tab === "workflow" && <MapWorkspace type="workflow_map" />}
      </TabPanel>
    </div>
  );
}

export default function BuildPage() {
  return <Suspense fallback={<p role="status">Loading...</p>}><BuildInner /></Suspense>;
}
