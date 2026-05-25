import { randomUUID } from "node:crypto";
import { getDb, toPlain, toPlainArray } from "./db";
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
  const row = getDb().prepare("SELECT * FROM quiz_items WHERE id = ?").get(id) as
    | QuizItem
    | undefined;
  return toPlain(row);
}

export function listQuizItems(projectId: string, focus?: "business" | "technical"): QuizItem[] {
  const rows = (focus
    ? getDb()
        .prepare(
          "SELECT * FROM quiz_items WHERE projectId = ? AND focus = ? ORDER BY createdAt DESC",
        )
        .all(projectId, focus)
    : getDb()
        .prepare("SELECT * FROM quiz_items WHERE projectId = ? ORDER BY createdAt DESC")
        .all(projectId)) as QuizItem[];
  return toPlainArray(rows);
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
  const rows = getDb()
    .prepare("SELECT * FROM quiz_attempts WHERE quizItemId = ? ORDER BY createdAt DESC")
    .all(quizItemId) as QuizAttempt[];
  return toPlainArray(rows);
}

export type ProjectAttemptRow = QuizAttempt & {
  prompt: string;
  focus: "business" | "technical";
  citationsJson: string;
  projectId: string;
};

export function listAllAttemptsForProject(projectId: string): ProjectAttemptRow[] {
  const rows = getDb()
    .prepare(
      `SELECT
         a.id              AS id,
         a.quizItemId      AS quizItemId,
         a.userAnswer      AS userAnswer,
         a.score           AS score,
         a.rationale       AS rationale,
         a.missedPointsJson AS missedPointsJson,
         a.createdAt       AS createdAt,
         i.prompt          AS prompt,
         i.focus           AS focus,
         i.citationsJson   AS citationsJson,
         i.projectId       AS projectId
       FROM quiz_attempts a
       INNER JOIN quiz_items i ON i.id = a.quizItemId
       WHERE i.projectId = ?
       ORDER BY a.createdAt DESC`,
    )
    .all(projectId) as ProjectAttemptRow[];
  return toPlainArray(rows);
}
