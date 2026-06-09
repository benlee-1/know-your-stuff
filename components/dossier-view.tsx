"use client";

import { useState, useTransition } from "react";
import {
  generateDossier,
  generateSection,
  saveDossier,
} from "@/app/actions/dossier";
import { Markdown } from "@/components/markdown";
import { DOSSIER_SECTIONS } from "@/lib/dossier";

export function DossierView({
  projectId,
  initial,
}: {
  projectId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function regenerateAll() {
    setStatus("Generating… this runs eight agentic passes and may take a minute.");
    startTransition(async () => {
      try {
        const { markdown, failedSectionIds } = await generateDossier(projectId);
        setValue(markdown);
        setStatus(
          failedSectionIds.length
            ? `Done, but these sections failed and need a retry: ${failedSectionIds.join(", ")}`
            : "Dossier generated from repo.",
        );
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed to generate");
      }
    });
  }

  function regenerateOne(sectionId: string, title: string) {
    setStatus(`Regenerating "${title}"…`);
    startTransition(async () => {
      try {
        const updated = await generateSection(projectId, sectionId);
        setValue(updated);
        setStatus(`Regenerated "${title}".`);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed to regenerate section");
      }
    });
  }

  function save() {
    setStatus(null);
    startTransition(async () => {
      try {
        await saveDossier(projectId, value);
        setEditing(false);
        setStatus("Saved.");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  const empty = value.trim().length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={regenerateAll}
          disabled={pending}
          className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
        >
          {empty ? "Generate from repo" : "Regenerate all"}
        </button>
        <button
          onClick={() => setEditing((e) => !e)}
          disabled={pending || empty}
          className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm disabled:opacity-50"
        >
          {editing ? "View" : "Edit"}
        </button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>

      {!empty && !editing && (
        <div className="flex flex-wrap gap-2">
          {DOSSIER_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => regenerateOne(s.id, s.title)}
              disabled={pending}
              className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-xs text-muted-foreground disabled:opacity-50"
              title={`Regenerate the "${s.title}" section`}
            >
              ↻ {s.title}
            </button>
          ))}
        </div>
      )}

      {editing ? (
        <div className="space-y-3">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            className="h-[60vh] w-full rounded-md border border-[hsl(var(--border))] bg-transparent p-4 font-mono text-sm outline-none focus:border-[hsl(var(--primary))] disabled:opacity-60"
          />
          <button
            onClick={save}
            disabled={pending}
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            {pending ? "…" : "Save"}
          </button>
        </div>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">
          No dossier yet. Click &ldquo;Generate from repo&rdquo; to build one (eight grounded sections).
        </p>
      ) : (
        <Markdown>{value}</Markdown>
      )}
    </div>
  );
}
