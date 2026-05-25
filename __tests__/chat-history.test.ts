import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import { appendMessage, loadHistory, clearHistory } from "@/lib/chat-history";
import { addProjectRaw } from "@/lib/projects";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kys-chat-"));
  process.env.KYS_DB_PATH = path.join(tmpDir, "test.db");
  _resetDbForTests();
});

afterEach(() => {
  _resetDbForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("chat history", () => {
  it("persists and reloads messages per (project, mode)", () => {
    const p = addProjectRaw({ name: "acme", rootPath: tmpDir });
    appendMessage({ projectId: p.id, mode: "business", role: "user", content: "hi" });
    appendMessage({ projectId: p.id, mode: "business", role: "assistant", content: "hello" });
    const list = loadHistory(p.id, "business");
    expect(list.map((m) => m.content)).toEqual(["hi", "hello"]);
    expect(loadHistory(p.id, "technical")).toHaveLength(0);
  });

  it("clears only the (project, mode) tuple", () => {
    const p = addProjectRaw({ name: "acme", rootPath: tmpDir });
    appendMessage({ projectId: p.id, mode: "business", role: "user", content: "b" });
    appendMessage({ projectId: p.id, mode: "technical", role: "user", content: "t" });
    clearHistory(p.id, "business");
    expect(loadHistory(p.id, "business")).toHaveLength(0);
    expect(loadHistory(p.id, "technical")).toHaveLength(1);
  });

  it("round-trips toolCalls metadata", () => {
    const p = addProjectRaw({ name: "acme", rootPath: tmpDir });
    appendMessage({
      projectId: p.id,
      mode: "technical",
      role: "assistant",
      content: "see src/a.ts",
      toolCalls: [{ name: "read_file", input: { path: "src/a.ts" } }],
    });
    const [msg] = loadHistory(p.id, "technical");
    expect(msg.toolCallsJson).toBeTruthy();
    expect(JSON.parse(msg.toolCallsJson!)).toEqual([
      { name: "read_file", input: { path: "src/a.ts" } },
    ]);
  });

  it("cascades on project delete", async () => {
    const p = addProjectRaw({ name: "acme", rootPath: tmpDir });
    appendMessage({ projectId: p.id, mode: "business", role: "user", content: "hi" });
    const { deleteProjectRaw } = await import("@/lib/projects");
    deleteProjectRaw(p.id);
    expect(loadHistory(p.id, "business")).toHaveLength(0);
  });
});
