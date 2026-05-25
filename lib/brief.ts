import fs from "node:fs";
import path from "node:path";
import { resolveSafe } from "./fs-sandbox";

export const BRIEF_DIR = ".know-your-stuff";
export const BRIEF_FILENAME = "brief.md";

export function briefPath(projectRoot: string): string {
  return path.join(projectRoot, BRIEF_DIR, BRIEF_FILENAME);
}

export function loadBriefSync(projectRoot: string): string {
  const p = briefPath(projectRoot);
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

export function saveBriefSync(projectRoot: string, markdown: string): void {
  // Refuse to write through a pre-existing symlink at the brief dir. An
  // untrusted project (e.g. a third-party repo cloned for interview prep)
  // could ship `.know-your-stuff -> ~/.config` and turn brief saves into
  // arbitrary-write primitives. lstat detects the symlink without following it.
  const dir = path.join(projectRoot, BRIEF_DIR);
  try {
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Refusing to write through symlink at ${BRIEF_DIR}/. Delete or replace it before saving the brief.`,
      );
    }
  } catch (err) {
    // ENOENT is fine — directory will be created. Anything else propagates.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(briefPath(projectRoot), markdown, "utf8");
}

/**
 * Collect the small set of files used to seed a brief.
 * README, top-level *.md, package.json description, STRATEGY.md when present.
 */
export function collectBriefSeed(projectRoot: string): {
  readme: string | null;
  topLevelDocs: { path: string; content: string }[];
  packageDescription: string | null;
  strategy: string | null;
} {
  const readme = readIfExists(projectRoot, ["README.md", "readme.md", "README", "Readme.md"]);
  const strategy = readIfExists(projectRoot, ["STRATEGY.md"]);
  const packageDescription = (() => {
    try {
      const p = resolveSafe(projectRoot, "package.json");
      const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
      return typeof pkg.description === "string" ? pkg.description : null;
    } catch {
      return null;
    }
  })();

  const topLevelDocs: { path: string; content: string }[] = [];
  try {
    for (const dirent of fs.readdirSync(projectRoot, { withFileTypes: true })) {
      if (!dirent.isFile()) continue;
      if (!dirent.name.toLowerCase().endsWith(".md")) continue;
      if (dirent.name.toLowerCase() === "readme.md" || dirent.name === "STRATEGY.md") continue;
      try {
        const p = resolveSafe(projectRoot, dirent.name);
        const content = fs.readFileSync(p, "utf8");
        topLevelDocs.push({ path: dirent.name, content: content.slice(0, 8000) });
      } catch {}
    }
  } catch {}

  return { readme, topLevelDocs, packageDescription, strategy };
}

function readIfExists(root: string, names: string[]): string | null {
  for (const name of names) {
    try {
      const p = resolveSafe(root, name);
      const content = fs.readFileSync(p, "utf8");
      return content.slice(0, 20_000);
    } catch {}
  }
  return null;
}

export function buildBriefGenerationPrompt(projectName: string, seed: ReturnType<typeof collectBriefSeed>): string {
  return `
You are drafting a one-page "business brief" for the project "${projectName}". This brief will be the canonical reference the user uses to rehearse business-side answers in interviews.

Use the inputs below. Where they don't answer a section, write "TODO — fill in" rather than inventing facts.

Return Markdown with EXACTLY these sections (use the headers verbatim):

# Product
# Users
# Core Value
# Domain Lingo
# Key Flows
# Open Questions

Be concise — one to three short paragraphs or a tight bulleted list per section. The "Domain Lingo" section should be a glossary of terms (term — definition).

Inputs:

${seed.packageDescription ? `package.json description: ${seed.packageDescription}\n` : ""}
${seed.readme ? `README.md:\n\`\`\`\n${seed.readme}\n\`\`\`\n` : "(no README found)\n"}
${seed.strategy ? `STRATEGY.md:\n\`\`\`\n${seed.strategy}\n\`\`\`\n` : ""}
${
  seed.topLevelDocs.length
    ? `Other top-level docs:\n${seed.topLevelDocs
        .map((d) => `--- ${d.path} ---\n${d.content}`)
        .join("\n\n")}\n`
    : ""
}
`.trim();
}
