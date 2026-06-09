import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/app/actions/projects";
import { loadWalkthroughState } from "@/app/actions/walkthrough";
import { WalkthroughRunner } from "@/components/walkthrough-runner";

export default async function WalkthroughPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const initial = await loadWalkthroughState(projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Link href={`/chat/${projectId}`} className="text-xs text-muted-foreground hover:underline">
          ← back to chat
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Guided Walkthrough</h1>
        <p className="text-sm text-muted-foreground">{project.name} — {project.rootPath}</p>
      </header>
      <WalkthroughRunner projectId={projectId} initial={initial} />
    </main>
  );
}
