import { describe, it, expect } from "vitest";
import { GradeSchema, buildGradePrompt } from "@/lib/grade";

describe("GradeSchema", () => {
  it("accepts a well-formed grade and defaults missedPoints", () => {
    const g = GradeSchema.parse({ score: 0.8, rationale: "good" });
    expect(g.missedPoints).toEqual([]);
  });
  it("rejects out-of-range scores", () => {
    expect(() => GradeSchema.parse({ score: 1.5, rationale: "x" })).toThrow();
  });
});

describe("buildGradePrompt", () => {
  it("includes the question, ideal answer, user answer, and context", () => {
    const p = buildGradePrompt({
      question: "What is X?",
      idealAnswer: "X is Y.",
      userAnswer: "X is Z.",
      context: "Section body about X.",
    });
    expect(p).toContain("What is X?");
    expect(p).toContain("X is Y.");
    expect(p).toContain("X is Z.");
    expect(p).toContain("Section body about X.");
  });
});
