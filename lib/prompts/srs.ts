import { z } from "zod";

export const CardBatchSchema = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string() })).default([]),
});
export type CardBatch = z.infer<typeof CardBatchSchema>;

export function buildCardGenPrompt(args: {
  sectionTitle: string;
  sectionBody: string;
  count: number;
}): string {
  return `
You are creating spaced-repetition flashcards from a section of a project dossier, to help the author remember it for interviews. The section is "${args.sectionTitle}".

Section content (ground truth — every card must be answerable from this):
${args.sectionBody}

Produce up to ${args.count} flashcards covering the most interview-worthy facts, decisions, and trade-offs in this section.
- front: a single clear question or prompt (e.g. "Why was X chosen over Y?", "What does Z do?").
- back: the concise, correct answer grounded in the section (1–3 sentences).
Favor decisions, trade-offs, and non-obvious specifics over trivia. Do not duplicate cards.
`.trim();
}
