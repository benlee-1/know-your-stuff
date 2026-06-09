import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, listProjects, setActiveProject } from "@/app/actions/projects";
import { getHistory } from "@/app/actions/chat-history";
import { ChatPanel } from "@/components/chat-panel";
import { ProjectSwitcher } from "@/components/project-switcher";
import type { ChatMessage } from "@/lib/schema";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  await setActiveProject(projectId);

  const [projects, business, technical, quiz] = await Promise.all([
    listProjects(),
    getHistory(projectId, "business"),
    getHistory(projectId, "technical"),
    getHistory(projectId, "quiz"),
  ]);

  const historyByMode: Record<"business" | "technical" | "quiz", ChatMessage[]> = {
    business,
    technical,
    quiz,
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs text-muted-foreground hover:underline">
            ← all projects
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
            <p className="text-xs text-muted-foreground font-mono">{project.rootPath}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/chat/${projectId}/dossier`}
            className="text-sm text-muted-foreground hover:underline"
          >
            Dossier
          </Link>
          <Link
            href={`/chat/${projectId}/walkthrough`}
            className="text-sm text-muted-foreground hover:underline"
          >
            Walkthrough
          </Link>
          <Link
            href={`/chat/${projectId}/drills`}
            className="text-sm text-muted-foreground hover:underline"
          >
            Drills
          </Link>
          <Link
            href={`/chat/${projectId}/brief`}
            className="text-sm text-muted-foreground hover:underline"
          >
            Brief
          </Link>
          <Link
            href={`/chat/${projectId}/quiz`}
            className="text-sm text-muted-foreground hover:underline"
          >
            Quiz
          </Link>
          <Link
            href={`/chat/${projectId}/quiz/history`}
            className="text-sm text-muted-foreground hover:underline"
          >
            History
          </Link>
          <ProjectSwitcher current={project} projects={projects} />
        </div>
      </header>

      <ChatPanel projectId={projectId} initialMode="business" historyByMode={historyByMode} />
    </main>
  );
}
