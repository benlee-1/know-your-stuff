import { z } from "zod";

export const DrillQuestionSchema = z.object({ question: z.string() });
export type DrillQuestion = z.infer<typeof DrillQuestionSchema>;

export const DrillScoreSchema = z.object({
  score: z.number().min(0).max(1),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
});
export type DrillScore = z.infer<typeof DrillScoreSchema>;

export interface DrillTurnView {
  question: string;
  answer: string;
}

function renderTranscript(transcript: DrillTurnView[]): string {
  return transcript
    .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`)
    .join("\n\n");
}

export function buildOpeningPrompt(args: { sectionTitle: string; sectionBody: string }): string {
  return `
You are a senior interviewer running a mock interview about the candidate's project. The topic is the section "${args.sectionTitle}".

Section content (ground truth — base your question on this):
${args.sectionBody}

Ask ONE strong opening interview question on this topic — open-ended, the kind that invites the candidate to explain a decision, trade-off, or how something works. Not trivia. Return only the question.
`.trim();
}

export function buildFollowupPrompt(args: {
  sectionTitle: string;
  sectionBody: string;
  transcript: DrillTurnView[];
}): string {
  return `
You are a senior interviewer mid-interview on the topic "${args.sectionTitle}".

Section content (ground truth):
${args.sectionBody}

Conversation so far:
${renderTranscript(args.transcript)}

Ask ONE follow-up question that builds on the candidate's most recent answer — probe a gap, push for depth, or challenge an assumption. If the last answer was strong, pivot to a related sub-aspect of the section. Do NOT repeat an earlier question. Return only the question.
`.trim();
}

export function buildScorePrompt(args: {
  sectionTitle: string;
  sectionBody: string;
  transcript: DrillTurnView[];
}): string {
  return `
You are evaluating a candidate's mock interview on the topic "${args.sectionTitle}".

Section content (ground truth to judge correctness against):
${args.sectionBody}

Full interview:
${renderTranscript(args.transcript)}

Score the candidate's performance across the whole interview:
- score: 0.0–1.0 (depth, correctness against the section, and clarity of communication).
- strengths: 0–5 specific things they did well.
- weaknesses: 0–5 specific gaps or things to improve.
`.trim();
}
