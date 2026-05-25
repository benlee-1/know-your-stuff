import { describe, it, expect } from "vitest";
import {
  isLocalHost,
  extractText,
  buildToolPartsFromSteps,
} from "@/lib/chat-route-helpers";

describe("isLocalHost", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "localhost:3000",
    "127.0.0.1:3000",
    "[::1]:3000",
    "http://localhost:3000",
    "https://127.0.0.1:3000",
  ])("accepts %s", (v) => {
    expect(isLocalHost(v)).toBe(true);
  });

  it.each([
    null,
    "",
    "attacker.tld",
    "example.com:3000",
    "http://evil.tld",
    "127.0.0.1.evil.tld",
    "0.0.0.0",
    "192.168.1.1",
    "10.0.0.1",
  ])("rejects %s", (v) => {
    expect(isLocalHost(v)).toBe(false);
  });

  it("rejects an unparseable origin string", () => {
    expect(isLocalHost("://garbage")).toBe(false);
  });
});

describe("extractText", () => {
  it("joins all text parts with newlines", () => {
    const msg = {
      id: "x",
      role: "user" as const,
      parts: [
        { type: "text" as const, text: "hello" },
        { type: "text" as const, text: "world" },
      ],
    };
    expect(extractText(msg as never)).toBe("hello\nworld");
  });

  it("returns empty string when no parts", () => {
    expect(extractText({ id: "x", role: "user", parts: undefined } as never)).toBe("");
  });

  it("ignores non-text parts", () => {
    const msg = {
      id: "x",
      role: "assistant" as const,
      parts: [
        { type: "text" as const, text: "hi" },
        { type: "tool-read_file", toolCallId: "t1", input: {}, output: {} },
      ],
    };
    expect(extractText(msg as never)).toBe("hi");
  });
});

describe("buildToolPartsFromSteps", () => {
  it("returns empty for undefined/empty steps", () => {
    expect(buildToolPartsFromSteps(undefined)).toEqual([]);
    expect(buildToolPartsFromSteps([])).toEqual([]);
  });

  it("matches calls with results from the same step", () => {
    const parts = buildToolPartsFromSteps([
      {
        toolCalls: [{ toolCallId: "t1", toolName: "list_dir", input: { path: "." } }],
        toolResults: [{ toolCallId: "t1", output: { entries: [] } }],
      },
    ]);
    expect(parts).toEqual([
      {
        type: "tool-list_dir",
        toolCallId: "t1",
        input: { path: "." },
        output: { entries: [] },
      },
    ]);
  });

  it("matches calls with results from a LATER step (the bug this fixes)", () => {
    const parts = buildToolPartsFromSteps([
      { toolCalls: [{ toolCallId: "t1", toolName: "read_file", input: { path: "a" } }] },
      { toolResults: [{ toolCallId: "t1", output: { content: "x" } }] },
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0].output).toEqual({ content: "x" });
  });

  it("emits output:null for an unresolved call", () => {
    const parts = buildToolPartsFromSteps([
      { toolCalls: [{ toolCallId: "t1", toolName: "grep", input: { query: "x" } }] },
    ]);
    expect(parts).toEqual([
      { type: "tool-grep", toolCallId: "t1", input: { query: "x" }, output: null },
    ]);
  });

  it("preserves call order across steps", () => {
    const parts = buildToolPartsFromSteps([
      { toolCalls: [{ toolCallId: "a", toolName: "list_dir", input: {} }] },
      { toolCalls: [{ toolCallId: "b", toolName: "read_file", input: {} }] },
      { toolResults: [{ toolCallId: "a", output: 1 }, { toolCallId: "b", output: 2 }] },
    ]);
    expect(parts.map((p) => p.toolCallId)).toEqual(["a", "b"]);
    expect(parts.map((p) => p.output)).toEqual([1, 2]);
  });
});
