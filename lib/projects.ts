import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, toPlain, toPlainArray } from "./db";
import type { Project } from "./schema";

export function listProjectsRaw(): Project[] {
  const rows = getDb()
    .prepare("SELECT * FROM projects ORDER BY lastOpenedAt DESC")
    .all() as Project[];
  return toPlainArray(rows);
}

export function getProjectRaw(id: string): Project | null {
  const row = getDb()
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as Project | undefined;
  return toPlain(row);
}

export function addProjectRaw(input: { name: string; rootPath: string }): Project {
  const name = input.name.trim();
  const rootPath = path.resolve(input.rootPath.trim());

  if (!name) throw new Error("Project name is required.");

  let stat;
  try {
    stat = fs.statSync(rootPath);
  } catch {
    throw new Error(`Path does not exist: ${rootPath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${rootPath}`);
  }

  const now = Date.now();
  const project: Project = {
    id: randomUUID(),
    name,
    rootPath,
    createdAt: now,
    lastOpenedAt: now,
  };
  getDb()
    .prepare(
      "INSERT INTO projects (id, name, rootPath, createdAt, lastOpenedAt) VALUES (?, ?, ?, ?, ?)",
    )
    .run(project.id, project.name, project.rootPath, project.createdAt, project.lastOpenedAt);
  return project;
}

export function deleteProjectRaw(id: string): void {
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
}

export function setActiveProjectRaw(id: string): void {
  getDb().prepare("UPDATE projects SET lastOpenedAt = ? WHERE id = ?").run(Date.now(), id);
}
