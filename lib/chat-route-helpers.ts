import type { UIMessage } from "ai";

/**
 * Reject requests whose Host or Origin isn't local. Even though `next dev -H
 * 127.0.0.1` only binds the loopback interface, a DNS-rebinding attack lets a
 * malicious page (attacker.tld → attacker IP → JS loaded → rebind to 127.0.0.1)
 * issue same-origin POSTs to /api/chat from the user's browser. Those would
 * drive LLM cost and stream file contents back to the attacker's page.
 */
export function isLocalHost(value: string | null): boolean {
  if (!value) return false;
  let host = value;
  try {
    if (value.includes("://")) host = new URL(value).host;
  } catch {
    return false;
  }
  const colonIdx = host.lastIndexOf(":");
  const bareHost = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : colonIdx > -1
      ? host.slice(0, colonIdx)
      : host;
  return bareHost === "localhost" || bareHost === "127.0.0.1" || bareHost === "::1";
}

export function extractText(msg: UIMessage): string {
  if (!msg.parts) return "";
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/**
 * Aggregate every tool call across every step of the assistant's turn into the
 * UIMessage-compatible "tool-<name>" parts shape. onFinish.toolCalls only
 * surfaces the FINAL step's calls — for multi-step flows that's empty.
 */
export function buildToolPartsFromSteps(
  steps: ReadonlyArray<{
    toolCalls?: ReadonlyArray<{ toolCallId: string; toolName: string; input: unknown }>;
    toolResults?: ReadonlyArray<{ toolCallId: string; output: unknown }>;
  }> | undefined,
): Array<{ type: string; toolCallId: string; input: unknown; output: unknown }> {
  if (!steps?.length) return [];
  const outputs = new Map<string, unknown>();
  for (const s of steps) {
    for (const r of s.toolResults ?? []) outputs.set(r.toolCallId, r.output);
  }
  const parts: Array<{ type: string; toolCallId: string; input: unknown; output: unknown }> = [];
  for (const s of steps) {
    for (const c of s.toolCalls ?? []) {
      parts.push({
        type: `tool-${c.toolName}`,
        toolCallId: c.toolCallId,
        input: c.input,
        output: outputs.get(c.toolCallId) ?? null,
      });
    }
  }
  return parts;
}
