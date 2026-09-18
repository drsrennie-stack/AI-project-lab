"use client";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { ProjectProvider } from "@/components/project/ProjectProvider";
import { RoomShell } from "@/components/project/RoomShell";
import { SaveProvider } from "@/components/ui/SaveStatus";

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <SaveProvider>
      <ProjectProvider projectId={projectId}>
        <RoomShell>{children}</RoomShell>
      </ProjectProvider>
    </SaveProvider>
  );
}
