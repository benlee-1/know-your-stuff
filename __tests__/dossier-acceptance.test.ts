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

const LIVE = process.env.KYS_LIVE === "1";
const TARGET =
  process.env.KYS_TARGET ?? path.join(os.homedir(), "code", "weekly-commit-module");

// Extract `path/like/this.ext` or `path/like/this.ext:123` tokens from prose.
function citedPaths(markdown: string): string[] {
  const re = /(?:^|[\s(`"'])([\w./-]+\.[A-Za-z0-9]+)(?::\d+)?/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const p = m[1];
    if (p.includes("/") || p.startsWith(".")) out.add(p); // skip bare "X.y" words
  }
  return [...out];
}

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

      // Every cited path must resolve inside the target repo.
      const cited = citedPaths(markdown);
      const missing = cited.filter((p) => !fs.existsSync(path.join(TARGET, p)));
      expect(
        missing,
        `Hallucinated/incorrect cited paths:\n${missing.join("\n")}`,
      ).toEqual([]);
    },
    300_000,
  );
});
