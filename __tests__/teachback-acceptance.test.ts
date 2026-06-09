import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import { addProjectRaw } from "@/lib/projects";
import { analyzeExplanation, submitSocraticResponse } from "@/app/actions/teachback";

const LIVE = process.env.KYS_LIVE === "1";
const TARGET = process.env.KYS_TARGET ?? path.join(os.homedir(), "code", "weekly-commit-module");

let dbDir: string;
let projectId: string;

beforeAll(() => {
  if (!LIVE) return;
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "kys-tb-live-"));
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

describe.skipIf(!LIVE)("teachback live smoke (KYS_LIVE=1)", () => {
  it(
    "analyzes an explanation and closes out a persisted session",
    async () => {
      expect(fs.existsSync(path.join(TARGET, ".know-your-stuff", "dossier.md"))).toBe(true);

      const explanation =
        "The architecture is an Nx monorepo with two apps: wc-api, a Spring Boot REST API, and wc-remote, a Module Federation remote embedded in a host shell. They talk over REST.";
      const analysis = await analyzeExplanation(projectId, "architecture", explanation);
      expect(analysis.coverageScore).toBeGreaterThanOrEqual(0);
      expect(analysis.coverageScore).toBeLessThanOrEqual(1);
      expect(analysis.socraticQuestion.length).toBeGreaterThan(0);

      const session = await submitSocraticResponse({
        projectId,
        sectionId: "architecture",
        explanation,
        analysis,
        response: "Auth is handled via Auth0; the API persists to Postgres with Flyway-managed migrations and JPA entities.",
      });
      expect(session.summary.length).toBeGreaterThan(0);
      expect(session.sectionId).toBe("architecture");
      expect(session.coverageScore).toBe(analysis.coverageScore);
    },
    180_000,
  );
});
