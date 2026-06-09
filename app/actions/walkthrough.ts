"use server";

import { generateObject } from "ai";
import { getModel } from "@/lib/ai";
import { getProjectRaw } from "@/lib/projects";
import { loadDossierSync } from "@/lib/dossier-storage";
import { DOSSIER_SECTIONS, parseDossierSections } from "@/lib/dossier";
import {
  WalkthroughQuestionSchema,
  buildWalkthroughQuestionPrompt,
} from "@/lib/prompts/walkthrough";
import { gradeFreeTextAnswer, type Grade } from "@/lib/grade";
import {
  gateDecision,
  mergeProgress,
  computeCurrentSectionId,
  nextAttemptNumber,
  getProgress,
  upsertProgress,
  type GateOutcome,
} from "@/lib/walkthrough";
import type { WalkthroughProgress } from "@/lib/schema";

export interface WalkthroughSectionView {
  id: string;
  title: string;
  body: string; // "" when missing/empty in the dossier
}

export interface WalkthroughState {
  hasDossier: boolean;
  sections: WalkthroughSectionView[];
  progress: WalkthroughProgress[];
  currentSectionId: string | null;
  missingSectionIds: string[];
}

function sectionsFromDossier(markdown: string): WalkthroughSectionView[] {
  const parsed = parseDossierSections(markdown);
  const byTitle = new Map(parsed.map((s) => [s.title, s.body]));
  return DOSSIER_SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    body: (byTitle.get(s.title) ?? "").trim(),
  }));
}

export async function loadWalkthroughState(
  projectId: string,
): Promise<WalkthroughState> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const markdown = loadDossierSync(p.rootPath);
  const hasDossier = markdown.trim().length > 0;
  const sections = hasDossier ? sectionsFromDossier(markdown) : [];
  const progress = getProgress(projectId);
  return {
    hasDossier,
    sections,
    progress,
    currentSectionId: hasDossier
      ? computeCurrentSectionId(progress, sections.filter((s) => s.body.length === 0).map((s) => s.id))
      : null,
    missingSectionIds: sections.filter((s) => s.body.length === 0).map((s) => s.id),
  };
}

function sectionBodyOrThrow(
  projectRoot: string,
  sectionId: string,
): { title: string; body: string } {
  const section = DOSSIER_SECTIONS.find((s) => s.id === sectionId);
  if (!section) throw new Error(`Unknown section: ${sectionId}`);
  const view = sectionsFromDossier(loadDossierSync(projectRoot)).find(
    (s) => s.id === sectionId,
  )!;
  if (!view.body)
    throw new Error(
      `Section "${section.title}" is empty in the dossier — regenerate it first.`,
    );
  return { title: section.title, body: view.body };
}

export async function generateSectionQuestion(
  projectId: string,
  sectionId: string,
  priorQuestions: string[] = [],
): Promise<{ question: string; idealAnswer: string }> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const { title, body } = sectionBodyOrThrow(p.rootPath, sectionId);
  const { object } = await generateObject({
    model: getModel(),
    schema: WalkthroughQuestionSchema,
    prompt: buildWalkthroughQuestionPrompt({
      sectionTitle: title,
      sectionBody: body,
      priorQuestions,
    }),
  });
  return object;
}

export async function submitWalkthroughAnswer(args: {
  projectId: string;
  sectionId: string;
  question: string;
  idealAnswer: string;
  userAnswer: string;
}): Promise<{ grade: Grade; decision: GateOutcome }> {
  const p = getProjectRaw(args.projectId);
  if (!p) throw new Error("Project not found");
  const trimmed = args.userAnswer.trim();
  if (!trimmed) throw new Error("Answer cannot be empty.");
  const { title, body } = sectionBodyOrThrow(p.rootPath, args.sectionId);

  const prior = getProgress(args.projectId).find((r) => r.sectionId === args.sectionId) ?? null;
  const attemptNumber = nextAttemptNumber(prior);

  const grade = await gradeFreeTextAnswer({
    question: args.question,
    idealAnswer: args.idealAnswer,
    userAnswer: trimmed,
    context: `Section: ${title}\n\n${body}`,
  });
  const decision = gateDecision(grade.score, attemptNumber);
  const merged = mergeProgress(
    prior ? { passed: prior.passed, bestScore: prior.bestScore, attempts: prior.attempts } : null,
    grade.score,
    decision.passed,
  );
  upsertProgress(args.projectId, args.sectionId, merged);
  return { grade, decision };
}
