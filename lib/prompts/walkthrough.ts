import { z } from "zod";

export const WalkthroughQuestionSchema = z.object({
  question: z.string(),
  idealAnswer: z.string(),
});
export type WalkthroughQuestion = z.infer<typeof WalkthroughQuestionSchema>;

export function buildWalkthroughQuestionPrompt(args: {
  sectionTitle: string;
  sectionBody: string;
  priorQuestions: string[];
}): string {
  const avoid = args.priorQuestions.length
    ? `\nYou have already asked these questions — ask about a DIFFERENT aspect of the section:\n${args.priorQuestions.map((q) => `- ${q}`).join("\n")}\n`
    : "";
  return `
You are an interview coach. Write ONE comprehension question that tests whether the learner understood the following dossier section about a codebase, plus the ideal answer.

Section: ${args.sectionTitle}

Section content:
${args.sectionBody}
${avoid}
Rules:
- The question must be answerable from the section content above (do not require outside knowledge).
- Favor "why / how / what trade-off" questions an interviewer would ask, not trivia.
- The ideal answer should be 2–5 sentences, grounded in the section content.
`.trim();
}
