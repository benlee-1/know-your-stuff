import type { QuizQuestion } from "./prompts/quiz";

/** Clamp the requested count into [1, 10]. */
export function clampQuizCount(count: number): number {
  if (!Number.isFinite(count)) return 5;
  return Math.max(1, Math.min(10, Math.trunc(count)));
}

/**
 * Drop questions whose prompt or idealAnswer is empty after trim, then cap at
 * the requested count. Returned in original order.
 */
export function filterAndClampQuestions(
  questions: readonly QuizQuestion[],
  count: number,
): QuizQuestion[] {
  return questions
    .filter((q) => q.prompt.trim().length > 0 && q.idealAnswer.trim().length > 0)
    .slice(0, count);
}

/**
 * Pre-condition check for the Phase-2 format step: did Phase 1 actually
 * produce enough written text to convert? An empty / very-short result
 * usually means the model burned its step budget on tool calls without
 * ever emitting the final list.
 */
export function isResearchTextActionable(text: string | undefined | null): boolean {
  return typeof text === "string" && text.trim().length >= 80;
}
