"use client";
import { useParams } from "next/navigation";
import { AssessmentForm } from "@/components/project/Assessment";
import { AppHeader } from "@/components/ui/AppHeader";

export default function BaselinePage() {
  const { labId } = useParams<{ labId: string }>();
  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10"><AssessmentForm labId={labId} kind="baseline" /></main>
    </>
  );
}
