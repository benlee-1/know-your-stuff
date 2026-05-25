"use client";

import type { ToolCall } from "./context-panel";

export function ToolDetail({
  call,
  onBack,
}: {
  call: ToolCall;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← all calls
        </button>
        <span className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 font-mono text-[10px]">
          {call.name}
        </span>
      </div>
      <Body call={call} />
    </div>
  );
}

function Body({ call }: { call: ToolCall }) {
  if (!call.output) {
    return <div className="text-xs italic text-muted-foreground">No output captured.</div>;
  }
  switch (call.name) {
    case "read_file":
      return <ReadFileBody output={call.output} />;
    case "list_dir":
      return <ListDirBody output={call.output} />;
    case "grep":
      return <GrepBody output={call.output} />;
    default:
      return <RawJson value={call.output} />;
  }
}

function ReadFileBody({ output }: { output: Record<string, unknown> }) {
  const path = typeof output.path === "string" ? output.path : "(unknown)";
  const content = typeof output.content === "string" ? output.content : "";
  const truncated = output.truncated === true;
  const bytes = typeof output.bytes === "number" ? output.bytes : null;
  return (
    <div className="flex h-full flex-col text-xs">
      <div className="mb-1 break-all font-mono">{path}</div>
      {bytes !== null && (
        <div className="mb-2 text-[10px] text-muted-foreground">
          {bytes.toLocaleString()} bytes{truncated ? " (truncated)" : ""}
        </div>
      )}
      <pre className="flex-1 overflow-auto rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-2 font-mono text-[11px] leading-relaxed">
        {content}
      </pre>
    </div>
  );
}

function ListDirBody({ output }: { output: Record<string, unknown> }) {
  const path = typeof output.path === "string" ? output.path : "(unknown)";
  const entries = Array.isArray(output.entries)
    ? (output.entries as Array<{ name: string; type: string; size: number | null }>)
    : [];
  return (
    <div className="flex h-full flex-col text-xs">
      <div className="mb-2 font-mono">{path || "."}</div>
      <ul className="flex-1 overflow-auto rounded border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
        {entries.map((e) => (
          <li key={e.name} className="flex items-center justify-between px-2 py-1 font-mono">
            <span>
              {e.type === "dir" ? "📁 " : "📄 "}
              {e.name}
            </span>
            {e.size !== null && (
              <span className="text-[10px] text-muted-foreground">{e.size.toLocaleString()} B</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GrepBody({ output }: { output: Record<string, unknown> }) {
  const hits = Array.isArray(output.hits)
    ? (output.hits as Array<{ path: string; line: number; preview: string }>)
    : [];
  const truncated = output.truncated === true;
  return (
    <div className="flex h-full flex-col text-xs">
      <div className="mb-2 text-[10px] text-muted-foreground">
        {hits.length} hit{hits.length === 1 ? "" : "s"}
        {truncated ? " (truncated)" : ""}
      </div>
      <ul className="flex-1 overflow-auto space-y-2">
        {hits.map((h, i) => (
          <li key={i} className="rounded border border-[hsl(var(--border))] p-2">
            <div className="font-mono">
              {h.path}
              <span className="ml-1 text-muted-foreground">:{h.line}</span>
            </div>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-muted-foreground">
              {h.preview}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RawJson({ value }: { value: unknown }) {
  return (
    <pre className="overflow-auto rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-2 font-mono text-[11px]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
