import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { unresolvedCitedPaths, buildBasenameIndex } from "@/lib/repo-path-resolver";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kys-resolve-"));
  // a small repo with files at various depths
  fs.writeFileSync(path.join(root, "build.gradle"), "x");
  fs.writeFileSync(path.join(root, ".gitignore"), "x");
  fs.mkdirSync(path.join(root, "apps", "x"), { recursive: true });
  fs.writeFileSync(path.join(root, "apps", "x", "ManagerRouteGuard.test.tsx"), "x");
  fs.mkdirSync(path.join(root, "weekly", "project"), { recursive: true });
  fs.writeFileSync(path.join(root, "weekly", "project", "stride-app.jsx"), "x");
  // a directory that must be ignored by the index
  fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules", "pkg", "ghost.ts"), "x");
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("buildBasenameIndex", () => {
  it("indexes file basenames but skips node_modules/.git", () => {
    const idx = buildBasenameIndex(root);
    expect(idx.has("build.gradle")).toBe(true);
    expect(idx.has("ManagerRouteGuard.test.tsx")).toBe(true);
    expect(idx.has("stride-app.jsx")).toBe(true);
    expect(idx.has("ghost.ts")).toBe(false); // node_modules excluded
  });
});

describe("unresolvedCitedPaths", () => {
  it("resolves root-relative, root-level, and bare-filename citations", () => {
    const md = [
      "Root build file `build.gradle`.",
      "Guard at ManagerRouteGuard.test.tsx (bare).",
      "Full path apps/x/ManagerRouteGuard.test.tsx.",
      "Component stride-app.jsx.",
      "Ignore rules in .gitignore.",
    ].join("\n");
    expect(unresolvedCitedPaths(root, md)).toEqual([]);
  });

  it("excludes external CDN url fragments and bare prose extensions", () => {
    const md =
      "Loads 18.3.1/umd/react.development.js and 7.29.0/babel.min.js; uses the .jsx extension.";
    expect(unresolvedCitedPaths(root, md)).toEqual([]);
  });

  it("reports a genuine hallucination (no such file anywhere)", () => {
    const md = "See WeeklyCommitController.java for the controller.";
    expect(unresolvedCitedPaths(root, md)).toEqual(["WeeklyCommitController.java"]);
  });

  it("does not exclude a real dotfile that resolves", () => {
    // .gitignore exists, so it must resolve (NOT be dropped by the prose-extension rule)
    expect(unresolvedCitedPaths(root, "config in .gitignore")).toEqual([]);
  });

  it("excludes external CDN bundle files (.min./.development./.production.)", () => {
    const md = "loads react.development.js, react-dom.production.min.js, and babel.min.js";
    expect(unresolvedCitedPaths(root, md)).toEqual([]);
  });

  it("excludes prose tool-lists with an all-caps segment (Vite/CRA/Next.js)", () => {
    expect(unresolvedCitedPaths(root, "alternatives like Vite/CRA/Next.js")).toEqual([]);
  });

  it("still reports a genuine invented repo file alongside external/prose noise", () => {
    const md = "uses react.development.js but see FakeController.java";
    expect(unresolvedCitedPaths(root, md)).toEqual(["FakeController.java"]);
  });
});
