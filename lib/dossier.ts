/**
 * A section body is usable if the model actually wrote something. Empty /
 * whitespace-only output means the model ended in a tool-call loop without
 * writing the section (step budget exhausted) — that must count as a failure,
 * not a silent success. Note: a short but real body like
 * "not demonstrated in this repo" IS usable, so only reject empty/whitespace.
 */
export function isUsableSectionText(text: string): boolean {
  return text.trim().length > 0;
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

export interface DossierSectionContent {
  title: string;
  body: string;
}

export function assembleDossier(sections: DossierSectionContent[]): string {
  return sections.map((s) => `# ${s.title}\n\n${s.body}`).join("\n\n");
}

export function parseDossierSections(markdown: string): DossierSectionContent[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: DossierSectionContent[] = [];
  let title: string | null = null;
  let body: string[] = [];
  let inFence = false;
  const flush = () => {
    if (title !== null) out.push({ title, body: body.join("\n").trim() });
  };
  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
    }
    if (!inFence) {
      const m = /^# (.+)$/.exec(line);
      if (m) {
        flush();
        title = m[1].trim();
        body = [];
        continue;
      }
    }
    if (title !== null) {
      body.push(line);
    }
  }
  flush();
  return out;
}

export function upsertSection(
  markdown: string,
  title: string,
  newBody: string,
): string {
  const existing = parseDossierSections(markdown);
  if (existing.some((s) => s.title === title)) {
    return assembleDossier(
      existing.map((s) => (s.title === title ? { title, body: newBody } : s)),
    );
  }
  // Insert in canonical order. Build the desired title order from
  // DOSSIER_SECTIONS, keep only titles that are present-or-being-inserted.
  const order = DOSSIER_SECTIONS.map((s) => s.title);
  const byTitle = new Map(existing.map((s) => [s.title, s.body]));
  byTitle.set(title, newBody);
  const merged: DossierSectionContent[] = [];
  for (const t of order) {
    if (byTitle.has(t)) {
      merged.push({ title: t, body: byTitle.get(t)! });
      byTitle.delete(t);
    }
  }
  // Any titles not in canonical order (e.g. hand-added) keep their tail position.
  for (const s of existing) {
    if (byTitle.has(s.title)) {
      merged.push({ title: s.title, body: byTitle.get(s.title)! });
      byTitle.delete(s.title);
    }
  }
  return assembleDossier(merged);
}

export interface DossierGenResult {
  id: string;
  title: string;
  body: string;
}

export interface DossierProgress {
  index: number;
  total: number;
  id: string;
  title: string;
  status: "start" | "done" | "failed";
}

/**
 * Generate every section sequentially. A section whose generator throws is
 * skipped (its id recorded in failedSectionIds) so a transient 429/5xx never
 * aborts the whole run or leaves a half-written file. Callers assemble only the
 * returned (successful) results. Sequential keeps per-call cost predictable.
 */
export async function runDossierGeneration(
  sections: DossierSection[],
  generateOne: (section: DossierSection) => Promise<string>,
  onProgress?: (p: DossierProgress) => void,
): Promise<{ results: DossierGenResult[]; failedSectionIds: string[] }> {
  const results: DossierGenResult[] = [];
  const failedSectionIds: string[] = [];
  for (let index = 0; index < sections.length; index++) {
    const s = sections[index];
    const base = { index, total: sections.length, id: s.id, title: s.title };
    onProgress?.({ ...base, status: "start" });
    try {
      const body = await generateOne(s);
      results.push({ id: s.id, title: s.title, body });
      onProgress?.({ ...base, status: "done" });
    } catch {
      failedSectionIds.push(s.id);
      onProgress?.({ ...base, status: "failed" });
    }
  }
  return { results, failedSectionIds };
}
