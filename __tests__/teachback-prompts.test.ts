import { describe, it, expect } from "vitest";
import {
  AnalysisSchema, ClosingSchema,
  buildAnalysisPrompt, buildClosingPrompt,
} from "@/lib/prompts/teachback";

const section = { sectionTitle: "High-level Architecture", sectionBody: "Two apps: wc-api and wc-remote." };

describe("AnalysisSchema", () => {
  it("validates and defaults arrays", () => {
    const a = AnalysisSchema.parse({ coverageScore: 0.5, socraticQuestion: "q" });
    expect(a.gaps).toEqual([]); expect(a.misconceptions).toEqual([]);
    expect(() => AnalysisSchema.parse({ coverageScore: 2, socraticQuestion: "q" })).toThrow();
  });
});
describe("ClosingSchema", () => {
  it("validates and defaults arrays", () => {
    const c = ClosingSchema.parse({ summary: "s" });
    expect(c.masteredPoints).toEqual([]); expect(c.stillMissing).toEqual([]);
  });
});
describe("buildAnalysisPrompt", () => {
  it("includes section and the user's explanation", () => {
    const p = buildAnalysisPrompt({ ...section, explanation: "It has two apps." });
    expect(p).toContain("High-level Architecture");
    expect(p).toContain("Two apps");
    expect(p).toContain("It has two apps.");
  });
});
describe("buildClosingPrompt", () => {
  it("includes explanation, the socratic question, and the response", () => {
    const p = buildClosingPrompt({
      ...section, explanation: "exp",
      analysis: { coverageScore: 0.5, gaps: ["auth"], misconceptions: [], socraticQuestion: "how does auth work?" },
      response: "via auth0",
    });
    expect(p).toContain("how does auth work?");
    expect(p).toContain("via auth0");
    expect(p).toContain("exp");
  });
});
