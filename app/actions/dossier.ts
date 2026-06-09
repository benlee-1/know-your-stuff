"use server";

import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { getProjectRaw } from "@/lib/projects";
import { loadBriefSync } from "@/lib/brief";
import { makeCodebaseTools } from "@/lib/codebase-tools-ai";
import { buildDossierSectionPrompt } from "@/lib/prompts/dossier";
import {
  DOSSIER_SECTIONS,
  type DossierSection,
  assembleDossier,
  loadDossierSync,
  saveDossierSync,
  runDossierGeneration,
  upsertSection,
} from "@/lib/dossier";

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

// One bounded agentic pass producing a single section's body. Same engine the
// Technical chat mode uses: codebase tools + a step cap.
async function generateSectionBody(args: {
  rootPath: string;
  projectName: string;
  brief: string;
  section: DossierSection;
}): Promise<string> {
  const tools = makeCodebaseTools(args.rootPath, {
    enable: { list_dir: true, read_file: true, grep: true },
  });
  const res = await generateText({
    model: getModel(),
    system: buildDossierSectionPrompt({
      projectName: args.projectName,
      sectionTitle: args.section.title,
      sectionPrompt: args.section.prompt,
      briefMarkdown: args.brief,
    }),
    prompt: `Write the "${args.section.title}" section now.`,
    tools,
    stopWhen: ({ steps }) => steps.length >= 12,
  });
  return res.text.trim();
}

export async function generateDossier(
  projectId: string,
): Promise<{ markdown: string; failedSectionIds: string[] }> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const brief = loadBriefSync(p.rootPath);

  const { results, failedSectionIds } = await runDossierGeneration(
    DOSSIER_SECTIONS,
    (section) =>
      generateSectionBody({ rootPath: p.rootPath, projectName: p.name, brief, section }),
  );

  // If every section failed (e.g. bad API key / outage), don't clobber an
  // existing dossier with an empty file — return the prior content unchanged.
  if (results.length === 0) {
    return { markdown: loadDossierSync(p.rootPath), failedSectionIds };
  }

  const markdown = assembleDossier(results);
  saveDossierSync(p.rootPath, markdown);
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
