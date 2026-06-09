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
 * Generate one section body. Two-phase: explore with codebase tools, then force
 * a final write with a NO-TOOLS pass (so the model can't keep calling tools and
 * must emit prose). Throws if even the forced pass yields nothing.
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

  const phase1 = research.text.trim();
  if (isUsableSectionText(phase1)) return phase1;

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
