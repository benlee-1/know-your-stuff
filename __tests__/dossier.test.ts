import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DOSSIER_SECTIONS,
  assembleDossier,
  parseDossierSections,
  upsertSection,
  runDossierGeneration,
} from "@/lib/dossier";
import { dossierPath, loadDossierSync, saveDossierSync } from "@/lib/dossier-storage";

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
    try {
      expect(() => saveDossierSync(root, "x")).toThrow(/symlink/i);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
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

describe("assembleDossier", () => {
  it("joins sections under '# Title' headers", () => {
    const md = assembleDossier([
      { title: "Problem & Users", body: "It helps X." },
      { title: "Data Model", body: "One table." },
    ]);
    expect(md).toBe(
      "# Problem & Users\n\nIt helps X.\n\n# Data Model\n\nOne table.",
    );
  });
});

describe("parseDossierSections", () => {
  it("splits a dossier back into title/body pairs", () => {
    const md = "# Problem & Users\n\nIt helps X.\n\n# Data Model\n\nOne table.";
    expect(parseDossierSections(md)).toEqual([
      { title: "Problem & Users", body: "It helps X." },
      { title: "Data Model", body: "One table." },
    ]);
  });

  it("ignores content before the first header", () => {
    expect(parseDossierSections("preamble\n\n# A\n\nbody")).toEqual([
      { title: "A", body: "body" },
    ]);
  });
});

describe("upsertSection", () => {
  it("replaces an existing section's body in place", () => {
    const md = "# Problem & Users\n\nold\n\n# Data Model\n\nkeep";
    const out = upsertSection(md, "Problem & Users", "new");
    expect(out).toBe("# Problem & Users\n\nnew\n\n# Data Model\n\nkeep");
  });

  it("inserts a missing section in canonical DOSSIER_SECTIONS order", () => {
    // Data Model exists; insert Requirements, which canonically precedes it.
    const md = "# Data Model\n\nkeep";
    const out = upsertSection(md, "Requirements", "req body");
    expect(out).toBe("# Requirements\n\nreq body\n\n# Data Model\n\nkeep");
  });
});

describe("parseDossierSections — robustness", () => {
  it("does not treat '# ' lines inside fenced code blocks as headers", () => {
    const md = [
      "# Architecture",
      "",
      "```python",
      "# this is a comment, not a section",
      "x = 1",
      "```",
      "",
      "# Data Model",
      "",
      "one table",
    ].join("\n");
    const sections = parseDossierSections(md);
    expect(sections.map((s) => s.title)).toEqual(["Architecture", "Data Model"]);
    expect(sections[0].body).toContain("# this is a comment");
  });

  it("returns [] for empty input", () => {
    expect(parseDossierSections("")).toEqual([]);
  });

  it("tolerates CRLF line endings", () => {
    const md = "# A\r\n\r\nbody line\r\n\r\n# B\r\n\r\nmore";
    expect(parseDossierSections(md)).toEqual([
      { title: "A", body: "body line" },
      { title: "B", body: "more" },
    ]);
  });
});

describe("dossier round-trip", () => {
  it("parseDossierSections inverts assembleDossier", () => {
    const sections = [
      { title: "Problem & Users", body: "It helps X.\n\nSecond para." },
      { title: "Data Model", body: "```ts\nconst x = 1 // # not a header\n```" },
    ];
    expect(parseDossierSections(assembleDossier(sections))).toEqual(sections);
  });
});

describe("runDossierGeneration", () => {
  it("generates every section in order via the injected generator", async () => {
    const sections = [
      { id: "a", title: "A", prompt: "pa" },
      { id: "b", title: "B", prompt: "pb" },
    ];
    const { results, failedSectionIds } = await runDossierGeneration(
      sections,
      async (s) => `body-${s.id}`,
    );
    expect(failedSectionIds).toEqual([]);
    expect(results).toEqual([
      { id: "a", title: "A", body: "body-a" },
      { id: "b", title: "B", body: "body-b" },
    ]);
  });

  it("skips a failing section and continues, recording its id", async () => {
    const sections = [
      { id: "a", title: "A", prompt: "pa" },
      { id: "b", title: "B", prompt: "pb" },
      { id: "c", title: "C", prompt: "pc" },
    ];
    const { results, failedSectionIds } = await runDossierGeneration(
      sections,
      async (s) => {
        if (s.id === "b") throw new Error("429");
        return `body-${s.id}`;
      },
    );
    expect(failedSectionIds).toEqual(["b"]);
    expect(results.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("reports progress through the optional onProgress callback", async () => {
    const seen: string[] = [];
    await runDossierGeneration(
      [{ id: "a", title: "A", prompt: "pa" }],
      async (s) => `body-${s.id}`,
      (p) => seen.push(`${p.index + 1}/${p.total}:${p.id}:${p.status}`),
    );
    expect(seen).toContain("1/1:a:done");
  });
});
