import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { QuizAttempt, QuizItem } from "./schema";

export function insertQuizItems(args: {
  projectId: string;
  focus: "business" | "technical";
  questions: { prompt: string; idealAnswer: string; citations: string[] }[];
}): QuizItem[] {
  const stmt = getDb().prepare(
    "INSERT INTO quiz_items (id, projectId, focus, prompt, idealAnswer, citationsJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const now = Date.now();
  const items: QuizItem[] = [];
  for (const q of args.questions) {
    const item: QuizItem = {
      id: randomUUID(),
      projectId: args.projectId,
      focus: args.focus,
      prompt: q.prompt,
      idealAnswer: q.idealAnswer,
      citationsJson: JSON.stringify(q.citations ?? []),
      createdAt: now + items.length,
    };
    stmt.run(
      item.id,
      item.projectId,
      item.focus,
      item.prompt,
      item.idealAnswer,
      item.citationsJson,
      item.createdAt,
    );
    items.push(item);
  }
  return items;
}

export function getQuizItem(id: string): QuizItem | null {
  return (getDb().prepare("SELECT * FROM quiz_items WHERE id = ?").get(id) as QuizItem) ?? null;
}

export function listQuizItems(projectId: string, focus?: "business" | "technical"): QuizItem[] {
  if (focus) {
    return getDb()
      .prepare(
        "SELECT * FROM quiz_items WHERE projectId = ? AND focus = ? ORDER BY createdAt DESC",
      )
      .all(projectId, focus) as QuizItem[];
  }
  return getDb()
    .prepare("SELECT * FROM quiz_items WHERE projectId = ? ORDER BY createdAt DESC")
    .all(projectId) as QuizItem[];
}

export function insertAttempt(args: {
  quizItemId: string;
  userAnswer: string;
  score: number;
  rationale: string;
  missedPoints: string[];
}): QuizAttempt {
  const attempt: QuizAttempt = {
    id: randomUUID(),
    quizItemId: args.quizItemId,
    userAnswer: args.userAnswer,
    score: args.score,
    rationale: args.rationale,
    missedPointsJson: JSON.stringify(args.missedPoints ?? []),
    createdAt: Date.now(),
  };
  getDb()
    .prepare(
      "INSERT INTO quiz_attempts (id, quizItemId, userAnswer, score, rationale, missedPointsJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      attempt.id,
      attempt.quizItemId,
      attempt.userAnswer,
      attempt.score,
      attempt.rationale,
      attempt.missedPointsJson,
      attempt.createdAt,
    );
  return attempt;
}

export function listAttemptsForItem(quizItemId: string): QuizAttempt[] {
  return getDb()
    .prepare("SELECT * FROM quiz_attempts WHERE quizItemId = ? ORDER BY createdAt DESC")
    .all(quizItemId) as QuizAttempt[];
}
