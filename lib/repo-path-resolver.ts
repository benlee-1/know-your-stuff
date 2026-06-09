import fs from "node:fs";
import path from "node:path";
import { citedPaths } from "./cited-paths";

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".nx",
  ".next",
  "dist",
  "build",
  "target",
  "out",
  "coverage",
]);

/** Index every file basename in the repo, skipping vendored/build dirs. */
export function buildBasenameIndex(root: string): Set<string> {
  const index = new Set<string>();
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name)) stack.push(path.join(dir, e.name));
      } else if (e.isFile()) {
        index.add(e.name);
      }
    }
  }
  return index;
}

// A token that fails resolution is NOT a hallucination if it's:
//  - a CDN/version URL fragment (leading `N.N…`)
//  - a bare file extension named in prose (`.jsx`)
//  - an external CDN bundle file (`.min.` / `.development.` / `.production.` infix)
//  - a prose list of tool/library names containing an ALL-CAPS segment (e.g.
//    "Vite/CRA/Next.js"); real repos almost never have an all-caps path segment.
// Applied ONLY after resolution fails, so a real file is never dropped.
function isExternalOrProse(token: string): boolean {
  if (/^\d+\.\d+/.test(token)) return true;
  if (/^\.\w+$/.test(token)) return true;
  if (/\.(min|development|production)\./i.test(token)) return true;
  if (token.split("/").some((seg) => /^[A-Z]{2,}$/.test(seg))) return true;
  return false;
}

/**
 * Cited tokens with no corresponding real file in the repo — likely
 * hallucinations. A token resolves if it exists at the root-join path OR its
 * basename exists anywhere in the repo (bare-filename citations are real, just
 * imprecise). External/prose tokens that fail resolution are excluded, not
 * reported.
 *
 * Only MULTI-SEGMENT paths (containing "/") that remain unresolved are reported
 * as likely hallucinations. Bare unresolved filenames (e.g. `remoteEntry.js`,
 * `react.development.js`) are treated as external/generated artifacts — they
 * make no in-repo-path claim and are non-blocking.
 */
export function unresolvedCitedPaths(root: string, markdown: string): string[] {
  const index = buildBasenameIndex(root);
  const missing: string[] = [];
  for (const token of citedPaths(markdown)) {
    if (fs.existsSync(path.join(root, token))) continue;
    const base = token.split("/").pop() ?? token;
    if (index.has(base)) continue;
    if (isExternalOrProse(token)) continue;
    // Only report multi-segment paths — a bare unresolved filename is likely an
    // external/generated artifact, not a checkable in-repo hallucination.
    if (!token.includes("/")) continue;
    missing.push(token);
  }
  return missing;
}
