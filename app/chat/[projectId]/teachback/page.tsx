import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/app/actions/projects";
import { loadTeachbackState } from "@/app/actions/teachback";
import { TeachbackRunner } from "@/components/teachback-runner";

export default async function TeachbackPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const initial = await loadTeachbackState(projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Link href={`/chat/${projectId}`} className="text-xs text-muted-foreground hover:underline">
          ← back to chat
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Socratic Teach-Back</h1>
        <p className="text-sm text-muted-foreground">{project.name} — {project.rootPath}</p>
      </header>
      <TeachbackRunner projectId={projectId} initial={initial} />
    </main>
  );
}
