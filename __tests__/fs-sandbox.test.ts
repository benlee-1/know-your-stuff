import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveSafe, SandboxError } from "@/lib/fs-sandbox";

let root: string;
let outsideDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kys-sandbox-"));
  outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "kys-outside-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "a.ts"), "hello");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outsideDir, { recursive: true, force: true });
});

describe("resolveSafe", () => {
  it("accepts a relative path inside root", () => {
    const realRoot = fs.realpathSync(root);
    const p = resolveSafe(root, "src/a.ts");
    expect(p).toBe(path.join(realRoot, "src", "a.ts"));
  });

  it("accepts the root itself", () => {
    expect(resolveSafe(root, ".")).toBe(fs.realpathSync(root));
  });

  it("rejects ../ escapes", () => {
    expect(() => resolveSafe(root, "../../etc/passwd")).toThrow(SandboxError);
  });

  it("rejects an absolute path outside root", () => {
    expect(() => resolveSafe(root, "/etc/passwd")).toThrow(SandboxError);
  });

  it("accepts an absolute path inside root", () => {
    const realRoot = fs.realpathSync(root);
    expect(resolveSafe(root, path.join(root, "src", "a.ts"))).toBe(
      path.join(realRoot, "src", "a.ts"),
    );
  });

  it("rejects symlinks whose target is outside root", () => {
    const link = path.join(root, "evil");
    fs.symlinkSync(outsideDir, link);
    expect(() => resolveSafe(root, "evil")).toThrow(SandboxError);
  });

  it("rejects strings containing null bytes", () => {
    expect(() => resolveSafe(root, "src/a\0.ts")).toThrow(SandboxError);
  });

  it("rejects when the resolved path is identical to a parent of root", () => {
    expect(() => resolveSafe(root, "..")).toThrow(SandboxError);
  });
});
