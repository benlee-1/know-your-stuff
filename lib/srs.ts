import { randomUUID } from "node:crypto";
import { getDb, toPlainArray } from "./db";
import type { Flashcard } from "./schema";

const DAY_MS = 86_400_000;

export const DEFAULT_EASE = 2.5;

export type Rating = "again" | "hard" | "good" | "easy";

export function ratingToQuality(rating: Rating): number {
  switch (rating) {
    case "again": return 2;
    case "hard": return 3;
    case "good": return 4;
    case "easy": return 5;
  }
}

export interface CardSchedule {
  ease: number;
  intervalDays: number;
  reps: number;
}

export interface ScheduleResult extends CardSchedule {
  dueAt: number;
}

/**
 * SM-2. quality<3 is a lapse (reps reset, review again in 1 day). quality>=3
 * advances the interval (1 → 6 → round(prev*ease)). Ease is updated on every
 * review and floored at 1.3.
 */
export function scheduleCard(prev: CardSchedule, quality: number, now: number): ScheduleResult {
  let { ease, intervalDays, reps } = prev;

  if (quality < 3) {
    reps = 0;
    intervalDays = 1;
  } else {
    if (reps === 0) intervalDays = 1;
    else if (reps === 1) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * ease);
    reps = reps + 1;
  }

  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ease < 1.3) ease = 1.3;

  return { ease, intervalDays, reps, dueAt: now + intervalDays * DAY_MS };
}

export function isDue(card: { dueAt: number }, now: number): boolean {
  return card.dueAt <= now;
}

export function insertCards(args: {
  projectId: string;
  sectionId: string;
  cards: { front: string; back: string }[];
  now: number;
}): Flashcard[] {
  const stmt = getDb().prepare(
    `INSERT INTO flashcards (id, projectId, sectionId, front, back, ease, intervalDays, reps, dueAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const out: Flashcard[] = [];
  for (const c of args.cards) {
    const row: Flashcard = {
      id: randomUUID(),
      projectId: args.projectId,
      sectionId: args.sectionId,
      front: c.front,
      back: c.back,
      ease: DEFAULT_EASE,
      intervalDays: 0,
      reps: 0,
      dueAt: args.now,
      createdAt: args.now,
    };
    stmt.run(row.id, row.projectId, row.sectionId, row.front, row.back, row.ease, row.intervalDays, row.reps, row.dueAt, row.createdAt);
    out.push(row);
  }
  return out;
}

export function listCards(projectId: string): Flashcard[] {
  const rows = getDb().prepare("SELECT * FROM flashcards WHERE projectId = ? ORDER BY createdAt ASC").all(projectId) as Flashcard[];
  return toPlainArray(rows);
}

export function listDueCards(projectId: string, now: number): Flashcard[] {
  const rows = getDb()
    .prepare("SELECT * FROM flashcards WHERE projectId = ? AND dueAt <= ? ORDER BY dueAt ASC")
    .all(projectId, now) as Flashcard[];
  return toPlainArray(rows);
}

export function updateCardSchedule(
  id: string,
  sched: { ease: number; intervalDays: number; reps: number; dueAt: number },
): void {
  getDb()
    .prepare("UPDATE flashcards SET ease = ?, intervalDays = ?, reps = ?, dueAt = ? WHERE id = ?")
    .run(sched.ease, sched.intervalDays, sched.reps, sched.dueAt, id);
}
