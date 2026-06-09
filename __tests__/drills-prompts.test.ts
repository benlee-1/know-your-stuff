import { describe, it, expect } from "vitest";
import {
  DrillQuestionSchema,
  DrillScoreSchema,
  buildOpeningPrompt,
  buildFollowupPrompt,
  buildScorePrompt,
} from "@/lib/prompts/drills";

const section = { sectionTitle: "High-level Architecture", sectionBody: "Two apps: wc-api and wc-remote." };

describe("DrillQuestionSchema", () => {
  it("requires question", () => {
    expect(() => DrillQuestionSchema.parse({})).toThrow();
    expect(DrillQuestionSchema.parse({ question: "q" })).toEqual({ question: "q" });
  });
});

describe("DrillScoreSchema", () => {
  it("validates score range and defaults arrays", () => {
    const s = DrillScoreSchema.parse({ score: 0.7 });
    expect(s.strengths).toEqual([]);
    expect(s.weaknesses).toEqual([]);
    expect(() => DrillScoreSchema.parse({ score: 2 })).toThrow();
  });
});

describe("buildOpeningPrompt", () => {
  it("includes section title and body", () => {
    const p = buildOpeningPrompt(section);
    expect(p).toContain("High-level Architecture");
    expect(p).toContain("Two apps");
  });
});

describe("buildFollowupPrompt", () => {
  it("includes the transcript Q&A so the probe builds on it", () => {
    const p = buildFollowupPrompt({
      ...section,
      transcript: [{ question: "What are the apps?", answer: "wc-api and wc-remote" }],
    });
    expect(p).toContain("What are the apps?");
    expect(p).toContain("wc-api and wc-remote");
  });
});

describe("buildScorePrompt", () => {
  it("includes section and the full transcript", () => {
    const p = buildScorePrompt({
      ...section,
      transcript: [{ question: "q1", answer: "a1" }, { question: "q2", answer: "a2" }],
    });
    expect(p).toContain("High-level Architecture");
    expect(p).toContain("a1");
    expect(p).toContain("a2");
  });
});
