import { randomUUID } from "node:crypto";
import { getDb, toPlainArray } from "./db";
import type { DrillSession } from "./schema";

export const DRILL_TURNS = 3;

export interface DrillTurn {
  question: string;
  answer: string;
}

export function serializeTranscript(transcript: DrillTurn[]): string {
  return JSON.stringify(transcript);
}

export function parseTranscript(json: string): DrillTurn[] {
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => x && typeof x.question === "string" && typeof x.answer === "string")
      .map((x) => ({ question: x.question, answer: x.answer }));
  } catch {
    return [];
  }
}

export function insertDrillSession(args: {
  projectId: string;
  sectionId: string;
  transcript: DrillTurn[];
  score: number;
  strengths: string[];
  weaknesses: string[];
}): DrillSession {
  const row: DrillSession = {
    id: randomUUID(),
    projectId: args.projectId,
    sectionId: args.sectionId,
    transcriptJson: serializeTranscript(args.transcript),
    score: args.score,
    strengthsJson: JSON.stringify(args.strengths ?? []),
    weaknessesJson: JSON.stringify(args.weaknesses ?? []),
    createdAt: Date.now(),
  };
  getDb()
    .prepare(
      `INSERT INTO drill_sessions (id, projectId, sectionId, transcriptJson, score, strengthsJson, weaknessesJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.projectId, row.sectionId, row.transcriptJson, row.score, row.strengthsJson, row.weaknessesJson, row.createdAt);
  return row;
}

export function listDrillSessions(projectId: string): DrillSession[] {
  const rows = getDb()
    .prepare("SELECT * FROM drill_sessions WHERE projectId = ? ORDER BY createdAt DESC")
    .all(projectId) as DrillSession[];
  return toPlainArray(rows);
}
