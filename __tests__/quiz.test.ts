import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import {
  insertQuizItems,
  listQuizItems,
  insertAttempt,
  listAttemptsForItem,
  getQuizItem,
} from "@/lib/quiz";
import { addProjectRaw } from "@/lib/projects";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kys-quiz-"));
  process.env.KYS_DB_PATH = path.join(tmp, "test.db");
  _resetDbForTests();
});

afterEach(() => {
  _resetDbForTests();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("quiz storage", () => {
  it("inserts and lists items by focus", () => {
    const p = addProjectRaw({ name: "acme", rootPath: tmp });
    insertQuizItems({
      projectId: p.id,
      focus: "technical",
      questions: [
        { prompt: "Q1", idealAnswer: "A1", citations: ["a.ts"] },
        { prompt: "Q2", idealAnswer: "A2", citations: [] },
      ],
    });
    insertQuizItems({
      projectId: p.id,
      focus: "business",
      questions: [{ prompt: "QB", idealAnswer: "AB", citations: [] }],
    });

    expect(listQuizItems(p.id, "technical")).toHaveLength(2);
    expect(listQuizItems(p.id, "business")).toHaveLength(1);
    expect(listQuizItems(p.id)).toHaveLength(3);
  });

  it("attempts persist and round-trip missedPoints", () => {
    const p = addProjectRaw({ name: "acme", rootPath: tmp });
    const [item] = insertQuizItems({
      projectId: p.id,
      focus: "technical",
      questions: [{ prompt: "Q", idealAnswer: "A", citations: [] }],
    });
    insertAttempt({
      quizItemId: item.id,
      userAnswer: "my try",
      score: 0.7,
      rationale: "close",
      missedPoints: ["forgot foo", "forgot bar"],
    });
    const attempts = listAttemptsForItem(item.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].score).toBe(0.7);
    expect(JSON.parse(attempts[0].missedPointsJson)).toEqual(["forgot foo", "forgot bar"]);
  });

  it("cascades attempts when item is deleted via project cascade", async () => {
    const p = addProjectRaw({ name: "acme", rootPath: tmp });
    const [item] = insertQuizItems({
      projectId: p.id,
      focus: "technical",
      questions: [{ prompt: "Q", idealAnswer: "A", citations: [] }],
    });
    insertAttempt({
      quizItemId: item.id,
      userAnswer: "x",
      score: 1,
      rationale: "good",
      missedPoints: [],
    });
    // delete project
    const { deleteProjectRaw } = await import("@/lib/projects");
    deleteProjectRaw(p.id);
    expect(getQuizItem(item.id)).toBeNull();
    expect(listAttemptsForItem(item.id)).toHaveLength(0);
  });
});
