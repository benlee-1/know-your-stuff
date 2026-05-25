import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai";
import { getProjectRaw } from "@/lib/projects";
import { loadBriefSync } from "@/lib/brief";
import { makeCodebaseTools } from "@/lib/codebase-tools-ai";
import { buildBusinessSystemPrompt } from "@/lib/prompts/business";
import { buildTechnicalSystemPrompt } from "@/lib/prompts/technical";
import { ChatModeSchema } from "@/lib/schema";
import { appendMessage } from "@/lib/chat-history";

export const maxDuration = 300;

const BodySchema = z.object({
  projectId: z.string().min(1),
  mode: ChatModeSchema,
  // Cap message-array length so a malicious or buggy caller can't drive
  // unbounded LLM cost. 200 turns is comfortably above any real session.
  messages: z.array(z.any()).max(200),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (e) {
    return new Response(JSON.stringify({ error: "bad request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const { projectId, mode, messages } = parsed as {
    projectId: string;
    mode: "business" | "technical" | "quiz";
    messages: UIMessage[];
  };

  const project = getProjectRaw(projectId);
  if (!project) {
    return new Response(JSON.stringify({ error: "project not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const brief = loadBriefSync(project.rootPath);
  const system =
    mode === "business"
      ? buildBusinessSystemPrompt({ projectName: project.name, briefMarkdown: brief })
      : buildTechnicalSystemPrompt({ projectName: project.name, briefMarkdown: brief });

  // Business mode hides grep (the model should lean on docs, not crawl code).
  const tools = makeCodebaseTools(project.rootPath, {
    enable: {
      list_dir: true,
      read_file: true,
      grep: mode !== "business",
    },
  });

  // Persist the user's latest message (last in array).
  const last = messages[messages.length - 1];
  if (last?.role === "user") {
    const text = extractText(last);
    if (text) appendMessage({ projectId, mode, role: "user", content: text });
  }

  const result = streamText({
    model: getModel(),
    system,
    messages: convertToModelMessages(messages),
    tools,
    stopWhen: ({ steps }) => steps.length >= 8,
    onFinish: ({ text, steps }) => {
      const toolParts = buildToolPartsFromSteps(steps);
      if (text || toolParts.length > 0) {
        appendMessage({
          projectId,
          mode,
          role: "assistant",
          content: text,
          toolCalls: toolParts.length ? toolParts : undefined,
        });
      }
    },
  });

  return result.toUIMessageStreamResponse();
}

function extractText(msg: UIMessage): string {
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
function buildToolPartsFromSteps(
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
