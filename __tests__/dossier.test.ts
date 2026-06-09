import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  dossierPath,
  loadDossierSync,
  saveDossierSync,
  DOSSIER_SECTIONS,
} from "@/lib/dossier";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kys-dossier-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("dossier storage", () => {
  it("returns empty string when no dossier exists yet", () => {
    expect(loadDossierSync(root)).toBe("");
  });

  it("saveDossierSync creates .know-your-stuff/dossier.md", () => {
    saveDossierSync(root, "# Problem & Users\nHello");
    expect(fs.existsSync(dossierPath(root))).toBe(true);
    expect(loadDossierSync(root)).toContain("Hello");
  });

  it("saveDossierSync overwrites existing", () => {
    saveDossierSync(root, "v1");
    saveDossierSync(root, "v2");
    expect(loadDossierSync(root)).toBe("v2");
  });

  it("saveDossierSync refuses to write through a pre-existing .know-your-stuff symlink", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "kys-target-"));
    fs.symlinkSync(target, path.join(root, ".know-your-stuff"));
    expect(() => saveDossierSync(root, "x")).toThrow(/symlink/i);
    fs.rmSync(target, { recursive: true, force: true });
  });
});

describe("DOSSIER_SECTIONS", () => {
  it("lists the eight interview-dimension sections in order", () => {
    expect(DOSSIER_SECTIONS.map((s) => s.id)).toEqual([
      "problem-users",
      "requirements",
      "architecture",
      "data-model",
      "key-flows",
      "decisions-tradeoffs",
      "scale-bottlenecks",
      "failure-modes",
    ]);
    for (const s of DOSSIER_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.prompt.length).toBeGreaterThan(0);
    }
  });
});
