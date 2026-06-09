import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import { addProjectRaw } from "@/lib/projects";
import { getProgress, upsertProgress } from "@/lib/walkthrough";

let dbPath: string;
let projectId: string;
let projectRoot: string;

beforeEach(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kys-wt-")), "db.sqlite");
  process.env.KYS_DB_PATH = dbPath;
  _resetDbForTests();
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kys-wt-proj-"));
  projectId = addProjectRaw({ name: "p", rootPath: projectRoot }).id;
});
afterEach(() => {
  _resetDbForTests();
  delete process.env.KYS_DB_PATH;
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe("walkthrough progress storage", () => {
  it("returns [] when no progress yet", () => {
    expect(getProgress(projectId)).toEqual([]);
  });

  it("upsertProgress inserts then updates the same (project, section) row", () => {
    upsertProgress(projectId, "architecture", { passed: false, bestScore: 0.4, attempts: 1 });
    let rows = getProgress(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sectionId: "architecture", passed: false, bestScore: 0.4, attempts: 1 });

    upsertProgress(projectId, "architecture", { passed: true, bestScore: 0.9, attempts: 2 });
    rows = getProgress(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ passed: true, bestScore: 0.9, attempts: 2 });
  });
});
