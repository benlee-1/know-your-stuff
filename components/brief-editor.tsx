"use client";

import { useState, useTransition } from "react";
import { generateBrief, saveBrief } from "@/app/actions/brief";
import { BriefDiffModal } from "@/components/brief-diff-modal";

export function BriefEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showDiff, setShowDiff] = useState(false);

  function save() {
    setStatus(null);
    startTransition(async () => {
      try {
        await saveBrief(projectId, value);
        setStatus("Saved.");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  function regenerate(force: boolean) {
    setStatus(null);
    startTransition(async () => {
      try {
        const md = await generateBrief(projectId, { force });
        setValue(md);
        setStatus("Regenerated from repo.");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed to generate");
      }
    });
  }

  function applyGenerated(generated: string) {
    setShowDiff(false);
    setStatus(null);
    setValue(generated);
    startTransition(async () => {
      try {
        await saveBrief(projectId, generated);
        setStatus("Regenerated from repo.");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending || showDiff}
        placeholder="No brief yet. Click 'Generate from repo' to draft one."
        className="h-[60vh] w-full rounded-md border border-[hsl(var(--border))] bg-transparent p-4 font-mono text-sm outline-none focus:border-[hsl(var(--primary))] disabled:opacity-60"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
        >
          {pending ? "…" : "Save"}
        </button>
        <button
          onClick={() => regenerate(value.trim().length === 0)}
          disabled={pending}
          className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm disabled:opacity-50"
        >
          Generate from repo
        </button>
        <button
          onClick={() => setShowDiff(true)}
          disabled={pending || showDiff}
          className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm disabled:opacity-50"
        >
          Regenerate (overwrite)
        </button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>
      {showDiff && (
        <BriefDiffModal
          projectId={projectId}
          currentText={value}
          onConfirm={applyGenerated}
          onCancel={() => setShowDiff(false)}
        />
      )}
    </div>
  );
}
