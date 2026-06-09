import { describe, it, expect } from "vitest";
import { GradeSchema, buildGradePrompt } from "@/lib/grade";
import {
  WalkthroughQuestionSchema,
  buildWalkthroughQuestionPrompt,
} from "@/lib/prompts/walkthrough";

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

describe("WalkthroughQuestionSchema", () => {
  it("requires question and idealAnswer", () => {
    expect(() => WalkthroughQuestionSchema.parse({ question: "q" })).toThrow();
    expect(WalkthroughQuestionSchema.parse({ question: "q", idealAnswer: "a" })).toEqual({
      question: "q",
      idealAnswer: "a",
    });
  });
});

describe("buildWalkthroughQuestionPrompt", () => {
  const base = {
    sectionTitle: "High-level Architecture",
    sectionBody: "Two apps under apps/: wc-api and wc-remote.",
    priorQuestions: [] as string[],
  };
  it("includes the section title and body", () => {
    const p = buildWalkthroughQuestionPrompt(base);
    expect(p).toContain("High-level Architecture");
    expect(p).toContain("Two apps under apps/");
  });
  it("instructs avoiding prior questions when present", () => {
    const p = buildWalkthroughQuestionPrompt({ ...base, priorQuestions: ["What are the two apps?"] });
    expect(p).toContain("What are the two apps?");
    expect(p.toLowerCase()).toContain("different");
  });
});
