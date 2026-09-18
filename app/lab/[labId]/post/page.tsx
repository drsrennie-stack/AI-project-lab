"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AssessmentForm, ReflectionForm } from "@/components/project/Assessment";
import { AppHeader } from "@/components/ui/AppHeader";

export default function PostPage() {
  const { labId } = useParams<{ labId: string }>();
  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <AssessmentForm labId={labId} kind="post" />
        <ReflectionForm labId={labId} />
        <Link href={`/lab/${labId}`} className="btn-secondary mt-6">Back to the lab</Link>
      </main>
    </>
  );
}
