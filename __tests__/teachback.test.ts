import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import { addProjectRaw } from "@/lib/projects";
import { insertTeachbackSession, listTeachbackSessions } from "@/lib/teachback";

let dbPath: string; let projectId: string; let projectRoot: string;
beforeEach(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kys-tb-")), "db.sqlite");
  process.env.KYS_DB_PATH = dbPath; _resetDbForTests();
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kys-tb-proj-"));
  projectId = addProjectRaw({ name: "p", rootPath: projectRoot }).id;
});
afterEach(() => {
  _resetDbForTests(); delete process.env.KYS_DB_PATH;
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe("teachback session storage", () => {
  it("inserts and lists newest-first with JSON columns round-tripping", () => {
    insertTeachbackSession({
      projectId, sectionId: "architecture", explanation: "two apps",
      coverageScore: 0.6, gaps: ["auth"], socraticQuestion: "how does auth work?",
      response: "auth0", summary: "decent", stillMissing: ["flyway"],
    });
    insertTeachbackSession({
      projectId, sectionId: "data-model", explanation: "entities",
      coverageScore: 0.9, gaps: [], socraticQuestion: "q2", response: "r2",
      summary: "great", stillMissing: [],
    });
    const rows = listTeachbackSessions(projectId);
    expect(rows).toHaveLength(2);
    expect(rows[0].sectionId).toBe("data-model");
    expect(JSON.parse(rows[1].gapsJson)).toEqual(["auth"]);
    expect(JSON.parse(rows[1].stillMissingJson)).toEqual(["flyway"]);
    expect(rows[1].coverageScore).toBe(0.6);
  });
});
