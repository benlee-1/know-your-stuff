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
  runDossierGeneration,
  upsertSection,
  isUsableSectionText,
} from "@/lib/dossier";
import { loadDossierSync, saveDossierSync } from "@/lib/dossier-storage";

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

// Two-phase agentic pass producing a single section's body.
// Phase 1 explores the codebase with tools. Phase 2 forces a write with NO
// tools registered — the model has nothing left to call so it must emit prose.
// See docs/solutions/integration-issues/ai-sdk-experimental-output-blocks-custom-tools.md
async function generateSectionBody(args: {
  rootPath: string;
  projectName: string;
  brief: string;
  section: DossierSection;
}): Promise<string> {
  const system = buildDossierSectionPrompt({
    projectName: args.projectName,
    sectionTitle: args.section.title,
    sectionPrompt: args.section.prompt,
    briefMarkdown: args.brief,
  });
  const userPrompt = `Explore the codebase to gather the evidence you need for the "${args.section.title}" section.`;

  // Phase 1 — research with codebase tools.
  const tools = makeCodebaseTools(args.rootPath, {
    enable: { list_dir: true, read_file: true, grep: true },
  });
  const research = await generateText({
    model: getModel(),
    system,
    prompt: userPrompt,
    tools,
    stopWhen: ({ steps }) => steps.length >= 20,
  });

  // If Phase 1 already ended by writing the section, use it.
  const phase1 = research.text.trim();
  if (isUsableSectionText(phase1)) return phase1;

  // Phase 2 — force the write with NO tools, replaying the gathered context.
  // With no tools registered the model cannot call anything, so it must emit
  // the section body as text.
  const final = await generateText({
    model: getModel(),
    system,
    messages: [
      { role: "user", content: userPrompt },
      ...research.response.messages,
      {
        role: "user",
        content: `Now write the "${args.section.title}" section body in Markdown, using only the evidence you gathered above. Output ONLY the body — no narration about your process, no headers, no tool calls. If evidence is missing for part of it, write "not demonstrated in this repo".`,
      },
    ],
  });

  const text = final.text.trim();
  if (!isUsableSectionText(text)) {
    throw new Error(
      `Section "${args.section.title}" produced no text after two phases (phase2 finishReason=${final.finishReason}).`,
    );
  }
  return text;
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
