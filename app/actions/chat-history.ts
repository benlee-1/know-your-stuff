"use server";

import { revalidatePath } from "next/cache";
import { clearHistory as clear, loadHistory } from "@/lib/chat-history";
import type { ChatMessage, ChatMode } from "@/lib/schema";

export async function getHistory(projectId: string, mode: ChatMode): Promise<ChatMessage[]> {
  return loadHistory(projectId, mode);
}

export async function clearChatHistory(projectId: string, mode: ChatMode): Promise<void> {
  clear(projectId, mode);
  revalidatePath(`/chat/${projectId}`);
}
