"use client";

export interface ToolCallSummary {
  name: string;
  path?: string;
  query?: string;
  hits?: number;
}

export function ContextPanel({ calls }: { calls: ToolCallSummary[] }) {
  if (calls.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        Tool calls and cited files will appear here as the model works.
      </div>
    );
  }
  return (
    <ul className="space-y-2 text-xs">
      {calls.map((c, i) => (
        <li key={i} className="rounded border border-[hsl(var(--border))] p-2">
          <div className="font-mono font-medium">{c.name}</div>
          {c.path && <div className="text-muted-foreground font-mono">{c.path}</div>}
          {c.query && <div className="text-muted-foreground">query: <span className="font-mono">{c.query}</span></div>}
          {typeof c.hits === "number" && (
            <div className="text-muted-foreground">{c.hits} hits</div>
          )}
        </li>
      ))}
    </ul>
  );
}
