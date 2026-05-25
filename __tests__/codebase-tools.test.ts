import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { listDir, readFile, grep } from "@/lib/codebase-tools";
import { SandboxError } from "@/lib/fs-sandbox";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kys-cbtools-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, "README.md"), "# Hello\nThis is the readme.");
  fs.writeFileSync(path.join(root, "src", "a.ts"), "export const greet = () => 'hi';\n");
  fs.writeFileSync(path.join(root, "src", "b.ts"), "// no match here\n");
  fs.writeFileSync(path.join(root, "node_modules", "skip.js"), "greet");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("listDir", () => {
  it("lists entries at root, skipping node_modules and .git", () => {
    const r = listDir(root, { path: "." });
    const names = r.entries.map((e) => e.name);
    expect(names).toContain("src");
    expect(names).toContain("README.md");
    expect(names).not.toContain("node_modules");
    expect(names).not.toContain(".git");
  });

  it("rejects traversal", () => {
    expect(() => listDir(root, { path: "../.." })).toThrow(SandboxError);
  });

  it("rejects null bytes", () => {
    expect(() => listDir(root, { path: "src\0/evil" })).toThrow(SandboxError);
  });
});

describe("readFile", () => {
  it("reads a file and returns content", () => {
    const r = readFile(root, { path: "README.md", maxBytes: 1024 });
    expect(r.content).toContain("Hello");
    expect(r.truncated).toBe(false);
  });

  it("truncates at maxBytes and flags truncated", () => {
    const big = "x".repeat(5000);
    fs.writeFileSync(path.join(root, "big.txt"), big);
    const r = readFile(root, { path: "big.txt", maxBytes: 100 });
    expect(r.content.length).toBe(100);
    expect(r.truncated).toBe(true);
    expect(r.bytes).toBe(5000);
  });

  it("rejects path traversal", () => {
    expect(() => readFile(root, { path: "../etc/passwd", maxBytes: 1024 })).toThrow(SandboxError);
  });

  it("throws a structured error on missing file", () => {
    expect(() => readFile(root, { path: "nope.txt", maxBytes: 1024 })).toThrow(/Cannot read/);
  });
});

describe("grep", () => {
  it("finds matches across files with line numbers", () => {
    const r = grep(root, { query: "greet", path: ".", maxResults: 100, caseSensitive: false });
    const paths = r.hits.map((h) => h.path);
    expect(paths).toContain(path.join("src", "a.ts"));
    expect(r.hits.find((h) => h.path === path.join("src", "a.ts"))?.line).toBe(1);
  });

  it("does not match inside skipped directories", () => {
    const r = grep(root, { query: "greet", path: ".", maxResults: 100, caseSensitive: false });
    expect(r.hits.find((h) => h.path.includes("node_modules"))).toBeUndefined();
  });

  it("case-insensitive by default", () => {
    fs.writeFileSync(path.join(root, "src", "c.ts"), "GREET_LOUDLY\n");
    const r = grep(root, { query: "greet", path: ".", maxResults: 100, caseSensitive: false });
    expect(r.hits.find((h) => h.path === path.join("src", "c.ts"))).toBeDefined();
  });

  it("works without ripgrep (JS fallback)", () => {
    const prev = process.env.KYS_FORCE_JS_GREP;
    process.env.KYS_FORCE_JS_GREP = "1";
    try {
      const r = grep(root, { query: "greet", path: ".", maxResults: 100, caseSensitive: false });
      expect(r.hits.length).toBeGreaterThan(0);
    } finally {
      if (prev === undefined) delete process.env.KYS_FORCE_JS_GREP;
      else process.env.KYS_FORCE_JS_GREP = prev;
    }
  });

  it("respects maxResults and marks truncated", () => {
    for (let i = 0; i < 20; i++) {
      fs.writeFileSync(path.join(root, `f${i}.txt`), "greet\n");
    }
    const r = grep(root, { query: "greet", path: ".", maxResults: 5, caseSensitive: false });
    expect(r.hits.length).toBe(5);
    expect(r.truncated).toBe(true);
  });
});
