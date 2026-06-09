import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DOSSIER_SECTIONS,
  runDossierGeneration,
  assembleDossier,
} from "@/lib/dossier";
import { buildDossierSectionPrompt } from "@/lib/prompts/dossier";
import { makeCodebaseTools } from "@/lib/codebase-tools-ai";
import { getModel } from "@/lib/ai";
import { generateText } from "ai";
import { unresolvedCitedPaths } from "@/lib/repo-path-resolver";
import { saveDossierSync } from "@/lib/dossier-storage";

const LIVE = process.env.KYS_LIVE === "1";
const TARGET =
  process.env.KYS_TARGET ?? path.join(os.homedir(), "code", "weekly-commit-module");

describe.skipIf(!LIVE)("dossier live acceptance (KYS_LIVE=1)", () => {
  it(
    "generates a grounded dossier whose cited paths exist on disk",
    async () => {
      expect(fs.existsSync(TARGET)).toBe(true);

      const { results, failedSectionIds } = await runDossierGeneration(
        DOSSIER_SECTIONS,
        async (section) => {
          const tools = makeCodebaseTools(TARGET, {
            enable: { list_dir: true, read_file: true, grep: true },
          });
          const res = await generateText({
            model: getModel(),
            system: buildDossierSectionPrompt({
              projectName: "weekly-commit-module",
              sectionTitle: section.title,
              sectionPrompt: section.prompt,
              briefMarkdown: "",
            }),
            prompt: `Write the "${section.title}" section now.`,
            tools,
            stopWhen: ({ steps }) => steps.length >= 12,
          });
          return res.text.trim();
        },
      );

      expect(failedSectionIds).toEqual([]);
      const markdown = assembleDossier(results);
      expect(markdown.length).toBeGreaterThan(200);

      // Persist for human inspection (green gate != good dossier — read it).
      saveDossierSync(TARGET, markdown);

      const missing = unresolvedCitedPaths(TARGET, markdown);
      expect(
        missing,
        `Hallucinated/unresolvable cited paths:\n${missing.join("\n")}`,
      ).toEqual([]);
    },
    2_400_000, // 8 sections × two-phase (explore + forced write) over a real repo; ~3-4min each
  );
});
