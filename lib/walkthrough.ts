import { randomUUID } from "node:crypto";
import { getDb, toPlainArray } from "./db";
import type { WalkthroughProgress } from "./schema";
import { DOSSIER_SECTIONS } from "./dossier";

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

export const GATE_THRESHOLD = 0.7;

export interface GateOutcome {
  passed: boolean;
  reveal: boolean;
  advance: boolean;
}

/**
 * Bounded gate: attempt 1 gates (miss => reveal, stay); attempt 2 (the
 * confirming question after a reveal) always advances. `passed` is true only if
 * the answer cleared the threshold on whichever attempt.
 */
export function gateDecision(score: number, attemptNumber: number): GateOutcome {
  const passed = score >= GATE_THRESHOLD;
  if (attemptNumber >= 2) return { passed, reveal: false, advance: true };
  if (passed) return { passed: true, reveal: false, advance: true };
  return { passed: false, reveal: true, advance: false };
}

export interface ProgressValue {
  passed: boolean;
  bestScore: number;
  attempts: number;
}

/** Merge a new attempt into the prior row (or null) — best score wins, attempts++, passed sticks. */
export function mergeProgress(
  prev: ProgressValue | null,
  score: number,
  passedThisAttempt: boolean,
): ProgressValue {
  return {
    passed: (prev?.passed ?? false) || passedThisAttempt,
    bestScore: Math.max(prev?.bestScore ?? 0, score),
    attempts: (prev?.attempts ?? 0) + 1,
  };
}

/** First DOSSIER_SECTIONS id not yet "done" (done = passed OR attempts exhausted), or null when all done. */
export function computeCurrentSectionId(
  progress: Array<{ sectionId: string; passed: boolean; attempts: number }>,
): string | null {
  const doneIds = new Set(
    progress.filter((p) => p.passed || p.attempts >= 2).map((p) => p.sectionId),
  );
  for (const s of DOSSIER_SECTIONS) {
    if (!doneIds.has(s.id)) return s.id;
  }
  return null;
}
