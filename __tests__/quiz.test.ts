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
  listAllAttemptsForProject,
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

  it("listAllAttemptsForProject returns joined rows newest-first", () => {
    const p = addProjectRaw({ name: "acme", rootPath: tmp });
    const [tech] = insertQuizItems({
      projectId: p.id,
      focus: "technical",
      questions: [{ prompt: "Tech Q", idealAnswer: "TA", citations: ["a.ts"] }],
    });
    const [biz] = insertQuizItems({
      projectId: p.id,
      focus: "business",
      questions: [{ prompt: "Biz Q", idealAnswer: "BA", citations: [] }],
    });

    insertAttempt({
      quizItemId: tech.id,
      userAnswer: "first",
      score: 0.5,
      rationale: "ok",
      missedPoints: ["x"],
    });
    // tiny gap to ensure ordering distinct (Date.now ms granularity)
    const t0 = Date.now();
    while (Date.now() === t0) {
      /* spin */
    }
    const a2 = insertAttempt({
      quizItemId: biz.id,
      userAnswer: "second",
      score: 0.9,
      rationale: "great",
      missedPoints: [],
    });

    const rows = listAllAttemptsForProject(p.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(a2.id);
    expect(rows[0].prompt).toBe("Biz Q");
    expect(rows[0].focus).toBe("business");
    expect(rows[0].citationsJson).toBe("[]");
    expect(rows[1].prompt).toBe("Tech Q");
    expect(rows[1].focus).toBe("technical");
  });

  it("listAllAttemptsForProject returns [] when no attempts exist", () => {
    const p = addProjectRaw({ name: "empty", rootPath: tmp });
    insertQuizItems({
      projectId: p.id,
      focus: "technical",
      questions: [{ prompt: "Q", idealAnswer: "A", citations: [] }],
    });
    expect(listAllAttemptsForProject(p.id)).toEqual([]);
  });

  it("listAllAttemptsForProject does not leak attempts from other projects", () => {
    const dirA = path.join(tmp, "a");
    const dirB = path.join(tmp, "b");
    fs.mkdirSync(dirA);
    fs.mkdirSync(dirB);
    const a = addProjectRaw({ name: "a", rootPath: dirA });
    const b = addProjectRaw({ name: "b", rootPath: dirB });
    const [itemA] = insertQuizItems({
      projectId: a.id,
      focus: "technical",
      questions: [{ prompt: "QA", idealAnswer: "AA", citations: [] }],
    });
    const [itemB] = insertQuizItems({
      projectId: b.id,
      focus: "business",
      questions: [{ prompt: "QB", idealAnswer: "AB", citations: [] }],
    });
    insertAttempt({
      quizItemId: itemA.id,
      userAnswer: "ans-a",
      score: 0.3,
      rationale: "",
      missedPoints: [],
    });
    insertAttempt({
      quizItemId: itemB.id,
      userAnswer: "ans-b",
      score: 0.7,
      rationale: "",
      missedPoints: [],
    });

    const rowsA = listAllAttemptsForProject(a.id);
    const rowsB = listAllAttemptsForProject(b.id);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].userAnswer).toBe("ans-a");
    expect(rowsA[0].projectId).toBe(a.id);
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0].userAnswer).toBe("ans-b");
    expect(rowsB[0].projectId).toBe(b.id);
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
