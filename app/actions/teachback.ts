"use server";

import { generateObject } from "ai";
import { getModel } from "@/lib/ai";
import { getProjectRaw } from "@/lib/projects";
import { loadDossierSync } from "@/lib/dossier-storage";
import { DOSSIER_SECTIONS, parseDossierSections } from "@/lib/dossier";
import {
  AnalysisSchema,
  ClosingSchema,
  buildAnalysisPrompt,
  buildClosingPrompt,
  type Analysis,
} from "@/lib/prompts/teachback";
import { insertTeachbackSession, listTeachbackSessions } from "@/lib/teachback";
import type { TeachbackSession } from "@/lib/schema";

function sectionBodyOrThrow(
  projectRoot: string,
  sectionId: string,
): { title: string; body: string } {
  const section = DOSSIER_SECTIONS.find((s) => s.id === sectionId);
  if (!section) throw new Error(`Unknown section: ${sectionId}`);
  const byTitle = new Map(
    parseDossierSections(loadDossierSync(projectRoot)).map((s) => [s.title, s.body]),
  );
  const body = (byTitle.get(section.title) ?? "").trim();
  if (!body)
    throw new Error(
      `Section "${section.title}" is empty in the dossier — regenerate it first.`,
    );
  return { title: section.title, body };
}

export interface TeachbackSectionView {
  id: string;
  title: string;
  hasBody: boolean;
}
export interface TeachbackState {
  hasDossier: boolean;
  sections: TeachbackSectionView[];
  past: TeachbackSession[];
}

export async function loadTeachbackState(projectId: string): Promise<TeachbackState> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const md = loadDossierSync(p.rootPath);
  const hasDossier = md.trim().length > 0;
  const byTitle = new Map(parseDossierSections(md).map((s) => [s.title, s.body]));
  const sections = DOSSIER_SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    hasBody: (byTitle.get(s.title) ?? "").trim().length > 0,
  }));
  return { hasDossier, sections, past: listTeachbackSessions(projectId) };
}

export async function analyzeExplanation(
  projectId: string,
  sectionId: string,
  explanation: string,
): Promise<Analysis> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const trimmed = explanation.trim();
  if (!trimmed) throw new Error("Write an explanation first.");
  const { title, body } = sectionBodyOrThrow(p.rootPath, sectionId);
  const { object } = await generateObject({
    model: getModel(),
    schema: AnalysisSchema,
    prompt: buildAnalysisPrompt({ sectionTitle: title, sectionBody: body, explanation: trimmed }),
  });
  return object;
}

export async function submitSocraticResponse(args: {
  projectId: string;
  sectionId: string;
  explanation: string;
  analysis: Analysis;
  response: string;
}): Promise<TeachbackSession> {
  const p = getProjectRaw(args.projectId);
  if (!p) throw new Error("Project not found");
  const trimmed = args.response.trim();
  if (!trimmed) throw new Error("Answer the question first.");
  const { title, body } = sectionBodyOrThrow(p.rootPath, args.sectionId);
  const { object: closing } = await generateObject({
    model: getModel(),
    schema: ClosingSchema,
    prompt: buildClosingPrompt({
      sectionTitle: title,
      sectionBody: body,
      explanation: args.explanation,
      analysis: args.analysis,
      response: trimmed,
    }),
  });
  return insertTeachbackSession({
    projectId: args.projectId,
    sectionId: args.sectionId,
    explanation: args.explanation,
    coverageScore: args.analysis.coverageScore,
    gaps: args.analysis.gaps,
    socraticQuestion: args.analysis.socraticQuestion,
    response: trimmed,
    summary: closing.summary,
    stillMissing: closing.stillMissing,
  });
}
