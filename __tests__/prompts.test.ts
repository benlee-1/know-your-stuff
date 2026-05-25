import { describe, it, expect } from "vitest";
import { buildBusinessSystemPrompt } from "@/lib/prompts/business";
import { buildTechnicalSystemPrompt } from "@/lib/prompts/technical";
import {
  buildQuizGenerationPrompt,
  buildQuizGradingPrompt,
  QuizBatchSchema,
  QuizGradeSchema,
} from "@/lib/prompts/quiz";

describe("prompts", () => {
  it("business prompt injects project name and brief", () => {
    const p = buildBusinessSystemPrompt({ projectName: "acme", briefMarkdown: "Sells widgets." });
    expect(p).toContain("acme");
    expect(p).toContain("Sells widgets.");
  });

  it("business prompt handles missing brief gracefully", () => {
    const p = buildBusinessSystemPrompt({ projectName: "acme", briefMarkdown: "  " });
    expect(p).toContain("No brief yet");
  });

  it("technical prompt instructs file-path citations", () => {
    const p = buildTechnicalSystemPrompt({ projectName: "acme", briefMarkdown: "" });
    expect(p.toLowerCase()).toContain("cite file paths");
  });

  it("quiz generation prompt differs by focus", () => {
    const a = buildQuizGenerationPrompt({
      projectName: "acme",
      focus: "business",
      count: 3,
      briefMarkdown: "x",
    });
    const b = buildQuizGenerationPrompt({
      projectName: "acme",
      focus: "technical",
      count: 3,
      briefMarkdown: "x",
    });
    expect(a).toContain("business");
    expect(b).toContain("technical");
    expect(a).not.toBe(b);
  });

  it("quiz batch schema accepts a well-formed batch", () => {
    const r = QuizBatchSchema.safeParse({
      questions: [
        { prompt: "Q1", idealAnswer: "A1", citations: ["README.md"] },
        { prompt: "Q2", idealAnswer: "A2" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("quiz batch schema accepts empty list (empties are surfaced by the action layer with a diagnostic error)", () => {
    const r = QuizBatchSchema.safeParse({ questions: [] });
    expect(r.success).toBe(true);
  });

  it("quiz grade schema validates", () => {
    const r = QuizGradeSchema.safeParse({
      score: 0.7,
      rationale: "ok",
      missedPoints: ["x"],
    });
    expect(r.success).toBe(true);
  });

  it("grading prompt embeds user answer", () => {
    const p = buildQuizGradingPrompt({
      prompt: "Q",
      idealAnswer: "A",
      userAnswer: "my answer",
      citations: ["a.ts"],
    });
    expect(p).toContain("my answer");
    expect(p).toContain("a.ts");
  });
});
