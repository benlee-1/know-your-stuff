"use client";

import { useRouter } from "next/navigation";
import type { Project } from "@/lib/schema";

export function ProjectSwitcher({
  current,
  projects,
}: {
  current: Project;
  projects: Project[];
}) {
  const router = useRouter();
  return (
    <select
      value={current.id}
      onChange={(e) => router.push(`/chat/${e.target.value}`)}
      className="rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-1.5 text-sm"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
