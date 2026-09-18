"use client";
import { Suspense } from "react";
import { AIRejectionPanel, PrototypeVersions, VersionMap } from "@/components/project/BuildTest";
import { useProject } from "@/components/project/ProjectProvider";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { useTab } from "@/components/ui/useTab";

function ImproveInner() {
  const { data, mapOf } = useProject();
  const [tab, setTab] = useTab(["version", "prototype", "ai"], "version");
  return (
    <div>
      <Tabs label="Improve activities" active={tab} onChange={setTab} tabs={[
        { key: "version", label: "Version Map", done: mapOf("version_map")?.status === "complete" },
        { key: "prototype", label: "Prototype V2", done: data.prototypes.length >= 2 },
        { key: "ai", label: "AI recommendation reflection", done: data.aiRejections.length > 0 },
      ]} />
      <TabPanel id={tab}>
        {tab === "version" && <VersionMap />}
        {tab === "prototype" && (
          <PrototypeVersions heading="Prototype V2 or documented revision"
            intro="Save your revised prototype as the next version. If you changed a plan rather than an object, choose Text description and describe the revision." />
        )}
        {tab === "ai" && <AIRejectionPanel />}
      </TabPanel>
    </div>
  );
}

export default function ImprovePage() {
  return <Suspense fallback={<p role="status">Loading...</p>}><ImproveInner /></Suspense>;
}
