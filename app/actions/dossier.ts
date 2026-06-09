"use server";

import { getProjectRaw } from "@/lib/projects";
import { loadBriefSync } from "@/lib/brief";
import { DOSSIER_SECTIONS, assembleDossier, upsertSection } from "@/lib/dossier";
import { loadDossierSync, saveDossierSync } from "@/lib/dossier-storage";
import { generateSectionBody, generateAllSections } from "@/lib/dossier-generate";

export async function loadDossier(projectId: string): Promise<string> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  return loadDossierSync(p.rootPath);
}

export async function saveDossier(projectId: string, markdown: string): Promise<void> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  saveDossierSync(p.rootPath, markdown);
}

export async function generateDossier(
  projectId: string,
): Promise<{ markdown: string; failedSectionIds: string[] }> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const brief = loadBriefSync(p.rootPath);

  const { results, failedSectionIds } = await generateAllSections({
    rootPath: p.rootPath,
    projectName: p.name,
    brief,
  });

  if (failedSectionIds.length === 0) {
    const markdown = assembleDossier(results);
    saveDossierSync(p.rootPath, markdown);
    return { markdown, failedSectionIds };
  }

  // Partial/total failure: never clobber an existing dossier. Merge only the
  // sections that succeeded into the current file; failed sections keep their
  // prior content. (No existing file → a partial dossier of the successes.)
  let markdown = loadDossierSync(p.rootPath);
  for (const r of results) {
    markdown = upsertSection(markdown, r.title, r.body);
  }
  if (results.length > 0) {
    saveDossierSync(p.rootPath, markdown);
  }
  return { markdown, failedSectionIds };
}

export async function generateSection(
  projectId: string,
  sectionId: string,
): Promise<string> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const section = DOSSIER_SECTIONS.find((s) => s.id === sectionId);
  if (!section) throw new Error(`Unknown section: ${sectionId}`);

  const brief = loadBriefSync(p.rootPath);
  const body = await generateSectionBody({
    rootPath: p.rootPath,
    projectName: p.name,
    brief,
    section,
  });

  const existing = loadDossierSync(p.rootPath);
  const updated = upsertSection(existing, section.title, body);
  saveDossierSync(p.rootPath, updated);
  return updated;
}
