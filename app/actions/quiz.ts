"use server";

import { generateObject, generateText } from "ai";
import { getModel } from "@/lib/ai";
import { loadBriefSync } from "@/lib/brief";
import { makeCodebaseTools } from "@/lib/codebase-tools-ai";
import { getProjectRaw } from "@/lib/projects";
import {
  buildQuizGenerationPrompt,
  buildQuizGradingPrompt,
  QuizBatchSchema,
  QuizGradeSchema,
} from "@/lib/prompts/quiz";
import {
  getQuizItem,
  insertAttempt,
  insertQuizItems,
  listAllAttemptsForProject,
  listAttemptsForItem,
  listQuizItems,
  type ProjectAttemptRow,
} from "@/lib/quiz";
import type { QuizAttempt, QuizItem } from "@/lib/schema";

export async function generateQuizBatch(args: {
  projectId: string;
  focus: "business" | "technical";
  count: number;
}): Promise<QuizItem[]> {
  const p = getProjectRaw(args.projectId);
  if (!p) throw new Error("Project not found");
  const brief = loadBriefSync(p.rootPath);
  const count = Math.max(1, Math.min(10, args.count));

  // Phase 1: research with tools. Strict prompt requiring the model to
  // (a) actually inspect the repo and (b) terminate with a plain-text
  // numbered list of questions. `experimental_output` cannot be used here
  // because it forces tool_choice to the synthetic JSON tool, blocking
  // read_file / grep / list_dir.
  const tools = makeCodebaseTools(p.rootPath, {
    enable: { list_dir: true, read_file: true, grep: args.focus === "technical" },
  });
  const research = await generateText({
    model: getModel(),
    tools,
    stopWhen: ({ steps }) => steps.length >= 20,
    prompt: `${buildQuizGenerationPrompt({
      projectName: p.name,
      focus: args.focus,
      count,
      briefMarkdown: brief,
    })}

Process (follow exactly):
1. First, call list_dir on "." to see the project layout.
2. ${args.focus === "technical"
        ? "Use grep and read_file to explore specific files that look interview-worthy (key entry points, complex flows, recent changes, architecture-defining files)."
        : "Use read_file on README.md and top-level docs to ground yourself in product framing and lingo."}
3. Then, in a plain-text response (NOT JSON), write exactly ${count} numbered questions. For each one include:
   - The question prompt
   - An ideal 2-4 sentence answer
   - 0-3 citation paths (relative file paths) — only for technical questions

End your turn with that list as plain text. The next step will convert it to JSON.`,
  });

  const text = research.text?.trim() ?? "";
  if (!text || text.length < 80) {
    console.error("[quiz] research text empty/short. finishReason=", research.finishReason);
    console.error("[quiz] steps=", research.steps?.length, "toolCalls=",
      research.steps?.reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0),
    );
    console.error("[quiz] text=", JSON.stringify(text));
    throw new Error(
      `Quiz generation didn't produce written questions (finishReason=${research.finishReason}, steps=${research.steps?.length}). The model may have used its whole step budget on tool calls. Try a lower question count.`,
    );
  }

  // Phase 2: format the prose into the schema. No tools, so generateObject
  // can safely force the JSON-output tool.
  const { object } = await generateObject({
    model: getModel(),
    schema: QuizBatchSchema,
    prompt: `Convert the following interview questions into the structured schema. Preserve question text and ideal answer verbatim. Use the citations as-is. Output every question listed.

Source material:
${text}`,
  });

  const questions = object.questions.filter(
    (q) => q.prompt.trim() && q.idealAnswer.trim(),
  );

  if (questions.length === 0) {
    console.error("[quiz] formatter returned 0 questions. raw=", JSON.stringify(object));
    throw new Error("Format step produced no questions from a non-empty research result. See server log.");
  }

  return insertQuizItems({
    projectId: args.projectId,
    focus: args.focus,
    questions: questions.slice(0, count),
  });
}

export async function submitQuizAnswer(args: {
  quizItemId: string;
  userAnswer: string;
}): Promise<QuizAttempt> {
  const trimmed = args.userAnswer.trim();
  if (!trimmed) throw new Error("Answer cannot be empty.");

  const item = getQuizItem(args.quizItemId);
  if (!item) throw new Error("Quiz item not found");

  const project = getProjectRaw(item.projectId);
  if (!project) throw new Error("Project not found");

  const citations: string[] = JSON.parse(item.citationsJson || "[]");

  // Phase 1: research with tools.
  const tools = makeCodebaseTools(project.rootPath, {
    enable: { list_dir: false, read_file: true, grep: item.focus === "technical" },
  });
  const research = await generateText({
    model: getModel(),
    tools,
    stopWhen: ({ steps }) => steps.length >= 12,
    prompt: `${buildQuizGradingPrompt({
      prompt: item.prompt,
      idealAnswer: item.idealAnswer,
      userAnswer: trimmed,
      citations,
    })}

Process:
1. ${item.focus === "technical"
        ? "If any citation paths are listed, read_file (or grep) the relevant ones to verify the user's claims."
        : "Consider the ideal answer and how the user's answer compares."}
2. End your turn with a plain-prose assessment containing:
   - A score between 0 and 1
   - A 2-4 sentence rationale
   - 0-5 specific missed points the user didn't cover

The next step will convert your assessment to JSON. Do NOT output JSON yourself.`,
  });

  const researchText = research.text?.trim() ?? "";
  if (!researchText) {
    console.error("[grade] empty research. finishReason=", research.finishReason);
    throw new Error(`Grading produced no written assessment (finishReason=${research.finishReason}).`);
  }

  // Phase 2: format.
  const { object: grade } = await generateObject({
    model: getModel(),
    schema: QuizGradeSchema,
    prompt: `Convert the following grading assessment into the structured schema. Preserve the score, rationale, and missed points verbatim.

Source material:
${researchText}`,
  });

  return insertAttempt({
    quizItemId: item.id,
    userAnswer: trimmed,
    score: grade.score,
    rationale: grade.rationale,
    missedPoints: grade.missedPoints,
  });
}

export async function listQuizForProject(
  projectId: string,
  focus?: "business" | "technical",
): Promise<QuizItem[]> {
  return listQuizItems(projectId, focus);
}

export async function listAttempts(quizItemId: string): Promise<QuizAttempt[]> {
  return listAttemptsForItem(quizItemId);
}

export async function listProjectHistory(projectId: string): Promise<ProjectAttemptRow[]> {
  return listAllAttemptsForProject(projectId);
}

