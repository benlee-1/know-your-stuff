"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteProject } from "@/app/actions/projects";
import type { Project } from "@/lib/schema";

export function ProjectRow({ project }: { project: Project }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(
      `Delete project '${project.name}'? This also removes its chat history and quiz attempts. (The codebase itself is not touched.)`,
    );
    if (!ok) return;
    startTransition(async () => {
      await deleteProject(project.id);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center hover:bg-[hsl(var(--muted))]">
      <Link
        href={`/chat/${project.id}`}
        className="flex flex-1 items-center justify-between px-4 py-3"
      >
        <div>
          <div className="font-medium">{project.name}</div>
          <div className="text-xs text-muted-foreground">{project.rootPath}</div>
        </div>
        <span className="text-xs text-muted-foreground">Open →</span>
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        aria-label={`Delete project ${project.name}`}
        className="mr-2 rounded-md p-2 text-muted-foreground hover:bg-[hsl(var(--background))] hover:text-red-500 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
