import { z } from "zod";

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  createdAt: z.number(),
  lastOpenedAt: z.number(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ChatModeSchema = z.enum(["business", "technical", "quiz"]);
export type ChatMode = z.infer<typeof ChatModeSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  mode: ChatModeSchema,
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  toolCallsJson: z.string().nullable(),
  createdAt: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const QuizItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  focus: z.enum(["business", "technical"]),
  prompt: z.string(),
  idealAnswer: z.string(),
  citationsJson: z.string(),
  createdAt: z.number(),
});
export type QuizItem = z.infer<typeof QuizItemSchema>;

export const QuizAttemptSchema = z.object({
  id: z.string(),
  quizItemId: z.string(),
  userAnswer: z.string(),
  score: z.number().min(0).max(1),
  rationale: z.string(),
  missedPointsJson: z.string(),
  createdAt: z.number(),
});
export type QuizAttempt = z.infer<typeof QuizAttemptSchema>;

export const WalkthroughProgressSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sectionId: z.string(),
  passed: z.boolean(),
  bestScore: z.number().min(0).max(1),
  attempts: z.number().int().min(0),
  updatedAt: z.number(),
});
export type WalkthroughProgress = z.infer<typeof WalkthroughProgressSchema>;

export const DrillSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sectionId: z.string(),
  transcriptJson: z.string(),
  score: z.number().min(0).max(1),
  strengthsJson: z.string(),
  weaknessesJson: z.string(),
  createdAt: z.number(),
});
export type DrillSession = z.infer<typeof DrillSessionSchema>;

export const TeachbackSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sectionId: z.string(),
  explanation: z.string(),
  coverageScore: z.number().min(0).max(1),
  gapsJson: z.string(),
  socraticQuestion: z.string(),
  response: z.string(),
  summary: z.string(),
  stillMissingJson: z.string(),
  masteredPointsJson: z.string(),
  createdAt: z.number(),
});
export type TeachbackSession = z.infer<typeof TeachbackSessionSchema>;

export const FlashcardSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sectionId: z.string(),
  front: z.string(),
  back: z.string(),
  ease: z.number(),
  intervalDays: z.number(),
  reps: z.number().int(),
  dueAt: z.number(),
  createdAt: z.number(),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;
