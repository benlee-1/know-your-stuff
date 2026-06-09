import { randomUUID } from "node:crypto";
import { getDb, toPlainArray } from "./db";
import type { WalkthroughProgress } from "./schema";

export function getProgress(projectId: string): WalkthroughProgress[] {
  const rows = getDb()
    .prepare("SELECT * FROM walkthrough_progress WHERE projectId = ?")
    .all(projectId) as Array<Omit<WalkthroughProgress, "passed"> & { passed: number }>;
  return toPlainArray(rows).map((r) => ({ ...r, passed: !!r.passed }));
}

export function upsertProgress(
  projectId: string,
  sectionId: string,
  v: { passed: boolean; bestScore: number; attempts: number },
): void {
  getDb()
    .prepare(
      `INSERT INTO walkthrough_progress (id, projectId, sectionId, passed, bestScore, attempts, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(projectId, sectionId) DO UPDATE SET
         passed = excluded.passed,
         bestScore = excluded.bestScore,
         attempts = excluded.attempts,
         updatedAt = excluded.updatedAt`,
    )
    .run(randomUUID(), projectId, sectionId, v.passed ? 1 : 0, v.bestScore, v.attempts, Date.now());
}
