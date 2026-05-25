"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProject } from "@/app/actions/projects";

export function AddProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const p = await addProject({ name, rootPath });
        setName("");
        setRootPath("");
        router.push(`/chat/${p.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add project");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Project name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. acme-checkout"
          className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm outline-none focus:border-[hsl(var(--primary))]"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Absolute path to codebase</label>
        <input
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          placeholder="/Users/you/code/acme-checkout"
          className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-[hsl(var(--primary))]"
          required
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add project"}
      </button>
    </form>
  );
}
