import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { ChatMessage, ChatMode } from "./schema";

export function loadHistory(projectId: string, mode: ChatMode): ChatMessage[] {
  return getDb()
    .prepare(
      "SELECT * FROM chat_messages WHERE projectId = ? AND mode = ? ORDER BY createdAt ASC",
    )
    .all(projectId, mode) as ChatMessage[];
}

export function appendMessage(args: {
  projectId: string;
  mode: ChatMode;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: unknown;
}): ChatMessage {
  const msg: ChatMessage = {
    id: randomUUID(),
    projectId: args.projectId,
    mode: args.mode,
    role: args.role,
    content: args.content,
    toolCallsJson: args.toolCalls ? JSON.stringify(args.toolCalls) : null,
    createdAt: Date.now(),
  };
  getDb()
    .prepare(
      "INSERT INTO chat_messages (id, projectId, mode, role, content, toolCallsJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      msg.id,
      msg.projectId,
      msg.mode,
      msg.role,
      msg.content,
      msg.toolCallsJson,
      msg.createdAt,
    );
  return msg;
}

export function clearHistory(projectId: string, mode: ChatMode): void {
  getDb()
    .prepare("DELETE FROM chat_messages WHERE projectId = ? AND mode = ?")
    .run(projectId, mode);
}
