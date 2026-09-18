"use client";
import { Suspense } from "react";
import { MapWorkspace } from "@/components/maps/MapWorkspace";
import { TestsPanel } from "@/components/project/BuildTest";
import { useProject } from "@/components/project/ProjectProvider";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { useTab } from "@/components/ui/useTab";

function TestInner() {
  const { data, mapOf } = useProject();
  const [tab, setTab] = useTab(["tests", "failure"], "failure");
  return (
    <div>
      <p className="eyebrow">TEST</p>
      <h2 className="mb-4 mt-1 text-3xl">Testing workspace</h2>
      <Tabs label="Test activities" active={tab} onChange={setTab} tabs={[
        { key: "failure", label: "Failure Map", done: mapOf("failure_map")?.status === "complete" },
        { key: "tests", label: "Tests and findings", done: data.tests.some((t) => t.findings) },
      ]} />
      <TabPanel id={tab}>
        {tab === "tests" && <TestsPanel />}
        {tab === "failure" && <MapWorkspace type="failure_map" />}
      </TabPanel>
    </div>
  );
}

export default function TestPage() {
  return <Suspense fallback={<p role="status">Loading...</p>}><TestInner /></Suspense>;
}
