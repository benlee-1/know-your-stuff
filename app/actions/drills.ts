"use server";

import { generateObject } from "ai";
import { getModel } from "@/lib/ai";
import { getProjectRaw } from "@/lib/projects";
import { loadDossierSync } from "@/lib/dossier-storage";
import { DOSSIER_SECTIONS, parseDossierSections } from "@/lib/dossier";
import {
  DrillQuestionSchema,
  DrillScoreSchema,
  buildOpeningPrompt,
  buildFollowupPrompt,
  buildScorePrompt,
} from "@/lib/prompts/drills";
import { DRILL_TURNS, insertDrillSession, listDrillSessions, type DrillTurn } from "@/lib/drills";
import type { DrillSession } from "@/lib/schema";

function sectionBodyOrThrow(
  projectRoot: string,
  sectionId: string,
): { title: string; body: string } {
  const section = DOSSIER_SECTIONS.find((s) => s.id === sectionId);
  if (!section) throw new Error(`Unknown section: ${sectionId}`);
  const parsed = parseDossierSections(loadDossierSync(projectRoot));
  const byTitle = new Map(parsed.map((s) => [s.title, s.body]));
  const body = (byTitle.get(section.title) ?? "").trim();
  if (!body)
    throw new Error(
      `Section "${section.title}" is empty in the dossier — regenerate it first.`,
    );
  return { title: section.title, body };
}

export async function startDrill(
  projectId: string,
  sectionId: string,
): Promise<{ question: string }> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const { title, body } = sectionBodyOrThrow(p.rootPath, sectionId);
  const { object } = await generateObject({
    model: getModel(),
    schema: DrillQuestionSchema,
    prompt: buildOpeningPrompt({ sectionTitle: title, sectionBody: body }),
  });
  return object;
}

export async function nextDrillQuestion(
  projectId: string,
  sectionId: string,
  transcript: DrillTurn[],
): Promise<{ question: string }> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const { title, body } = sectionBodyOrThrow(p.rootPath, sectionId);
  const { object } = await generateObject({
    model: getModel(),
    schema: DrillQuestionSchema,
    prompt: buildFollowupPrompt({ sectionTitle: title, sectionBody: body, transcript }),
  });
  return object;
}

export async function finishDrill(
  projectId: string,
  sectionId: string,
  transcript: DrillTurn[],
): Promise<DrillSession> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  if (transcript.length === 0) throw new Error("Cannot finish an empty drill.");
  const { title, body } = sectionBodyOrThrow(p.rootPath, sectionId);
  const { object: score } = await generateObject({
    model: getModel(),
    schema: DrillScoreSchema,
    prompt: buildScorePrompt({ sectionTitle: title, sectionBody: body, transcript }),
  });
  return insertDrillSession({
    projectId,
    sectionId,
    transcript,
    score: score.score,
    strengths: score.strengths,
    weaknesses: score.weaknesses,
  });
}

export interface DrillsSectionView {
  id: string;
  title: string;
  hasBody: boolean;
}
export interface DrillsState {
  hasDossier: boolean;
  sections: DrillsSectionView[];
  past: DrillSession[];
  turns: number;
}

export async function loadDrillsState(projectId: string): Promise<DrillsState> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const md = loadDossierSync(p.rootPath);
  const hasDossier = md.trim().length > 0;
  const parsed = parseDossierSections(md);
  const byTitle = new Map(parsed.map((s) => [s.title, s.body]));
  const sections = DOSSIER_SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    hasBody: (byTitle.get(s.title) ?? "").trim().length > 0,
  }));
  return { hasDossier, sections, past: listDrillSessions(projectId), turns: DRILL_TURNS };
}
