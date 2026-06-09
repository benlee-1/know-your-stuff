import { generateText, type ModelMessage } from "ai";
import { getModel } from "./ai";
import { makeCodebaseTools } from "./codebase-tools-ai";
import { buildDossierSectionPrompt } from "./prompts/dossier";
import {
  DOSSIER_SECTIONS,
  type DossierSection,
  isUsableSectionText,
  runDossierGeneration,
} from "./dossier";

/**
 * Generate one section body. Two-phase, and Phase 2 ALWAYS runs:
 *  - Phase 1 explores the codebase with tools (its text output is treated as
 *    scratch, never the section — the model often emits mid-exploration
 *    narration like "I now have enough evidence, let me do one final check",
 *    which must not leak into the dossier).
 *  - Phase 2 replays the gathered context with NO tools, forcing a clean write
 *    of just the section body.
 * Throws if the forced write still yields nothing.
 */
export async function generateSectionBody(args: {
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

  // Phase 1 — explore with codebase tools. We keep the gathered messages, not
  // its prose: ending on a tool call (or on narration) is expected here.
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

  // Phase 2 — always force a clean, narration-free write with no tools.
  const messages: ModelMessage[] = [
    { role: "user", content: userPrompt },
    ...research.response.messages,
    {
      role: "user",
      content: `Now write the "${args.section.title}" section body in Markdown, using only the evidence you gathered above. Output ONLY the body — no narration about your process, no headers, no tool calls. If evidence is missing for part of it, write "not demonstrated in this repo".`,
    },
  ];
  const final = await generateText({ model: getModel(), system, messages });

  const text = final.text.trim();
  if (!isUsableSectionText(text)) {
    throw new Error(
      `Section "${args.section.title}" produced no text after two phases (phase2 finishReason=${final.finishReason}).`,
    );
  }
  return text;
}

/** Generate all eight sections (sequential, continue-on-failure). */
export function generateAllSections(args: {
  rootPath: string;
  projectName: string;
  brief: string;
}) {
  return runDossierGeneration(DOSSIER_SECTIONS, (section) =>
    generateSectionBody({
      rootPath: args.rootPath,
      projectName: args.projectName,
      brief: args.brief,
      section,
    }),
  );
}
