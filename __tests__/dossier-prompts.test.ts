import { describe, it, expect } from "vitest";
import { buildDossierSectionPrompt } from "@/lib/prompts/dossier";

describe("buildDossierSectionPrompt", () => {
  const base = {
    projectName: "weekly-commit-module",
    sectionTitle: "High-level Architecture",
    sectionPrompt: "Describe the major components.",
    briefMarkdown: "",
  };

  it("names the project, the section, and the section instruction", () => {
    const p = buildDossierSectionPrompt(base);
    expect(p).toContain("weekly-commit-module");
    expect(p).toContain("High-level Architecture");
    expect(p).toContain("Describe the major components.");
  });

  it("carries the grounding discipline (cite paths, no guessing)", () => {
    const p = buildDossierSectionPrompt(base).toLowerCase();
    expect(p).toContain("list_dir");
    expect(p).toContain("grep");
    expect(p).toContain("read_file");
    expect(p).toContain("cite");
    expect(p).toContain("not demonstrated in this repo");
  });

  it("notes when no brief is available", () => {
    expect(buildDossierSectionPrompt(base)).toMatch(/no business brief/i);
  });

  it("includes the brief when provided", () => {
    const p = buildDossierSectionPrompt({ ...base, briefMarkdown: "# Product\nWidgets" });
    expect(p).toContain("Widgets");
  });

  it("instructs the model to end its turn by writing the section", () => {
    const p = buildDossierSectionPrompt(base).toLowerCase();
    expect(p).toContain("end your turn");
  });

  it("forbids process narration in the output", () => {
    const p = buildDossierSectionPrompt(base).toLowerCase();
    expect(p).toContain("do not prefix");
  });
});
