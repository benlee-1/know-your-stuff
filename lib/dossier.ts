import fs from "node:fs";
import path from "node:path";

export const DOSSIER_DIR = ".know-your-stuff";
export const DOSSIER_FILENAME = "dossier.md";

export function dossierPath(projectRoot: string): string {
  return path.join(projectRoot, DOSSIER_DIR, DOSSIER_FILENAME);
}

export function loadDossierSync(projectRoot: string): string {
  try {
    return fs.readFileSync(dossierPath(projectRoot), "utf8");
  } catch {
    return "";
  }
}

export function saveDossierSync(projectRoot: string, markdown: string): void {
  // Refuse to write through a pre-existing symlink at the dir. An untrusted
  // interview-prep repo could ship `.know-your-stuff -> ~/.config` and turn
  // dossier saves into an arbitrary-write primitive. lstat detects the symlink
  // without following it. (Mirrors saveBriefSync.)
  const dir = path.join(projectRoot, DOSSIER_DIR);
  try {
    if (fs.lstatSync(dir).isSymbolicLink()) {
      throw new Error(
        `Refusing to write through symlink at ${DOSSIER_DIR}/. Delete or replace it before saving the dossier.`,
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dossierPath(projectRoot), markdown, "utf8");
}

export interface DossierSection {
  id: string;
  title: string;
  prompt: string;
}

export const DOSSIER_SECTIONS: DossierSection[] = [
  {
    id: "problem-users",
    title: "Problem & Users",
    prompt:
      "What problem does this codebase solve, and who is it for? Identify the primary users/personas and the core value. Ground claims in README, package metadata, and entry points.",
  },
  {
    id: "requirements",
    title: "Requirements",
    prompt:
      "Infer the functional requirements (what it must do) and non-functional requirements (performance, security, reliability, compliance) from the code and configuration. Cite the files that imply each.",
  },
  {
    id: "architecture",
    title: "High-level Architecture",
    prompt:
      "Describe the major components/services/modules and how they connect (call direction, data stores, external dependencies). Cite the directories and entry points that establish the structure.",
  },
  {
    id: "data-model",
    title: "Data Model",
    prompt:
      "Describe the core entities, their fields/relationships, and how they are persisted (schemas, migrations, ORM models, table definitions). Cite the defining files.",
  },
  {
    id: "key-flows",
    title: "Key Flows",
    prompt:
      "Trace the one or two most important end-to-end flows (e.g. a primary request or job) from entry point through to persistence/response. Cite each hop's file.",
  },
  {
    id: "decisions-tradeoffs",
    title: "Decisions & Trade-offs",
    prompt:
      "Surface the non-obvious design decisions and their trade-offs, ADR-style. For each: what was chosen, a plausible alternative, and why this one. Cite the code that evidences the decision.",
  },
  {
    id: "scale-bottlenecks",
    title: "Scale & Bottlenecks",
    prompt:
      "Where would this strain under load, and what limits throughput/latency (N+1 queries, sync work, single instances, unbounded allocation)? Cite the code. If scale is not addressed in this repo, say 'not demonstrated in this repo'.",
  },
  {
    id: "failure-modes",
    title: "Failure Modes",
    prompt:
      "What can fail (external calls, bad input, partial writes) and how is it handled (retries, validation, transactions, timeouts)? Cite the handling code. If a failure mode is unaddressed, say so explicitly.",
  },
];
