"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ModeToggle } from "./mode-toggle";
import { ContextPanel, type ToolCallSummary } from "./context-panel";
import { clearChatHistory } from "@/app/actions/chat-history";
import type { ChatMessage, ChatMode } from "@/lib/schema";

export function ChatPanel({
  projectId,
  initialMode,
  historyByMode,
}: {
  projectId: string;
  initialMode: ChatMode;
  historyByMode: Record<ChatMode, ChatMessage[]>;
}) {
  const [mode, setMode] = useState<ChatMode>(initialMode);
  const initialMessages = useMemo(() => toUIMessages(historyByMode[mode] ?? []), [mode, historyByMode]);

  return (
    <ChatForMode
      key={mode}
      projectId={projectId}
      mode={mode}
      onModeChange={setMode}
      initialMessages={initialMessages}
    />
  );
}

function ChatForMode({
  projectId,
  mode,
  onModeChange,
  initialMessages,
}: {
  projectId: string;
  mode: ChatMode;
  onModeChange: (m: ChatMode) => void;
  initialMessages: UIMessage[];
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { projectId, mode },
    }),
    messages: initialMessages,
  });

  const toolCalls = useMemo(() => extractToolCalls(messages), [messages]);

  async function handleClear() {
    if (!confirm("Clear this conversation?")) return;
    await clearChatHistory(projectId, mode);
    location.reload();
  }

  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 h-[calc(100vh-140px)]">
      <div className="flex flex-col rounded-md border border-[hsl(var(--border))]">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-2">
          <ModeToggle value={mode} onChange={onModeChange} />
          <button
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:underline"
          >
            Clear conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {mode === "business"
                ? "Ask anything about what this product is, who it's for, why it matters."
                : mode === "technical"
                  ? "Ask anything about architecture, design decisions, or specific code."
                  : "Quiz mode lives at the Quiz page. (Use the link in the header.)"}
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {status === "streaming" && (
            <div className="text-xs text-muted-foreground">thinking…</div>
          )}
          {error && (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {error.message}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = input.trim();
            if (!text || status === "streaming") return;
            sendMessage({ text });
            setInput("");
          }}
          className="border-t border-[hsl(var(--border))] p-3"
        >
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask in ${mode} mode…`}
              className="flex-1 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm outline-none focus:border-[hsl(var(--primary))]"
            />
            <button
              type="submit"
              disabled={status === "streaming" || !input.trim()}
              className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </div>

      <aside className="rounded-md border border-[hsl(var(--border))] p-3 overflow-y-auto">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Context
        </h3>
        <ContextPanel calls={toolCalls} />
      </aside>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = (message.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : ""}>
      <div
        className={
          isUser
            ? "max-w-[80%] rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm text-[hsl(var(--primary-foreground))]"
            : "max-w-[90%] rounded-lg bg-[hsl(var(--muted))] px-3 py-2 text-sm whitespace-pre-wrap"
        }
      >
        {text || <span className="text-muted-foreground italic">(thinking…)</span>}
      </div>
    </div>
  );
}

function extractToolCalls(messages: UIMessage[]): ToolCallSummary[] {
  const out: ToolCallSummary[] = [];
  for (const m of messages) {
    if (m.role !== "assistant" || !m.parts) continue;
    for (const part of m.parts as Array<{ type: string; [k: string]: unknown }>) {
      if (typeof part.type !== "string") continue;
      if (!part.type.startsWith("tool-")) continue;
      const name = part.type.replace(/^tool-/, "");
      const input = (part as { input?: Record<string, unknown> }).input ?? {};
      const output = (part as { output?: Record<string, unknown> }).output ?? {};
      out.push({
        name,
        path: typeof input.path === "string" ? input.path : undefined,
        query: typeof input.query === "string" ? input.query : undefined,
        hits: Array.isArray((output as { hits?: unknown[] }).hits)
          ? ((output as { hits: unknown[] }).hits.length as number)
          : undefined,
      });
    }
  }
  return out;
}

function toUIMessages(history: ChatMessage[]): UIMessage[] {
  return history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: m.content }],
    }));
}
