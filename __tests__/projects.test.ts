import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import {
  addProjectRaw,
  listProjectsRaw,
  deleteProjectRaw,
  setActiveProjectRaw,
  getProjectRaw,
} from "@/lib/projects";

let tmpDir: string;
let tmpDb: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kys-projects-"));
  tmpDb = path.join(tmpDir, "test.db");
  process.env.KYS_DB_PATH = tmpDb;
  _resetDbForTests();
});

afterEach(() => {
  _resetDbForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("projects", () => {
  it("adds a project with a valid directory path", () => {
    const p = addProjectRaw({ name: "acme", rootPath: tmpDir });
    expect(p.id).toBeTruthy();
    expect(p.name).toBe("acme");
    expect(p.rootPath).toBe(path.resolve(tmpDir));

    const list = listProjectsRaw();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(p.id);
  });

  it("rejects a non-existent path", () => {
    expect(() =>
      addProjectRaw({ name: "ghost", rootPath: "/no/such/path/here/xyz" }),
    ).toThrow(/does not exist/);
  });

  it("rejects a path that is a file, not a directory", () => {
    const filePath = path.join(tmpDir, "afile.txt");
    fs.writeFileSync(filePath, "hi");
    expect(() => addProjectRaw({ name: "x", rootPath: filePath })).toThrow(/not a directory/);
  });

  it("rejects an empty name", () => {
    expect(() => addProjectRaw({ name: "   ", rootPath: tmpDir })).toThrow(/required/);
  });

  it("deletes a project and removes it from list", () => {
    const p = addProjectRaw({ name: "acme", rootPath: tmpDir });
    deleteProjectRaw(p.id);
    expect(listProjectsRaw()).toHaveLength(0);
    expect(getProjectRaw(p.id)).toBeNull();
  });

  it("setActiveProject bumps lastOpenedAt", () => {
    const sub1 = fs.mkdtempSync(path.join(tmpDir, "a-"));
    const sub2 = fs.mkdtempSync(path.join(tmpDir, "b-"));
    const p1 = addProjectRaw({ name: "one", rootPath: sub1 });
    // small delay to make timestamps deterministic
    const wait = Date.now() + 5;
    while (Date.now() < wait) {}
    const p2 = addProjectRaw({ name: "two", rootPath: sub2 });

    let list = listProjectsRaw();
    expect(list[0].id).toBe(p2.id);

    const wait2 = Date.now() + 5;
    while (Date.now() < wait2) {}
    setActiveProjectRaw(p1.id);
    list = listProjectsRaw();
    expect(list[0].id).toBe(p1.id);
  });

  it("cascades chat_messages on project delete", async () => {
    const p = addProjectRaw({ name: "acme", rootPath: tmpDir });
    const { getDb } = await import("@/lib/db");
    getDb()
      .prepare(
        "INSERT INTO chat_messages (id, projectId, mode, role, content, toolCallsJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("m1", p.id, "business", "user", "hello", null, Date.now());
    expect(
      (
        getDb().prepare("SELECT COUNT(*) AS c FROM chat_messages").get() as { c: number }
      ).c,
    ).toBe(1);
    deleteProjectRaw(p.id);
    expect(
      (
        getDb().prepare("SELECT COUNT(*) AS c FROM chat_messages").get() as { c: number }
      ).c,
    ).toBe(0);
  });
});
