import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import { addProjectRaw } from "@/lib/projects";
import { generateCards, getDueCards, rateCard } from "@/app/actions/srs";

const LIVE = process.env.KYS_LIVE === "1";
const TARGET = process.env.KYS_TARGET ?? path.join(os.homedir(), "code", "weekly-commit-module");

let dbDir: string;
let projectId: string;

beforeAll(() => {
  if (!LIVE) return;
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "kys-srs-live-"));
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

describe.skipIf(!LIVE)("srs live smoke (KYS_LIVE=1)", () => {
  it(
    "generates cards (immediately due) and a 'good' rating schedules the card forward",
    async () => {
      expect(fs.existsSync(path.join(TARGET, ".know-your-stuff", "dossier.md"))).toBe(true);

      const cards = await generateCards(projectId, "architecture", 5);
      expect(cards.length).toBeGreaterThanOrEqual(1);
      expect(cards[0].front.length).toBeGreaterThan(0);
      expect(cards[0].back.length).toBeGreaterThan(0);

      const due = await getDueCards(projectId);
      expect(due.length).toBe(cards.length); // all newly-generated cards are due now

      const before = due[0];
      const after = await rateCard(projectId, before.id, "good");
      expect(after.reps).toBe(before.reps + 1);
      expect(after.dueAt).toBeGreaterThan(before.dueAt); // scheduled into the future

      const dueAfter = await getDueCards(projectId);
      expect(dueAfter.length).toBe(cards.length - 1); // the rated card is no longer due
    },
    180_000,
  );
});
