import { describe, it, expect } from "vitest";
import { DEFAULT_EASE, ratingToQuality, scheduleCard, isDue } from "@/lib/srs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { beforeEach, afterEach } from "vitest";
import { _resetDbForTests } from "@/lib/db";
import { addProjectRaw } from "@/lib/projects";
import { insertCards, listCards, listDueCards, updateCardSchedule } from "@/lib/srs";

const DAY = 86_400_000;

describe("ratingToQuality", () => {
  it("maps the four ratings", () => {
    expect(ratingToQuality("again")).toBe(2);
    expect(ratingToQuality("hard")).toBe(3);
    expect(ratingToQuality("good")).toBe(4);
    expect(ratingToQuality("easy")).toBe(5);
  });
});

describe("scheduleCard — successful reviews advance the interval", () => {
  it("fresh good: interval 1, reps 1, ease unchanged at q4, due in 1 day", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 0, reps: 0 }, 4, 1000);
    expect(r.intervalDays).toBe(1);
    expect(r.reps).toBe(1);
    expect(r.ease).toBeCloseTo(2.5, 5);
    expect(r.dueAt).toBe(1000 + 1 * DAY);
  });
  it("second good: interval 6, reps 2", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 1, reps: 1 }, 4, 0);
    expect(r.intervalDays).toBe(6);
    expect(r.reps).toBe(2);
    expect(r.dueAt).toBe(6 * DAY);
  });
  it("third good: round(interval*ease), reps 3", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 6, reps: 2 }, 4, 0);
    expect(r.intervalDays).toBe(15); // round(6 * 2.5)
    expect(r.reps).toBe(3);
    expect(r.dueAt).toBe(15 * DAY);
  });
});

describe("scheduleCard — ease updates", () => {
  it("easy (q5) raises ease by 0.1", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 0, reps: 0 }, 5, 0);
    expect(r.ease).toBeCloseTo(2.6, 5);
  });
  it("hard (q3) lowers ease by 0.14 but still advances interval", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 6, reps: 2 }, 3, 0);
    expect(r.ease).toBeCloseTo(2.36, 5);
    expect(r.intervalDays).toBe(15);
    expect(r.reps).toBe(3);
  });
});

describe("scheduleCard — lapse (q<3)", () => {
  it("resets reps to 0 and interval to 1, drops ease", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 15, reps: 3 }, 2, 0);
    expect(r.reps).toBe(0);
    expect(r.intervalDays).toBe(1);
    expect(r.ease).toBeCloseTo(2.18, 5); // 2.5 - 0.32
    expect(r.dueAt).toBe(1 * DAY);
  });
  it("clamps ease at the 1.3 floor", () => {
    const r = scheduleCard({ ease: 1.3, intervalDays: 1, reps: 0 }, 2, 0);
    expect(r.ease).toBe(1.3);
  });
});

describe("isDue", () => {
  it("true when dueAt <= now", () => {
    expect(isDue({ dueAt: 100 }, 100)).toBe(true);
    expect(isDue({ dueAt: 99 }, 100)).toBe(true);
    expect(isDue({ dueAt: 101 }, 100)).toBe(false);
  });
});

describe("DEFAULT_EASE", () => {
  it("is 2.5", () => expect(DEFAULT_EASE).toBe(2.5));
});

describe("flashcard storage", () => {
  let dbPath: string; let projectId: string; let projectRoot: string;
  beforeEach(() => {
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kys-srs-")), "db.sqlite");
    process.env.KYS_DB_PATH = dbPath; _resetDbForTests();
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kys-srs-proj-"));
    projectId = addProjectRaw({ name: "p", rootPath: projectRoot }).id;
  });
  afterEach(() => {
    _resetDbForTests(); delete process.env.KYS_DB_PATH;
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("inserts cards with default schedule (immediately due) and lists them", () => {
    const now = 1_000_000;
    const cards = insertCards({
      projectId, sectionId: "architecture",
      cards: [{ front: "Q1", back: "A1" }, { front: "Q2", back: "A2" }],
      now,
    });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ front: "Q1", back: "A1", ease: 2.5, intervalDays: 0, reps: 0, dueAt: now });
    expect(listCards(projectId)).toHaveLength(2);
  });

  it("listDueCards returns only cards due at `now`, oldest-due first", () => {
    insertCards({ projectId, sectionId: "a", cards: [{ front: "due", back: "x" }], now: 100 });
    insertCards({ projectId, sectionId: "b", cards: [{ front: "later", back: "y" }], now: 100 });
    // push the second card into the future
    const all = listCards(projectId);
    const later = all.find((c) => c.front === "later")!;
    updateCardSchedule(later.id, { ease: 2.5, intervalDays: 6, reps: 2, dueAt: 999_999_999_999 });
    const due = listDueCards(projectId, 200);
    expect(due).toHaveLength(1);
    expect(due[0].front).toBe("due");
  });

  it("updateCardSchedule persists the new schedule", () => {
    insertCards({ projectId, sectionId: "a", cards: [{ front: "c", back: "d" }], now: 100 });
    const card = listCards(projectId)[0];
    updateCardSchedule(card.id, { ease: 2.6, intervalDays: 6, reps: 2, dueAt: 5000 });
    const updated = listCards(projectId)[0];
    expect(updated).toMatchObject({ ease: 2.6, intervalDays: 6, reps: 2, dueAt: 5000 });
  });
});
