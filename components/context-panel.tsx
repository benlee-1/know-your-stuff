"use client";

import { cn } from "@/lib/utils";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
}

export function ContextPanel({
  calls,
  selectedId,
  onSelect,
}: {
  calls: ToolCall[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (calls.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        Tool calls will appear here as the model works. Click one to see what it read.
      </div>
    );
  }
  return (
    <ul className="space-y-2 text-xs">
      {calls.map((c) => {
        const path = typeof c.input.path === "string" ? c.input.path : undefined;
        const query = typeof c.input.query === "string" ? c.input.query : undefined;
        const hits = Array.isArray((c.output as { hits?: unknown[] } | null)?.hits)
          ? (c.output as { hits: unknown[] }).hits.length
          : undefined;
        const truncated =
          (c.output as { truncated?: boolean } | null)?.truncated === true;
        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={cn(
                "w-full rounded border p-2 text-left transition",
                selectedId === c.id
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--muted))]"
                  : "border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]",
              )}
            >
              <div className="font-mono font-medium">{c.name}</div>
              {path && (
                <div className="truncate font-mono text-muted-foreground">{path}</div>
              )}
              {query && (
                <div className="text-muted-foreground">
                  query: <span className="font-mono">{query}</span>
                </div>
              )}
              <div className="mt-0.5 text-muted-foreground">
                {typeof hits === "number" && <span>{hits} hits</span>}
                {truncated && <span className="ml-2 italic">truncated</span>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
