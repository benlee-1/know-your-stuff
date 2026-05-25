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
import {
  buildToolPartsFromSteps,
  extractText,
  isLocalHost,
} from "@/lib/chat-route-helpers";

export const maxDuration = 300;

const BodySchema = z.object({
  projectId: z.string().min(1),
  mode: ChatModeSchema,
  messages: z.array(z.any()).max(200),
});

export async function POST(req: Request) {
  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  // DNS-rebinding defense: reject any request whose Host isn't local, or
  // whose Origin is set but isn't local. (Origin can be absent on legitimate
  // same-origin POSTs from older clients; Host is always present.)
  if (!isLocalHost(host) || (origin !== null && !isLocalHost(origin))) {
    return new Response(JSON.stringify({ error: "forbidden: non-local origin" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
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

  const tools = makeCodebaseTools(project.rootPath, {
    enable: {
      list_dir: true,
      read_file: true,
      grep: mode !== "business",
    },
  });

  // Capture the user's latest message but DO NOT persist yet. If streamText
  // errors mid-turn (429, 5xx, network), persisting the user message up front
  // leaves a dangling row with no assistant reply, distorting the conversation
  // shape on reload. Both user + assistant rows are written together in
  // onFinish; on error neither lands and the user can retry cleanly.
  const last = messages[messages.length - 1];
  const userTextToPersist = last?.role === "user" ? extractText(last) : "";

  const result = streamText({
    model: getModel(),
    system,
    messages: convertToModelMessages(messages),
    tools,
    stopWhen: ({ steps }) => steps.length >= 8,
    onFinish: ({ text, steps }) => {
      const toolParts = buildToolPartsFromSteps(steps);
      if (userTextToPersist) {
        appendMessage({ projectId, mode, role: "user", content: userTextToPersist });
      }
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
    onError: ({ error }) => {
      console.error("[chat] stream error:", error);
    },
  });

  return result.toUIMessageStreamResponse();
}
