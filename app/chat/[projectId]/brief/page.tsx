import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/app/actions/projects";
import { loadBrief } from "@/app/actions/brief";
import { BriefEditor } from "@/components/brief-editor";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const brief = await loadBrief(projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href={`/chat/${projectId}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← back to chat
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Business Brief</h1>
          <p className="text-sm text-muted-foreground">{project.name} — {project.rootPath}</p>
        </div>
      </header>
      <BriefEditor projectId={projectId} initial={brief} />
    </main>
  );
}
