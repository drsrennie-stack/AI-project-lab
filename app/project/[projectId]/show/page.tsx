"use client";
import { ProjectStory, ReturnTicketForm } from "@/components/project/Story";

export default function ShowPage() {
  return (
    <div className="space-y-6">
      <ProjectStory />
      <ReturnTicketForm />
    </div>
  );
}
