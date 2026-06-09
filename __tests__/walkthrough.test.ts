import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import { addProjectRaw } from "@/lib/projects";
import { getProgress, upsertProgress } from "@/lib/walkthrough";
import {
  GATE_THRESHOLD,
  gateDecision,
  mergeProgress,
  computeCurrentSectionId,
} from "@/lib/walkthrough";
import { DOSSIER_SECTIONS } from "@/lib/dossier";

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

describe("gateDecision", () => {
  it("attempt 1 pass -> advance, no reveal", () => {
    expect(gateDecision(0.8, 1)).toEqual({ passed: true, reveal: false, advance: true });
  });
  it("attempt 1 miss -> reveal, no advance", () => {
    expect(gateDecision(0.5, 1)).toEqual({ passed: false, reveal: true, advance: false });
  });
  it("attempt 2 always advances; passed reflects the threshold", () => {
    expect(gateDecision(0.9, 2)).toEqual({ passed: true, reveal: false, advance: true });
    expect(gateDecision(0.3, 2)).toEqual({ passed: false, reveal: false, advance: true });
  });
  it("uses GATE_THRESHOLD as the boundary (inclusive)", () => {
    expect(gateDecision(GATE_THRESHOLD, 1).passed).toBe(true);
  });
});

describe("mergeProgress", () => {
  it("from no prior row: records the attempt", () => {
    expect(mergeProgress(null, 0.4, false)).toEqual({ passed: false, bestScore: 0.4, attempts: 1 });
  });
  it("keeps the best score, increments attempts, ORs passed", () => {
    const prev = { passed: false, bestScore: 0.4, attempts: 1 };
    expect(mergeProgress(prev, 0.9, true)).toEqual({ passed: true, bestScore: 0.9, attempts: 2 });
  });
  it("does not lower bestScore or un-pass", () => {
    const prev = { passed: true, bestScore: 0.9, attempts: 1 };
    expect(mergeProgress(prev, 0.2, false)).toEqual({ passed: true, bestScore: 0.9, attempts: 2 });
  });
});

describe("computeCurrentSectionId", () => {
  it("first section when no progress", () => {
    expect(computeCurrentSectionId([])).toBe(DOSSIER_SECTIONS[0].id);
  });
  it("first not-passed section in canonical order", () => {
    const progress = [
      { sectionId: DOSSIER_SECTIONS[0].id, passed: true },
      { sectionId: DOSSIER_SECTIONS[1].id, passed: false },
    ] as any;
    expect(computeCurrentSectionId(progress)).toBe(DOSSIER_SECTIONS[1].id);
  });
  it("null when every section is passed", () => {
    const progress = DOSSIER_SECTIONS.map((s) => ({ sectionId: s.id, passed: true })) as any;
    expect(computeCurrentSectionId(progress)).toBeNull();
  });
});
