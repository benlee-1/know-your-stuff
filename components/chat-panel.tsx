"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ModeToggle } from "./mode-toggle";
import { ContextPanel, type ToolCall } from "./context-panel";
import { ToolDetail } from "./tool-detail";
import { Markdown } from "./markdown";
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
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { projectId, mode },
    }),
    messages: initialMessages,
  });

  const toolCalls = useMemo(() => extractToolCalls(messages), [messages]);
  const selectedCall =
    selectedCallId !== null ? toolCalls.find((c) => c.id === selectedCallId) ?? null : null;

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

      <aside className="flex flex-col rounded-md border border-[hsl(var(--border))] p-3 overflow-hidden">
        {selectedCall ? (
          <ToolDetail call={selectedCall} onBack={() => setSelectedCallId(null)} />
        ) : (
          <>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Context
            </h3>
            <div className="flex-1 overflow-y-auto">
              <ContextPanel
                calls={toolCalls}
                selectedId={selectedCallId}
                onSelect={setSelectedCallId}
              />
            </div>
          </>
        )}
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
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm text-[hsl(var(--primary-foreground))] whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[90%] rounded-lg bg-[hsl(var(--muted))] px-3 py-2 text-sm">
      {text ? (
        <Markdown>{text}</Markdown>
      ) : (
        <span className="italic text-muted-foreground">(thinking…)</span>
      )}
    </div>
  );
}

function extractToolCalls(messages: UIMessage[]): ToolCall[] {
  const out: ToolCall[] = [];
  for (const m of messages) {
    if (m.role !== "assistant" || !m.parts) continue;
    for (const part of m.parts as Array<{
      type: string;
      toolCallId?: string;
      input?: Record<string, unknown>;
      output?: Record<string, unknown>;
    }>) {
      if (typeof part.type !== "string") continue;
      if (!part.type.startsWith("tool-")) continue;
      const name = part.type.replace(/^tool-/, "");
      out.push({
        id: part.toolCallId ?? `${m.id}-${out.length}`,
        name,
        input: part.input ?? {},
        output: part.output ?? null,
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
