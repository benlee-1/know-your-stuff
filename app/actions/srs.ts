"use server";

import { generateObject } from "ai";
import { getModel } from "@/lib/ai";
import { getProjectRaw } from "@/lib/projects";
import { loadDossierSync } from "@/lib/dossier-storage";
import { DOSSIER_SECTIONS, parseDossierSections } from "@/lib/dossier";
import { CardBatchSchema, buildCardGenPrompt } from "@/lib/prompts/srs";
import {
  insertCards,
  listCards,
  listDueCards,
  updateCardSchedule,
  deleteCardsForSection,
  scheduleCard,
  ratingToQuality,
  isDue,
  type Rating,
} from "@/lib/srs";
import type { Flashcard } from "@/lib/schema";

export type { Rating };

function sectionBodyOrThrow(projectRoot: string, sectionId: string): { title: string; body: string } {
  const section = DOSSIER_SECTIONS.find((s) => s.id === sectionId);
  if (!section) throw new Error(`Unknown section: ${sectionId}`);
  const byTitle = new Map(parseDossierSections(loadDossierSync(projectRoot)).map((s) => [s.title, s.body]));
  const body = (byTitle.get(section.title) ?? "").trim();
  if (!body) throw new Error(`Section "${section.title}" is empty in the dossier — regenerate it first.`);
  return { title: section.title, body };
}

export interface SrsSectionView {
  id: string;
  title: string;
  hasBody: boolean;
  cardCount: number;
  dueCount: number;
}
export interface SrsState {
  hasDossier: boolean;
  sections: SrsSectionView[];
  totalDue: number;
}

export async function loadSrsState(projectId: string): Promise<SrsState> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const md = loadDossierSync(p.rootPath);
  const hasDossier = md.trim().length > 0;
  const byTitle = new Map(parseDossierSections(md).map((s) => [s.title, s.body]));
  const cards = listCards(projectId);
  const now = Date.now();
  const counts = new Map<string, { total: number; due: number }>();
  for (const c of cards) {
    const e = counts.get(c.sectionId) ?? { total: 0, due: 0 };
    e.total += 1;
    if (isDue(c, now)) e.due += 1;
    counts.set(c.sectionId, e);
  }
  const sections = DOSSIER_SECTIONS.map((s) => {
    const e = counts.get(s.id) ?? { total: 0, due: 0 };
    return {
      id: s.id,
      title: s.title,
      hasBody: (byTitle.get(s.title) ?? "").trim().length > 0,
      cardCount: e.total,
      dueCount: e.due,
    };
  });
  return { hasDossier, sections, totalDue: cards.filter((c) => isDue(c, now)).length };
}

export async function generateCards(
  projectId: string,
  sectionId: string,
  count = 8,
): Promise<Flashcard[]> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const n = Math.max(1, Math.min(20, Math.trunc(count)));
  const { title, body } = sectionBodyOrThrow(p.rootPath, sectionId);
  const { object } = await generateObject({
    model: getModel(),
    schema: CardBatchSchema,
    prompt: buildCardGenPrompt({ sectionTitle: title, sectionBody: body, count: n }),
  });
  const cards = object.cards
    .filter((c) => c.front.trim().length > 0 && c.back.trim().length > 0)
    .slice(0, n);
  if (cards.length === 0) throw new Error("No cards were generated — try again.");
  deleteCardsForSection(projectId, sectionId);
  return insertCards({ projectId, sectionId, cards, now: Date.now() });
}

export async function getDueCards(projectId: string): Promise<Flashcard[]> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  return listDueCards(projectId, Date.now());
}

export async function rateCard(
  projectId: string,
  cardId: string,
  rating: Rating,
): Promise<Flashcard> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const card = listCards(projectId).find((c) => c.id === cardId);
  if (!card) throw new Error("Card not found");
  const now = Date.now();
  const sched = scheduleCard(
    { ease: card.ease, intervalDays: card.intervalDays, reps: card.reps },
    ratingToQuality(rating),
    now,
  );
  updateCardSchedule(cardId, sched);
  return { ...card, ...sched };
}
