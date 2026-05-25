import fs from "node:fs";
import path from "node:path";

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

/**
 * Resolve `candidate` against `root` and assert the result stays inside `root`.
 *
 * Why: every codebase-tool entry point goes through here. If this is correct,
 * the model cannot read outside the chosen project root via tool calls.
 */
export function resolveSafe(root: string, candidate: string): string {
  if (candidate.indexOf("\0") !== -1) {
    throw new SandboxError("Path contains a null byte.");
  }

  const absRoot = path.resolve(root);
  let realRoot = absRoot;
  try {
    realRoot = fs.realpathSync(absRoot);
  } catch {
    // root must exist; let caller's first FS op surface the error
  }

  const joined = path.isAbsolute(candidate) ? candidate : path.join(absRoot, candidate);
  const resolved = path.resolve(joined);

  let real = resolved;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    // Path may not yet exist (e.g., a write target). That's OK — we still
    // validate the lexical path against both forms of the root.
  }

  const insideLexical = isInside(absRoot, resolved) || isInside(realRoot, resolved);
  const insideReal = isInside(absRoot, real) || isInside(realRoot, real);
  if (!insideLexical || !insideReal) {
    throw new SandboxError(`Path escapes sandbox root: ${candidate}`);
  }

  return real;
}

function isInside(root: string, target: string): boolean {
  if (target === root) return true;
  return target.startsWith(root + path.sep);
}
