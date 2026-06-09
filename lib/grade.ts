import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./ai";

export const GradeSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string(),
  missedPoints: z.array(z.string()).default([]),
});
export type Grade = z.infer<typeof GradeSchema>;

export function buildGradePrompt(args: {
  question: string;
  idealAnswer: string;
  userAnswer: string;
  context: string;
}): string {
  return `
You are grading a learner's free-text answer to a comprehension question. Score how well their answer matches the ideal answer, judged against the source context. Be specific and fair.

Question:
${args.question}

Ideal answer:
${args.idealAnswer}

Source context (the material the question is drawn from):
${args.context}

Learner's answer:
${args.userAnswer}

Return:
- score: 0.0–1.0 (1.0 = fully correct and complete).
- rationale: 2–4 sentences naming what was right and what was hand-wavy or wrong.
- missedPoints: 0–5 specific points the ideal answer covers that the learner missed.
`.trim();
}

/**
 * Grade a free-text answer with a single tools-free `generateObject` call. No
 * codebase tools — the `context` (a dossier section) is self-contained, so the
 * empty-text/tool-loop failure mode cannot occur here.
 */
export async function gradeFreeTextAnswer(args: {
  question: string;
  idealAnswer: string;
  userAnswer: string;
  context: string;
}): Promise<Grade> {
  const { object } = await generateObject({
    model: getModel(),
    schema: GradeSchema,
    prompt: buildGradePrompt(args),
  });
  return object;
}
