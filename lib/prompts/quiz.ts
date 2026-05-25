import { z } from "zod";

export interface QuizGenerationContext {
  projectName: string;
  focus: "business" | "technical";
  count: number;
  briefMarkdown: string;
}

export const QuizQuestionSchema = z.object({
  prompt: z.string().min(1),
  idealAnswer: z.string().min(1),
  citations: z.array(z.string()).default([]),
});
export const QuizBatchSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(1),
});
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export function buildQuizGenerationPrompt(ctx: QuizGenerationContext): string {
  const focusGuidance =
    ctx.focus === "business"
      ? `Focus on **business** angles: product framing, target users, problem, value prop, lingo/jargon, positioning. Pull from the brief and top-level docs (read_file as needed). Cite the docs you used.`
      : `Focus on **technical** angles: architecture, key design decisions, data flow, important code paths, trade-offs, failure modes. Use grep + read_file to ground each question in the actual codebase. Cite specific file paths.`;

  return `
You are generating ${ctx.count} interview-style questions about the project "${ctx.projectName}" for the user to self-test on.

${focusGuidance}

Quality bar for questions:
- Open-ended (not yes/no, not trivia).
- Grounded — an "ideal answer" should be derivable from the brief and/or codebase.
- Vary difficulty (mix of warm-up and harder follow-ups).
- Avoid duplicates.

Use tools to inspect the project before writing the questions. Then return ONLY a JSON object matching this exact schema:

{
  "questions": [
    {
      "prompt": "string — the question",
      "idealAnswer": "string — 2–4 sentence model answer the user should aim for",
      "citations": ["relative/file/path.ts", "..."]
    }
  ]
}

Return only JSON. No prose, no markdown fences, no explanation.

Business brief (may be empty):
${ctx.briefMarkdown.trim() || "(none)"}
`.trim();
}

export function buildQuizGradingPrompt(args: {
  prompt: string;
  idealAnswer: string;
  userAnswer: string;
  citations: string[];
}): string {
  return `
Grade the user's answer to an interview-style question.

Question: ${args.prompt}

Ideal answer (model): ${args.idealAnswer}

Reference citations: ${args.citations.length ? args.citations.join(", ") : "(none)"}

User's answer:
"""
${args.userAnswer}
"""

Return ONLY a JSON object with this exact shape:

{
  "score": <number 0..1>,
  "rationale": "<2–4 sentences explaining the score>",
  "missedPoints": ["short bullet", "..."]
}

Be honest. 1.0 means complete and correct. 0.5 means partial. 0 means missed the question. Use tools (read_file, grep) to verify specific claims if needed.

Return only JSON. No prose, no markdown fences.
`.trim();
}

export const QuizGradeSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string(),
  missedPoints: z.array(z.string()).default([]),
});
export type QuizGrade = z.infer<typeof QuizGradeSchema>;
