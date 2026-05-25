import { describe, it, expect } from "vitest";
import {
  clampQuizCount,
  filterAndClampQuestions,
  isResearchTextActionable,
} from "@/lib/quiz-helpers";

describe("clampQuizCount", () => {
  it.each([
    [-5, 1],
    [0, 1],
    [1, 1],
    [5, 5],
    [10, 10],
    [11, 10],
    [9999, 10],
  ])("clamps %s -> %s", (input, expected) => {
    expect(clampQuizCount(input)).toBe(expected);
  });

  it("truncates fractional counts", () => {
    expect(clampQuizCount(3.9)).toBe(3);
  });

  it("returns the default when given a non-finite value", () => {
    expect(clampQuizCount(NaN)).toBe(5);
    expect(clampQuizCount(Infinity)).toBe(5);
    expect(clampQuizCount(-Infinity)).toBe(5);
  });
});

describe("filterAndClampQuestions", () => {
  const q = (prompt: string, idealAnswer: string, citations: string[] = []) => ({
    prompt,
    idealAnswer,
    citations,
  });

  it("drops entries with empty prompt", () => {
    const r = filterAndClampQuestions([q("", "A"), q("Q1", "A1")], 5);
    expect(r).toEqual([q("Q1", "A1")]);
  });

  it("drops entries with empty idealAnswer", () => {
    const r = filterAndClampQuestions([q("Q1", ""), q("Q2", "A")], 5);
    expect(r).toEqual([q("Q2", "A")]);
  });

  it("treats whitespace-only fields as empty", () => {
    const r = filterAndClampQuestions([q("   ", "A"), q("Q", "\n\t  ")], 5);
    expect(r).toEqual([]);
  });

  it("caps at the requested count even with more valid entries", () => {
    const valid = [q("a", "A"), q("b", "B"), q("c", "C"), q("d", "D")];
    expect(filterAndClampQuestions(valid, 2)).toEqual([q("a", "A"), q("b", "B")]);
  });

  it("preserves order", () => {
    const valid = [q("first", "1"), q("second", "2")];
    expect(filterAndClampQuestions(valid, 5).map((x) => x.prompt)).toEqual([
      "first",
      "second",
    ]);
  });
});

describe("isResearchTextActionable", () => {
  it.each([null, undefined, "", "  \n  "])("rejects %s", (v) => {
    expect(isResearchTextActionable(v as never)).toBe(false);
  });

  it("rejects text under 80 chars (model probably never wrote the questions)", () => {
    expect(isResearchTextActionable("short")).toBe(false);
    expect(isResearchTextActionable("a".repeat(79))).toBe(false);
  });

  it("accepts text at or above the threshold", () => {
    expect(isResearchTextActionable("a".repeat(80))).toBe(true);
    expect(isResearchTextActionable("a".repeat(500))).toBe(true);
  });
});
