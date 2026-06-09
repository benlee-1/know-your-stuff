import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import { addProjectRaw } from "@/lib/projects";
import {
  generateSectionQuestion,
  submitWalkthroughAnswer,
} from "@/app/actions/walkthrough";

const LIVE = process.env.KYS_LIVE === "1";
const TARGET = process.env.KYS_TARGET ?? path.join(os.homedir(), "code", "weekly-commit-module");

let dbDir: string;
let projectId: string;

beforeAll(() => {
  if (!LIVE) return;
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "kys-wt-live-"));
  process.env.KYS_DB_PATH = path.join(dbDir, "db.sqlite");
  _resetDbForTests();
  projectId = addProjectRaw({ name: "weekly-commit-module", rootPath: TARGET }).id;
});
afterAll(() => {
  if (!LIVE) return;
  _resetDbForTests();
  delete process.env.KYS_DB_PATH;
  fs.rmSync(dbDir, { recursive: true, force: true });
});

describe.skipIf(!LIVE)("walkthrough live smoke (KYS_LIVE=1)", () => {
  it(
    "generates a question and grades a good answer high, a poor answer low",
    async () => {
      expect(fs.existsSync(path.join(TARGET, ".know-your-stuff", "dossier.md"))).toBe(true);

      const q = await generateSectionQuestion(projectId, "architecture", []);
      expect(q.question.length).toBeGreaterThan(0);
      expect(q.idealAnswer.length).toBeGreaterThan(0);

      const good = await submitWalkthroughAnswer({
        projectId,
        sectionId: "architecture",
        question: q.question,
        idealAnswer: q.idealAnswer,
        userAnswer: q.idealAnswer,
        attemptNumber: 1,
      });
      expect(good.grade.score).toBeGreaterThanOrEqual(0.7);
      expect(good.decision.advance).toBe(true);

      const bad = await submitWalkthroughAnswer({
        projectId,
        sectionId: "architecture",
        question: q.question,
        idealAnswer: q.idealAnswer,
        userAnswer: "I don't know.",
        attemptNumber: 1,
      });
      expect(bad.grade.score).toBeLessThan(0.7);
      expect(bad.decision.reveal).toBe(true);
    },
    180_000,
  );
});
