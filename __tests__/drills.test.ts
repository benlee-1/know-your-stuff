import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import { addProjectRaw } from "@/lib/projects";
import {
  serializeTranscript,
  parseTranscript,
  insertDrillSession,
  listDrillSessions,
  DRILL_TURNS,
} from "@/lib/drills";

let dbPath: string;
let projectId: string;
let projectRoot: string;

beforeEach(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kys-dr-")), "db.sqlite");
  process.env.KYS_DB_PATH = dbPath;
  _resetDbForTests();
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kys-dr-proj-"));
  projectId = addProjectRaw({ name: "p", rootPath: projectRoot }).id;
});
afterEach(() => {
  _resetDbForTests();
  delete process.env.KYS_DB_PATH;
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe("transcript serialize/parse", () => {
  it("round-trips a transcript", () => {
    const t = [{ question: "q1", answer: "a1" }, { question: "q2", answer: "a2" }];
    expect(parseTranscript(serializeTranscript(t))).toEqual(t);
  });
  it("parse tolerates empty/garbage -> []", () => {
    expect(parseTranscript("")).toEqual([]);
    expect(parseTranscript("not json")).toEqual([]);
  });
});

describe("DRILL_TURNS", () => {
  it("is 3", () => expect(DRILL_TURNS).toBe(3));
});

describe("drill session storage", () => {
  it("inserts and lists newest-first", () => {
    insertDrillSession({
      projectId, sectionId: "architecture",
      transcript: [{ question: "q", answer: "a" }],
      score: 0.8, strengths: ["clear"], weaknesses: ["shallow"],
    });
    insertDrillSession({
      projectId, sectionId: "data-model",
      transcript: [{ question: "q2", answer: "a2" }],
      score: 0.5, strengths: [], weaknesses: ["vague"],
    });
    const rows = listDrillSessions(projectId);
    expect(rows).toHaveLength(2);
    expect(rows[0].sectionId).toBe("data-model"); // newest first
    expect(JSON.parse(rows[0].weaknessesJson)).toEqual(["vague"]);
    expect(parseTranscript(rows[1].transcriptJson)).toEqual([{ question: "q", answer: "a" }]);
  });
});
