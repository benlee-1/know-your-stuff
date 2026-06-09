import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import { addProjectRaw } from "@/lib/projects";
import { startDrill, nextDrillQuestion, finishDrill } from "@/app/actions/drills";
import { parseTranscript } from "@/lib/drills";

const LIVE = process.env.KYS_LIVE === "1";
const TARGET = process.env.KYS_TARGET ?? path.join(os.homedir(), "code", "weekly-commit-module");

let dbDir: string;
let projectId: string;

beforeAll(() => {
  if (!LIVE) return;
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "kys-dr-live-"));
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

describe.skipIf(!LIVE)("drills live smoke (KYS_LIVE=1)", () => {
  it(
    "runs a 3-turn drill and persists a scored session",
    async () => {
      expect(fs.existsSync(path.join(TARGET, ".know-your-stuff", "dossier.md"))).toBe(true);

      const t: { question: string; answer: string }[] = [];

      const q1 = await startDrill(projectId, "architecture");
      expect(q1.question.length).toBeGreaterThan(0);
      t.push({ question: q1.question, answer: "The system has two apps, wc-api (Spring Boot) and wc-remote, in an Nx monorepo." });

      const q2 = await nextDrillQuestion(projectId, "architecture", t);
      expect(q2.question.length).toBeGreaterThan(0);
      t.push({ question: q2.question, answer: "They communicate over REST; wc-remote is a Module Federation remote embedded in a host shell." });

      const q3 = await nextDrillQuestion(projectId, "architecture", t);
      expect(q3.question.length).toBeGreaterThan(0);
      t.push({ question: q3.question, answer: "Auth is via Auth0; the API persists with JPA/Flyway-managed Postgres." });

      const session = await finishDrill(projectId, "architecture", t);
      expect(session.score).toBeGreaterThanOrEqual(0);
      expect(session.score).toBeLessThanOrEqual(1);
      expect(parseTranscript(session.transcriptJson)).toHaveLength(3);
      expect(session.sectionId).toBe("architecture");
    },
    180_000,
  );
});
