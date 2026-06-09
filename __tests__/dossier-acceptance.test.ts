import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { assembleDossier } from "@/lib/dossier";
import { generateAllSections } from "@/lib/dossier-generate";
import { saveDossierSync } from "@/lib/dossier-storage";
import { unresolvedCitedPaths } from "@/lib/repo-path-resolver";

const LIVE = process.env.KYS_LIVE === "1";
const TARGET =
  process.env.KYS_TARGET ?? path.join(os.homedir(), "code", "weekly-commit-module");

describe.skipIf(!LIVE)("dossier live acceptance (KYS_LIVE=1)", () => {
  it(
    "generates a fully-populated, grounded dossier whose cited paths exist",
    async () => {
      const { results, failedSectionIds } = await generateAllSections({
        rootPath: TARGET,
        projectName: "weekly-commit-module",
        brief: "",
      });

      // Every section must produce a usable body (the two-phase generator throws
      // on empty, landing failures here). This catches the "empty section" bug.
      expect(
        failedSectionIds,
        `Sections that produced no text: ${failedSectionIds.join(", ")}`,
      ).toEqual([]);
      expect(results.length).toBe(8);

      const markdown = assembleDossier(results);
      saveDossierSync(TARGET, markdown); // persist for human inspection

      const missing = unresolvedCitedPaths(TARGET, markdown);
      expect(
        missing,
        `Hallucinated/unresolvable cited paths:\n${missing.join("\n")}`,
      ).toEqual([]);
    },
    2_400_000,
  );
});
