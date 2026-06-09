import { z } from "zod";

export const AnalysisSchema = z.object({
  coverageScore: z.number().min(0).max(1),
  gaps: z.array(z.string()).default([]),
  misconceptions: z.array(z.string()).default([]),
  socraticQuestion: z.string(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const ClosingSchema = z.object({
  summary: z.string(),
  masteredPoints: z.array(z.string()).default([]),
  stillMissing: z.array(z.string()).default([]),
});
export type Closing = z.infer<typeof ClosingSchema>;

export function buildAnalysisPrompt(args: {
  sectionTitle: string;
  sectionBody: string;
  explanation: string;
}): string {
  return `
You are a Socratic tutor. The learner is teaching back the section "${args.sectionTitle}" of their project in their own words. Judge their explanation against the ground-truth section content and find what they don't yet understand.

Ground-truth section content:
${args.sectionBody}

The learner's explanation:
${args.explanation}

Return:
- coverageScore: 0.0–1.0 — how completely/accurately their explanation captures the section.
- gaps: 0–5 important points in the section they did NOT mention.
- misconceptions: 0–5 things they stated that are wrong or imprecise vs the section.
- socraticQuestion: ONE probing question targeting their single biggest gap or misconception — phrased to make them reason it out, not a yes/no.
`.trim();
}

export function buildClosingPrompt(args: {
  sectionTitle: string;
  sectionBody: string;
  explanation: string;
  analysis: { coverageScore: number; gaps: string[]; misconceptions: string[]; socraticQuestion: string };
  response: string;
}): string {
  return `
You are a Socratic tutor closing out a teach-back on "${args.sectionTitle}".

Ground-truth section content:
${args.sectionBody}

The learner's original explanation:
${args.explanation}

Your probing question:
${args.analysis.socraticQuestion}

The learner's answer to it:
${args.response}

Give a brief closing assessment:
- summary: 2–4 sentences on how well they now understand this section, accounting for both their explanation and their answer to your question.
- masteredPoints: 0–5 things they clearly understand.
- stillMissing: 0–5 things they should review (empty if they covered everything).
`.trim();
}
