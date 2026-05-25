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

  // Phase 1: research with tools. Model explores the repo / brief and drafts
  // questions in free-form prose. No JSON pressure on this step — the model
  // can end the turn however it wants.
  const tools = makeCodebaseTools(p.rootPath, {
    enable: { list_dir: true, read_file: true, grep: args.focus === "technical" },
  });
  const research = await generateText({
    model: getModel(),
    tools,
    stopWhen: ({ steps }) => steps.length >= 12,
    prompt: `${buildQuizGenerationPrompt({
      projectName: p.name,
      focus: args.focus,
      count,
      briefMarkdown: brief,
    })}

For this research step, do not worry about JSON. After exploring as needed, output ${count} questions as a plain numbered list. For each question include:
- The question prompt
- An ideal 2-4 sentence answer
- 0-3 citation paths (relative file paths) when relevant
`,
  });

  // Phase 2: format. No tools, no prose latitude — generateObject pins the
  // model to the schema via JSON mode / tool calling under the hood.
  const { object } = await generateObject({
    model: getModel(),
    schema: QuizBatchSchema,
    prompt: `Convert the following interview questions into the structured schema. Preserve the question text and ideal answer verbatim. Use the citations as-is.

Source material:
${research.text}`,
  });

  return insertQuizItems({
    projectId: args.projectId,
    focus: args.focus,
    questions: object.questions.slice(0, count),
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

  // Phase 1: research — model verifies claims against the code if helpful.
  const tools = makeCodebaseTools(project.rootPath, {
    enable: { list_dir: false, read_file: true, grep: item.focus === "technical" },
  });
  const research = await generateText({
    model: getModel(),
    tools,
    stopWhen: ({ steps }) => steps.length >= 8,
    prompt: `${buildQuizGradingPrompt({
      prompt: item.prompt,
      idealAnswer: item.idealAnswer,
      userAnswer: trimmed,
      citations,
    })}

For this research step, do not worry about JSON. After checking citations if helpful, write your assessment as plain prose: a score between 0 and 1, a 2-4 sentence rationale, and 0-5 missed points the user did not cover.
`,
  });

  // Phase 2: format.
  const { object: grade } = await generateObject({
    model: getModel(),
    schema: QuizGradeSchema,
    prompt: `Convert the following grading assessment into the structured schema. Preserve the score, rationale, and missed points verbatim.

Source material:
${research.text}`,
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

