import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { resolveSafe } from "./fs-sandbox";

const DEFAULT_SKIP = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "out",
  "coverage",
  ".know-your-stuff",
]);

const DEFAULT_MAX_BYTES = 200 * 1024; // 200 KB

// ---------- list_dir ----------

export const ListDirInput = z.object({
  path: z.string().default("."),
});
export type ListDirInput = z.infer<typeof ListDirInput>;

export interface DirEntry {
  name: string;
  type: "file" | "dir" | "other";
  size: number | null;
}

export function listDir(root: string, input: ListDirInput): { path: string; entries: DirEntry[] } {
  // Reject targets whose path includes a skip-listed segment. Without this
  // check, a caller could pass `{path: "node_modules"}` and enumerate the
  // contents — defeating the skip list and burning tokens on transitive deps.
  const segments = input.path.split(/[\\/]+/).filter(Boolean);
  for (const seg of segments) {
    if (DEFAULT_SKIP.has(seg)) {
      throw new Error(`Path contains a skip-listed segment ("${seg}"): ${input.path}`);
    }
  }
  const target = resolveSafe(root, input.path);
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${input.path}`);
  }
  const entries: DirEntry[] = [];
  for (const dirent of fs.readdirSync(target, { withFileTypes: true })) {
    if (DEFAULT_SKIP.has(dirent.name)) continue;
    let size: number | null = null;
    let type: DirEntry["type"] = "other";
    if (dirent.isDirectory()) type = "dir";
    else if (dirent.isFile()) {
      type = "file";
      try {
        size = fs.statSync(path.join(target, dirent.name)).size;
      } catch {}
    }
    entries.push({ name: dirent.name, type, size });
  }
  entries.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
  );
  return { path: path.relative(root, target) || ".", entries };
}

// ---------- read_file ----------

export const ReadFileInput = z.object({
  path: z.string(),
  maxBytes: z.number().int().positive().max(2 * 1024 * 1024).default(DEFAULT_MAX_BYTES),
});
export type ReadFileInput = z.infer<typeof ReadFileInput>;

export function readFile(
  root: string,
  input: ReadFileInput,
): { path: string; content: string; truncated: boolean; bytes: number } {
  const target = resolveSafe(root, input.path);
  let buf: Buffer;
  try {
    buf = fs.readFileSync(target);
  } catch (err) {
    throw new Error(`Cannot read file: ${input.path} (${(err as Error).message})`);
  }
  const truncated = buf.byteLength > input.maxBytes;
  const sliced = truncated ? buf.subarray(0, input.maxBytes) : buf;
  return {
    path: input.path,
    content: sliced.toString("utf8"),
    truncated,
    bytes: buf.byteLength,
  };
}

// ---------- grep ----------

export const GrepInput = z.object({
  query: z.string().min(1),
  path: z.string().default("."),
  maxResults: z.number().int().positive().max(500).default(100),
  caseSensitive: z.boolean().default(false),
});
export type GrepInput = z.infer<typeof GrepInput>;

export interface GrepHit {
  path: string;
  line: number;
  preview: string;
}

export function grep(root: string, input: GrepInput): { hits: GrepHit[]; truncated: boolean } {
  const target = resolveSafe(root, input.path);
  if (hasRipgrep()) {
    return grepWithRipgrep(root, target, input);
  }
  return grepWithJs(root, target, input);
}

function hasRipgrep(): boolean {
  if (process.env.KYS_FORCE_JS_GREP === "1") return false;
  const r = spawnSync("rg", ["--version"], { stdio: "ignore" });
  return r.status === 0;
}

function grepWithRipgrep(
  root: string,
  target: string,
  input: GrepInput,
): { hits: GrepHit[]; truncated: boolean } {
  const realRoot = fs.realpathSync(root);
  const skipGlobs: string[] = [];
  for (const name of DEFAULT_SKIP) {
    skipGlobs.push("--glob", `!**/${name}/**`);
    skipGlobs.push("--glob", `!${name}`);
  }
  const args = [
    "--no-heading",
    "--line-number",
    "--with-filename",
    "--color=never",
    "--no-ignore",
    ...skipGlobs,
    ...(input.caseSensitive ? [] : ["-i"]),
    "--",
    input.query,
    target,
  ];
  const r = spawnSync("rg", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const hits: GrepHit[] = [];
  let truncated = false;
  if (r.stdout) {
    for (const line of r.stdout.split("\n")) {
      if (!line) continue;
      const firstColon = line.indexOf(":");
      const secondColon = line.indexOf(":", firstColon + 1);
      if (firstColon === -1 || secondColon === -1) continue;
      const filePath = line.slice(0, firstColon);
      const lineNum = Number(line.slice(firstColon + 1, secondColon));
      const preview = line.slice(secondColon + 1);
      const rel = path.relative(realRoot, filePath);
      if (rel.startsWith("..")) continue;
      if (hits.length >= input.maxResults) {
        truncated = true;
        break;
      }
      hits.push({
        path: rel || ".",
        line: lineNum,
        preview: preview.slice(0, 300),
      });
    }
  }
  return { hits, truncated };
}

function grepWithJs(
  root: string,
  target: string,
  input: GrepInput,
): { hits: GrepHit[]; truncated: boolean } {
  const hits: GrepHit[] = [];
  let truncated = false;
  const needle = input.caseSensitive ? input.query : input.query.toLowerCase();

  function walk(dir: string): boolean {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      if (DEFAULT_SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (walk(full)) return true;
      } else if (e.isFile()) {
        let content: string;
        try {
          content = fs.readFileSync(full, "utf8");
        } catch {
          continue;
        }
        if (content.indexOf("\0") !== -1) continue; // skip binaries
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const hay = input.caseSensitive ? lines[i] : lines[i].toLowerCase();
          if (hay.indexOf(needle) !== -1) {
            if (hits.length >= input.maxResults) {
              truncated = true;
              return true;
            }
            hits.push({
              path: path.relative(root, full),
              line: i + 1,
              preview: lines[i].slice(0, 300),
            });
          }
        }
      }
    }
    return false;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return { hits, truncated: false };
  }
  if (stat.isDirectory()) walk(target);
  else if (stat.isFile()) walk(path.dirname(target));

  return { hits, truncated };
}
