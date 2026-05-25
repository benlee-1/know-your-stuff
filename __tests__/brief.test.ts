import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  loadBriefSync,
  saveBriefSync,
  collectBriefSeed,
  buildBriefGenerationPrompt,
  briefPath,
} from "@/lib/brief";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kys-brief-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("brief storage", () => {
  it("returns empty string when no brief exists yet", () => {
    expect(loadBriefSync(root)).toBe("");
  });

  it("saveBrief creates .know-your-stuff/brief.md", () => {
    saveBriefSync(root, "# Product\nHello");
    expect(fs.existsSync(briefPath(root))).toBe(true);
    expect(loadBriefSync(root)).toContain("Hello");
  });

  it("saveBrief overwrites existing", () => {
    saveBriefSync(root, "v1");
    saveBriefSync(root, "v2");
    expect(loadBriefSync(root)).toBe("v2");
  });

  it("saveBrief refuses to write through a pre-existing .know-your-stuff symlink", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "kys-evil-"));
    fs.symlinkSync(outsideDir, path.join(root, ".know-your-stuff"));
    try {
      expect(() => saveBriefSync(root, "hello")).toThrow(/symlink/);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

describe("brief seed collection", () => {
  it("collects README, package description, top-level docs", () => {
    fs.writeFileSync(path.join(root, "README.md"), "# Acme\nA cool product.");
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "acme", description: "Sells widgets." }),
    );
    fs.writeFileSync(path.join(root, "ROADMAP.md"), "## Roadmap\nQ4: launch.");
    const seed = collectBriefSeed(root);
    expect(seed.readme).toContain("Acme");
    expect(seed.packageDescription).toBe("Sells widgets.");
    expect(seed.topLevelDocs.find((d) => d.path === "ROADMAP.md")).toBeDefined();
  });

  it("handles missing README + package gracefully", () => {
    const seed = collectBriefSeed(root);
    expect(seed.readme).toBeNull();
    expect(seed.packageDescription).toBeNull();
    expect(seed.topLevelDocs).toHaveLength(0);
  });
});

describe("brief generation prompt", () => {
  it("contains all required section headers", () => {
    const p = buildBriefGenerationPrompt("acme", {
      readme: "hi",
      topLevelDocs: [],
      packageDescription: null,
      strategy: null,
    });
    for (const h of ["# Product", "# Users", "# Core Value", "# Domain Lingo", "# Key Flows", "# Open Questions"]) {
      expect(p).toContain(h);
    }
  });

  it("embeds the project name", () => {
    const p = buildBriefGenerationPrompt("acme-checkout", {
      readme: null,
      topLevelDocs: [],
      packageDescription: null,
      strategy: null,
    });
    expect(p).toContain("acme-checkout");
  });
});
