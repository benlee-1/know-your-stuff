"use client";

import { useEffect, useMemo, useState } from "react";
import { diffLines, type Change } from "diff";
import { previewBriefGeneration } from "@/app/actions/brief";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; existing: string; generated: string }
  | { kind: "error"; message: string };

export function BriefDiffModal({
  projectId,
  currentText,
  onConfirm,
  onCancel,
}: {
  projectId: string;
  currentText: string;
  onConfirm: (generated: string) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  // Snapshot currentText on mount only. Re-running the (expensive) LLM
  // generation every time the parent passes a new `currentText` would
  // (a) cost a fresh API call and (b) race the user's in-flight edits.
  // We intentionally drop currentText from the dep array.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { existing, generated } = await previewBriefGeneration(projectId);
        if (!cancelled) {
          setStatus({ kind: "ready", existing, generated });
        }
      } catch (e) {
        if (!cancelled) {
          setStatus({
            kind: "error",
            message: e instanceof Error ? e.message : "Failed to generate preview",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[hsl(var(--border))] px-5 py-3">
          <h2 className="text-base font-semibold">Review regenerated brief</h2>
          <p className="text-xs text-muted-foreground">
            Compare your current brief with the freshly-generated one before overwriting.
          </p>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {status.kind === "loading" && (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Generating new brief…
            </div>
          )}
          {status.kind === "error" && (
            <div className="text-sm text-red-500">Error: {status.message}</div>
          )}
          {status.kind === "ready" && (
            <DiffView existing={status.existing} generated={status.generated} />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[hsl(var(--border))] px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (status.kind === "ready") onConfirm(status.generated);
            }}
            disabled={status.kind !== "ready"}
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            Replace with new
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffView({ existing, generated }: { existing: string; generated: string }) {
  const changes = useMemo<Change[]>(() => diffLines(existing, generated), [existing, generated]);

  return (
    <div className="grid grid-cols-2 gap-3 font-mono text-xs">
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Current
        </div>
        <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-2">
          {renderSide(changes, "left")}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Generated
        </div>
        <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-2">
          {renderSide(changes, "right")}
        </div>
      </div>
    </div>
  );
}

function renderSide(changes: Change[], side: "left" | "right") {
  const out: React.ReactNode[] = [];
  let key = 0;
  for (const ch of changes) {
    const lines = ch.value.split("\n");
    // diffLines emits a trailing empty after final newline; drop it
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

    if (ch.added) {
      if (side === "right") {
        for (const line of lines) {
          out.push(
            <div key={key++} className="whitespace-pre-wrap bg-green-500/15 text-green-700 dark:text-green-300">
              + {line || " "}
            </div>,
          );
        }
      } else {
        for (let i = 0; i < lines.length; i++) {
          out.push(<div key={key++} className="whitespace-pre-wrap opacity-40">&nbsp;</div>);
        }
      }
    } else if (ch.removed) {
      if (side === "left") {
        for (const line of lines) {
          out.push(
            <div key={key++} className="whitespace-pre-wrap bg-red-500/15 text-red-700 dark:text-red-300">
              - {line || " "}
            </div>,
          );
        }
      } else {
        for (let i = 0; i < lines.length; i++) {
          out.push(<div key={key++} className="whitespace-pre-wrap opacity-40">&nbsp;</div>);
        }
      }
    } else {
      for (const line of lines) {
        out.push(
          <div key={key++} className="whitespace-pre-wrap text-muted-foreground/80">
            &nbsp;&nbsp;{line || " "}
          </div>,
        );
      }
    }
  }
  return out;
}
