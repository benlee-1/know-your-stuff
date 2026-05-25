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
