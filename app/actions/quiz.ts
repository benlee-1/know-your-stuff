"use server";

import { generateText } from "ai";
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
  listAttemptsForItem,
  listQuizItems,
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

  const prompt = buildQuizGenerationPrompt({
    projectName: p.name,
    focus: args.focus,
    count: Math.max(1, Math.min(10, args.count)),
    briefMarkdown: brief,
  });

  const tools = makeCodebaseTools(p.rootPath, {
    enable: { list_dir: true, read_file: true, grep: args.focus === "technical" },
  });

  const batch = await generateAndParse(prompt, tools, QuizBatchSchema);
  return insertQuizItems({
    projectId: args.projectId,
    focus: args.focus,
    questions: batch.questions,
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
  const prompt = buildQuizGradingPrompt({
    prompt: item.prompt,
    idealAnswer: item.idealAnswer,
    userAnswer: trimmed,
    citations,
  });

  const tools = makeCodebaseTools(project.rootPath, {
    enable: { list_dir: false, read_file: true, grep: item.focus === "technical" },
  });

  const grade = await generateAndParse(prompt, tools, QuizGradeSchema);
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

async function generateAndParse<T>(
  prompt: string,
  tools: ReturnType<typeof makeCodebaseTools>,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateText({
      model: getModel(),
      prompt,
      tools,
      stopWhen: ({ steps }) => steps.length >= 8,
    });
    const text = stripFences(res.text);
    try {
      const parsed = JSON.parse(text);
      const r = schema.safeParse(parsed);
      if (r.success && r.data) return r.data;
    } catch {}
    prompt = `${prompt}\n\nYour previous output was not valid JSON matching the schema. Output ONLY JSON. Previous output:\n${res.text}`;
  }
  throw new Error("Model produced invalid JSON twice in a row.");
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}
