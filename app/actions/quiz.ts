"use server";

import { generateText, Output } from "ai";
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

  const tools = makeCodebaseTools(p.rootPath, {
    enable: { list_dir: true, read_file: true, grep: args.focus === "technical" },
  });

  const res = await generateText({
    model: getModel(),
    tools,
    stopWhen: ({ steps }) => steps.length >= 16,
    experimental_output: Output.object({ schema: QuizBatchSchema }),
    prompt: buildQuizGenerationPrompt({
      projectName: p.name,
      focus: args.focus,
      count,
      briefMarkdown: brief,
    }),
  });

  const questions = (res.experimental_output?.questions ?? []).filter(
    (q) => q.prompt.trim() && q.idealAnswer.trim(),
  );

  if (questions.length === 0) {
    console.error("[quiz] empty result. finishReason=", res.finishReason);
    console.error("[quiz] text snippet=", res.text?.slice(0, 500));
    console.error("[quiz] steps=", res.steps?.length, "toolCalls=",
      res.steps?.reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0),
    );
    throw new Error(
      `No questions generated (finishReason=${res.finishReason}). The model explored the repo but didn't produce a structured batch. Try a lower question count or a different focus.`,
    );
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

  const tools = makeCodebaseTools(project.rootPath, {
    enable: { list_dir: false, read_file: true, grep: item.focus === "technical" },
  });

  const res = await generateText({
    model: getModel(),
    tools,
    stopWhen: ({ steps }) => steps.length >= 10,
    experimental_output: Output.object({ schema: QuizGradeSchema }),
    prompt: buildQuizGradingPrompt({
      prompt: item.prompt,
      idealAnswer: item.idealAnswer,
      userAnswer: trimmed,
      citations,
    }),
  });

  const grade = res.experimental_output;
  if (!grade) {
    console.error("[grade] empty result. finishReason=", res.finishReason);
    console.error("[grade] text snippet=", res.text?.slice(0, 500));
    throw new Error(`Grading produced no structured output (finishReason=${res.finishReason}).`);
  }

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

