import { randomUUID } from "node:crypto";
import { getDb, toPlainArray } from "./db";
import type { TeachbackSession } from "./schema";

export function insertTeachbackSession(args: {
  projectId: string;
  sectionId: string;
  explanation: string;
  coverageScore: number;
  gaps: string[];
  socraticQuestion: string;
  response: string;
  summary: string;
  stillMissing: string[];
  masteredPoints: string[];
}): TeachbackSession {
  const row: TeachbackSession = {
    id: randomUUID(),
    projectId: args.projectId,
    sectionId: args.sectionId,
    explanation: args.explanation,
    coverageScore: args.coverageScore,
    gapsJson: JSON.stringify(args.gaps ?? []),
    socraticQuestion: args.socraticQuestion,
    response: args.response,
    summary: args.summary,
    stillMissingJson: JSON.stringify(args.stillMissing ?? []),
    masteredPointsJson: JSON.stringify(args.masteredPoints ?? []),
    createdAt: Date.now(),
  };
  getDb()
    .prepare(
      `INSERT INTO teachback_sessions (id, projectId, sectionId, explanation, coverageScore, gapsJson, socraticQuestion, response, summary, stillMissingJson, masteredPointsJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.projectId, row.sectionId, row.explanation, row.coverageScore, row.gapsJson, row.socraticQuestion, row.response, row.summary, row.stillMissingJson, row.masteredPointsJson, row.createdAt);
  return row;
}

export function listTeachbackSessions(projectId: string): TeachbackSession[] {
  const rows = getDb()
    .prepare("SELECT * FROM teachback_sessions WHERE projectId = ? ORDER BY createdAt DESC")
    .all(projectId) as TeachbackSession[];
  return toPlainArray(rows);
}
