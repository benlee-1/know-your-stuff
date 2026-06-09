# Repo Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a code-grounded, interview-dimension "dossier" Markdown doc for a local project, viewable / per-section-regenerable / editable in the existing Next.js app.

**Architecture:** Reuse the established brief pattern — pure helpers in `lib/`, thin `"use server"` actions that call the LLM. Generation drives the existing `makeCodebaseTools` (`list_dir`/`read_file`/`grep`) one bounded `generateText` call per section, against a fixed eight-section checklist. The dossier persists as `.know-your-stuff/dossier.md`, sibling of `brief.md`. Sequential generation continues on per-section failure (no half-written file). Spec: `docs/superpowers/specs/2026-06-08-repo-dossier-design.md`.

**Tech Stack:** Next.js (App Router, server actions), AI SDK v6 (`ai` — `generateText`, `tool`), `@ai-sdk/anthropic`, Zod, Vitest, Node `fs`.

**Reference-corpus note:** Per the user's global rules, the corpus was checked (`list_references` / `search_references` for agentic generation). No corpus exemplar matched closely; the nearest in spirit is `redteam-campaign-orchestrator-ts` (sequential per-item orchestration with continue-on-failure + a budget/cap gate). The actual exemplar is **in-repo**: `lib/brief.ts` `buildBriefGenerationPrompt` + `app/actions/brief.ts` `generateBriefMarkdown` + the Technical-mode `streamText`+`makeCodebaseTools`+`stopWhen` pattern (`app/api/chat/route.ts`). This plan adapts those.

---

## File Structure

- **Create `lib/dossier.ts`** — storage (`dossierPath`/`loadDossierSync`/`saveDossierSync` with symlink guard), the `DOSSIER_SECTIONS` checklist, and pure functions: `assembleDossier`, `parseDossierSections`, `upsertSection`, `runDossierGeneration` (sequential continue-on-failure orchestrator with injected per-section generator). No `ai`/Next imports → fully unit-testable.
- **Create `lib/prompts/dossier.ts`** — `buildDossierSectionPrompt`, carrying the Technical-mode grounding discipline (cite real paths; "not demonstrated in this repo" when absent).
- **Create `app/actions/dossier.ts`** — `"use server"`: `loadDossier`, `saveDossier`, `generateDossier`, `generateSection`. Wires the real LLM section generator into the pure orchestrator.
- **Create `components/dossier-view.tsx`** — client component: Generate (full run), per-section Regenerate, Edit (textarea + Save), renders via existing `components/markdown.tsx`.
- **Create `app/chat/[projectId]/dossier/page.tsx`** — server page; loads dossier, renders `DossierView`.
- **Modify `app/chat/[projectId]/page.tsx`** — add a "Dossier" nav link in the header (next to Brief/Quiz/History).
- **Create `__tests__/dossier.test.ts`** — storage round-trip + symlink guard, `assembleDossier`, `parseDossierSections`, `upsertSection`, `runDossierGeneration` (with fake generators).
- **Create `__tests__/dossier-prompts.test.ts`** — `buildDossierSectionPrompt` includes the section title, the grounding rules, and the "not demonstrated" instruction; omits/includes brief correctly.
- **Create `__tests__/dossier-acceptance.test.ts`** — live, opt-in (`describe.skipIf(!process.env.KYS_LIVE)`) acceptance gate: generate against `~/code/weekly-commit-module`, assert every cited path exists on disk.

---

## Task 1: Dossier storage helpers + section checklist

**Files:**
- Create: `lib/dossier.ts`
- Test: `__tests__/dossier.test.ts`

- [ ] **Step 1: Write the failing test (storage + sections)**

```ts
// __tests__/dossier.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  dossierPath,
  loadDossierSync,
  saveDossierSync,
  DOSSIER_SECTIONS,
} from "@/lib/dossier";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kys-dossier-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("dossier storage", () => {
  it("returns empty string when no dossier exists yet", () => {
    expect(loadDossierSync(root)).toBe("");
  });

  it("saveDossierSync creates .know-your-stuff/dossier.md", () => {
    saveDossierSync(root, "# Problem & Users\nHello");
    expect(fs.existsSync(dossierPath(root))).toBe(true);
    expect(loadDossierSync(root)).toContain("Hello");
  });

  it("saveDossierSync overwrites existing", () => {
    saveDossierSync(root, "v1");
    saveDossierSync(root, "v2");
    expect(loadDossierSync(root)).toBe("v2");
  });

  it("saveDossierSync refuses to write through a pre-existing .know-your-stuff symlink", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "kys-target-"));
    fs.symlinkSync(target, path.join(root, ".know-your-stuff"));
    expect(() => saveDossierSync(root, "x")).toThrow(/symlink/i);
    fs.rmSync(target, { recursive: true, force: true });
  });
});

describe("DOSSIER_SECTIONS", () => {
  it("lists the eight interview-dimension sections in order", () => {
    expect(DOSSIER_SECTIONS.map((s) => s.id)).toEqual([
      "problem-users",
      "requirements",
      "architecture",
      "data-model",
      "key-flows",
      "decisions-tradeoffs",
      "scale-bottlenecks",
      "failure-modes",
    ]);
    for (const s of DOSSIER_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.prompt.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/dossier.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dossier'`.

- [ ] **Step 3: Write minimal implementation (storage + sections)**

```ts
// lib/dossier.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/dossier.test.ts`
Expected: PASS (storage + DOSSIER_SECTIONS describe blocks).

- [ ] **Step 5: Commit**

```bash
git add lib/dossier.ts __tests__/dossier.test.ts
git commit -m "feat(dossier): storage helpers + eight-section checklist"
```

---

## Task 2: Pure markdown helpers — assemble, parse, upsert

**Files:**
- Modify: `lib/dossier.ts`
- Test: `__tests__/dossier.test.ts:` (append)

- [ ] **Step 1: Write the failing test**

Append to `__tests__/dossier.test.ts`:

```ts
import {
  assembleDossier,
  parseDossierSections,
  upsertSection,
} from "@/lib/dossier";

describe("assembleDossier", () => {
  it("joins sections under '# Title' headers", () => {
    const md = assembleDossier([
      { title: "Problem & Users", body: "It helps X." },
      { title: "Data Model", body: "One table." },
    ]);
    expect(md).toBe(
      "# Problem & Users\n\nIt helps X.\n\n# Data Model\n\nOne table.",
    );
  });
});

describe("parseDossierSections", () => {
  it("splits a dossier back into title/body pairs", () => {
    const md = "# Problem & Users\n\nIt helps X.\n\n# Data Model\n\nOne table.";
    expect(parseDossierSections(md)).toEqual([
      { title: "Problem & Users", body: "It helps X." },
      { title: "Data Model", body: "One table." },
    ]);
  });

  it("ignores content before the first header", () => {
    expect(parseDossierSections("preamble\n\n# A\n\nbody")).toEqual([
      { title: "A", body: "body" },
    ]);
  });
});

describe("upsertSection", () => {
  it("replaces an existing section's body in place", () => {
    const md = "# Problem & Users\n\nold\n\n# Data Model\n\nkeep";
    const out = upsertSection(md, "Problem & Users", "new");
    expect(out).toBe("# Problem & Users\n\nnew\n\n# Data Model\n\nkeep");
  });

  it("inserts a missing section in canonical DOSSIER_SECTIONS order", () => {
    // Data Model exists; insert Requirements, which canonically precedes it.
    const md = "# Data Model\n\nkeep";
    const out = upsertSection(md, "Requirements", "req body");
    expect(out).toBe("# Requirements\n\nreq body\n\n# Data Model\n\nkeep");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/dossier.test.ts`
Expected: FAIL — `assembleDossier`/`parseDossierSections`/`upsertSection` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/dossier.ts`:

```ts
export interface DossierSectionContent {
  title: string;
  body: string;
}

export function assembleDossier(sections: DossierSectionContent[]): string {
  return sections.map((s) => `# ${s.title}\n\n${s.body}`).join("\n\n");
}

export function parseDossierSections(markdown: string): DossierSectionContent[] {
  const lines = markdown.split("\n");
  const out: DossierSectionContent[] = [];
  let title: string | null = null;
  let body: string[] = [];
  const flush = () => {
    if (title !== null) out.push({ title, body: body.join("\n").trim() });
  };
  for (const line of lines) {
    const m = /^# (.+)$/.exec(line);
    if (m) {
      flush();
      title = m[1].trim();
      body = [];
    } else if (title !== null) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/dossier.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dossier.ts __tests__/dossier.test.ts
git commit -m "feat(dossier): assemble/parse/upsert markdown helpers"
```

---

## Task 3: Sequential continue-on-failure orchestrator

**Files:**
- Modify: `lib/dossier.ts`
- Test: `__tests__/dossier.test.ts:` (append)

- [ ] **Step 1: Write the failing test**

Append to `__tests__/dossier.test.ts`:

```ts
import { runDossierGeneration } from "@/lib/dossier";

describe("runDossierGeneration", () => {
  it("generates every section in order via the injected generator", async () => {
    const sections = [
      { id: "a", title: "A", prompt: "pa" },
      { id: "b", title: "B", prompt: "pb" },
    ];
    const { results, failedSectionIds } = await runDossierGeneration(
      sections,
      async (s) => `body-${s.id}`,
    );
    expect(failedSectionIds).toEqual([]);
    expect(results).toEqual([
      { id: "a", title: "A", body: "body-a" },
      { id: "b", title: "B", body: "body-b" },
    ]);
  });

  it("skips a failing section and continues, recording its id", async () => {
    const sections = [
      { id: "a", title: "A", prompt: "pa" },
      { id: "b", title: "B", prompt: "pb" },
      { id: "c", title: "C", prompt: "pc" },
    ];
    const { results, failedSectionIds } = await runDossierGeneration(
      sections,
      async (s) => {
        if (s.id === "b") throw new Error("429");
        return `body-${s.id}`;
      },
    );
    expect(failedSectionIds).toEqual(["b"]);
    expect(results.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("reports progress through the optional onProgress callback", async () => {
    const seen: string[] = [];
    await runDossierGeneration(
      [{ id: "a", title: "A", prompt: "pa" }],
      async (s) => `body-${s.id}`,
      (p) => seen.push(`${p.index + 1}/${p.total}:${p.id}:${p.status}`),
    );
    expect(seen).toContain("1/1:a:done");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/dossier.test.ts`
Expected: FAIL — `runDossierGeneration` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/dossier.ts`:

```ts
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
 * returned (successful) results. Mirrors the redteam orchestrator's
 * continue-on-failure gate; sequential keeps per-call cost predictable.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/dossier.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dossier.ts __tests__/dossier.test.ts
git commit -m "feat(dossier): sequential continue-on-failure generation orchestrator"
```

---

## Task 4: Per-section generation prompt

**Files:**
- Create: `lib/prompts/dossier.ts`
- Test: `__tests__/dossier-prompts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/dossier-prompts.test.ts
import { describe, it, expect } from "vitest";
import { buildDossierSectionPrompt } from "@/lib/prompts/dossier";

describe("buildDossierSectionPrompt", () => {
  const base = {
    projectName: "weekly-commit-module",
    sectionTitle: "High-level Architecture",
    sectionPrompt: "Describe the major components.",
    briefMarkdown: "",
  };

  it("names the project, the section, and the section instruction", () => {
    const p = buildDossierSectionPrompt(base);
    expect(p).toContain("weekly-commit-module");
    expect(p).toContain("High-level Architecture");
    expect(p).toContain("Describe the major components.");
  });

  it("carries the grounding discipline (cite paths, no guessing)", () => {
    const p = buildDossierSectionPrompt(base).toLowerCase();
    expect(p).toContain("list_dir");
    expect(p).toContain("grep");
    expect(p).toContain("read_file");
    expect(p).toContain("cite");
    expect(p).toContain("not demonstrated in this repo");
  });

  it("notes when no brief is available", () => {
    expect(buildDossierSectionPrompt(base)).toMatch(/no business brief/i);
  });

  it("includes the brief when provided", () => {
    const p = buildDossierSectionPrompt({ ...base, briefMarkdown: "# Product\nWidgets" });
    expect(p).toContain("Widgets");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/dossier-prompts.test.ts`
Expected: FAIL — `Cannot find module '@/lib/prompts/dossier'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/prompts/dossier.ts
export interface DossierSectionPromptContext {
  projectName: string;
  sectionTitle: string;
  sectionPrompt: string;
  briefMarkdown: string;
}

export function buildDossierSectionPrompt(ctx: DossierSectionPromptContext): string {
  return `
You are writing ONE section of an interview-prep "dossier" for the project "${ctx.projectName}". The section is: **${ctx.sectionTitle}**.

Section objective:
${ctx.sectionPrompt}

Ground every claim in the actual codebase:
1. Use \`list_dir\` to orient yourself.
2. Use \`grep\` to locate symbols, patterns, configuration.
3. Use \`read_file\` to confirm specifics before stating them.
4. **Cite file paths** (and line numbers when relevant) for every substantive claim.
5. If the codebase does not provide evidence for part of this section, write "not demonstrated in this repo" for that part. NEVER guess or invent facts, architecture, or scale that the code does not show.

Output rules:
- Return ONLY the Markdown body for this one section. Do NOT include the "# ${ctx.sectionTitle}" header — it is added for you.
- Be concise: tight prose or bullets a senior interviewer would respect. No preamble, no sign-off.

Optional context (business brief):
${ctx.briefMarkdown.trim() ? ctx.briefMarkdown : "(No business brief available — work from the code only.)"}
`.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/dossier-prompts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/prompts/dossier.ts __tests__/dossier-prompts.test.ts
git commit -m "feat(dossier): per-section generation prompt with grounding discipline"
```

---

## Task 5: Server actions — load/save/generate

**Files:**
- Create: `app/actions/dossier.ts`
- (No new unit test — these are thin LLM-wiring actions; covered by the Task 9 live acceptance gate. The pure logic they call is already tested in Tasks 1–4.)

- [ ] **Step 1: Write the implementation**

```ts
// app/actions/dossier.ts
"use server";

import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { getProjectRaw } from "@/lib/projects";
import { loadBriefSync } from "@/lib/brief";
import { makeCodebaseTools } from "@/lib/codebase-tools-ai";
import { buildDossierSectionPrompt } from "@/lib/prompts/dossier";
import {
  DOSSIER_SECTIONS,
  type DossierSection,
  assembleDossier,
  loadDossierSync,
  saveDossierSync,
  runDossierGeneration,
  upsertSection,
} from "@/lib/dossier";

export async function loadDossier(projectId: string): Promise<string> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  return loadDossierSync(p.rootPath);
}

export async function saveDossier(projectId: string, markdown: string): Promise<void> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  saveDossierSync(p.rootPath, markdown);
}

// One bounded agentic pass producing a single section's body. Same engine the
// Technical chat mode uses: codebase tools + a step cap.
async function generateSectionBody(args: {
  rootPath: string;
  projectName: string;
  brief: string;
  section: DossierSection;
}): Promise<string> {
  const tools = makeCodebaseTools(args.rootPath, {
    enable: { list_dir: true, read_file: true, grep: true },
  });
  const res = await generateText({
    model: getModel(),
    system: buildDossierSectionPrompt({
      projectName: args.projectName,
      sectionTitle: args.section.title,
      sectionPrompt: args.section.prompt,
      briefMarkdown: args.brief,
    }),
    prompt: `Write the "${args.section.title}" section now.`,
    tools,
    stopWhen: ({ steps }) => steps.length >= 12,
  });
  return res.text.trim();
}

export async function generateDossier(
  projectId: string,
): Promise<{ markdown: string; failedSectionIds: string[] }> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const brief = loadBriefSync(p.rootPath);

  const { results, failedSectionIds } = await runDossierGeneration(
    DOSSIER_SECTIONS,
    (section) =>
      generateSectionBody({ rootPath: p.rootPath, projectName: p.name, brief, section }),
  );

  const markdown = assembleDossier(results);
  saveDossierSync(p.rootPath, markdown);
  return { markdown, failedSectionIds };
}

export async function generateSection(
  projectId: string,
  sectionId: string,
): Promise<string> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const section = DOSSIER_SECTIONS.find((s) => s.id === sectionId);
  if (!section) throw new Error(`Unknown section: ${sectionId}`);

  const brief = loadBriefSync(p.rootPath);
  const body = await generateSectionBody({
    rootPath: p.rootPath,
    projectName: p.name,
    brief,
    section,
  });

  const existing = loadDossierSync(p.rootPath);
  const updated = upsertSection(existing, section.title, body);
  saveDossierSync(p.rootPath, updated);
  return updated;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add app/actions/dossier.ts
git commit -m "feat(dossier): server actions — load/save/generate full + per-section"
```

---

## Task 6: Dossier view component + page (baseline: generate & view)

**Files:**
- Create: `components/dossier-view.tsx`
- Create: `app/chat/[projectId]/dossier/page.tsx`

- [ ] **Step 1: Write the view component**

```tsx
// components/dossier-view.tsx
"use client";

import { useState, useTransition } from "react";
import {
  generateDossier,
  generateSection,
  saveDossier,
} from "@/app/actions/dossier";
import { Markdown } from "@/components/markdown";
import { DOSSIER_SECTIONS } from "@/lib/dossier";

export function DossierView({
  projectId,
  initial,
}: {
  projectId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function regenerateAll() {
    setStatus("Generating… this runs eight agentic passes and may take a minute.");
    startTransition(async () => {
      try {
        const { markdown, failedSectionIds } = await generateDossier(projectId);
        setValue(markdown);
        setStatus(
          failedSectionIds.length
            ? `Done, but these sections failed and need a retry: ${failedSectionIds.join(", ")}`
            : "Dossier generated from repo.",
        );
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed to generate");
      }
    });
  }

  function regenerateOne(sectionId: string, title: string) {
    setStatus(`Regenerating "${title}"…`);
    startTransition(async () => {
      try {
        const updated = await generateSection(projectId, sectionId);
        setValue(updated);
        setStatus(`Regenerated "${title}".`);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed to regenerate section");
      }
    });
  }

  function save() {
    setStatus(null);
    startTransition(async () => {
      try {
        await saveDossier(projectId, value);
        setEditing(false);
        setStatus("Saved.");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  const empty = value.trim().length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={regenerateAll}
          disabled={pending}
          className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
        >
          {empty ? "Generate from repo" : "Regenerate all"}
        </button>
        <button
          onClick={() => setEditing((e) => !e)}
          disabled={pending || empty}
          className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm disabled:opacity-50"
        >
          {editing ? "View" : "Edit"}
        </button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>

      {!empty && !editing && (
        <div className="flex flex-wrap gap-2">
          {DOSSIER_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => regenerateOne(s.id, s.title)}
              disabled={pending}
              className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-xs text-muted-foreground disabled:opacity-50"
              title={`Regenerate the "${s.title}" section`}
            >
              ↻ {s.title}
            </button>
          ))}
        </div>
      )}

      {editing ? (
        <div className="space-y-3">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            className="h-[60vh] w-full rounded-md border border-[hsl(var(--border))] bg-transparent p-4 font-mono text-sm outline-none focus:border-[hsl(var(--primary))] disabled:opacity-60"
          />
          <button
            onClick={save}
            disabled={pending}
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            {pending ? "…" : "Save"}
          </button>
        </div>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">
          No dossier yet. Click "Generate from repo" to build one (eight grounded sections).
        </p>
      ) : (
        <article className="prose prose-invert max-w-none">
          <Markdown content={value} />
        </article>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the Markdown component's prop name**

Run: `grep -n "export function Markdown\|content\|children" components/markdown.tsx`
Expected: confirms the prop. If the component takes `children` rather than `content`, change `<Markdown content={value} />` to `<Markdown>{value}</Markdown>` and the import usage accordingly. (Do not assume — match the real signature.)

- [ ] **Step 3: Write the page**

```tsx
// app/chat/[projectId]/dossier/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/app/actions/projects";
import { loadDossier } from "@/app/actions/dossier";
import { DossierView } from "@/components/dossier-view";

export default async function DossierPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const dossier = await loadDossier(projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Link
          href={`/chat/${projectId}`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← back to chat
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Dossier</h1>
        <p className="text-sm text-muted-foreground">
          {project.name} — {project.rootPath}
        </p>
      </header>
      <DossierView projectId={projectId} initial={dossier} />
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/dossier-view.tsx "app/chat/[projectId]/dossier/page.tsx"
git commit -m "feat(dossier): view/edit/regenerate UI + page"
```

---

## Task 7: Add the Dossier nav link

**Files:**
- Modify: `app/chat/[projectId]/page.tsx` (the header link group, before the `Brief` link)

- [ ] **Step 1: Add the link**

In `app/chat/[projectId]/page.tsx`, inside the `<div className="flex items-center gap-3">` header group, add immediately before the existing `Brief` link:

```tsx
          <Link
            href={`/chat/${projectId}/dossier`}
            className="text-sm text-muted-foreground hover:underline"
          >
            Dossier
          </Link>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/chat/[projectId]/page.tsx"
git commit -m "feat(dossier): link Dossier from the project header nav"
```

---

## Task 8: Full unit-suite green

**Files:** none (verification task)

- [ ] **Step 1: Run the whole unit suite**

Run: `pnpm vitest run`
Expected: PASS — all existing tests plus `dossier.test.ts` and `dossier-prompts.test.ts`.

- [ ] **Step 2: Build check**

Run: `pnpm build`
Expected: Next build succeeds (the new route compiles, no type errors). If `pnpm build` requires env that isn't present locally, fall back to `pnpm exec tsc --noEmit` and `pnpm lint`.

- [ ] **Step 3: Commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "test(dossier): suite + build green"
```

---

## Task 9: Live acceptance gate — drive it against weekly-commit-module

This is the spec's verification requirement: *verify by driving the real interaction and asserting outcomes — every cited path must exist on disk.* It hits the paid API, so it is opt-in via `KYS_LIVE=1` and never runs in the default suite.

**Files:**
- Create: `__tests__/dossier-acceptance.test.ts`

- [ ] **Step 1: Write the opt-in acceptance test**

```ts
// __tests__/dossier-acceptance.test.ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DOSSIER_SECTIONS,
  runDossierGeneration,
  assembleDossier,
} from "@/lib/dossier";
import { buildDossierSectionPrompt } from "@/lib/prompts/dossier";
import { makeCodebaseTools } from "@/lib/codebase-tools-ai";
import { getModel } from "@/lib/ai";
import { generateText } from "ai";

const LIVE = process.env.KYS_LIVE === "1";
const TARGET =
  process.env.KYS_TARGET ?? path.join(os.homedir(), "code", "weekly-commit-module");

// Extract `path/like/this.ext` or `path/like/this.ext:123` tokens from prose.
function citedPaths(markdown: string): string[] {
  const re = /(?:^|[\s(`"'])([\w./-]+\.[A-Za-z0-9]+)(?::\d+)?/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const p = m[1];
    if (p.includes("/") || p.startsWith(".")) out.add(p); // skip bare "X.y" words
  }
  return [...out];
}

describe.skipIf(!LIVE)("dossier live acceptance (KYS_LIVE=1)", () => {
  it(
    "generates a grounded dossier whose cited paths exist on disk",
    async () => {
      expect(fs.existsSync(TARGET)).toBe(true);

      const { results, failedSectionIds } = await runDossierGeneration(
        DOSSIER_SECTIONS,
        async (section) => {
          const tools = makeCodebaseTools(TARGET, {
            enable: { list_dir: true, read_file: true, grep: true },
          });
          const res = await generateText({
            model: getModel(),
            system: buildDossierSectionPrompt({
              projectName: "weekly-commit-module",
              sectionTitle: section.title,
              sectionPrompt: section.prompt,
              briefMarkdown: "",
            }),
            prompt: `Write the "${section.title}" section now.`,
            tools,
            stopWhen: ({ steps }) => steps.length >= 12,
          });
          return res.text.trim();
        },
      );

      expect(failedSectionIds).toEqual([]);
      const markdown = assembleDossier(results);
      expect(markdown.length).toBeGreaterThan(200);

      // Every cited path must resolve inside the target repo.
      const cited = citedPaths(markdown);
      const missing = cited.filter((p) => !fs.existsSync(path.join(TARGET, p)));
      expect(
        missing,
        `Hallucinated/incorrect cited paths:\n${missing.join("\n")}`,
      ).toEqual([]);
    },
    300_000,
  );
});
```

- [ ] **Step 2: Run it (manual gate — costs API tokens)**

Run: `KYS_LIVE=1 pnpm vitest run __tests__/dossier-acceptance.test.ts`
Expected: PASS — `missing` is empty (every cited path exists). If paths are missing, the generator is hallucinating: tighten the grounding prompt (Task 4) and re-run before declaring done. Inspect the generated dossier and confirm thin dimensions (Scale/Failure Modes for a Java/Nx repo) degraded to "not demonstrated in this repo" rather than inventing.

- [ ] **Step 3: Confirm the default suite still skips it**

Run: `pnpm vitest run`
Expected: PASS; the acceptance test reports as skipped (no `KYS_LIVE`).

- [ ] **Step 4: Commit**

```bash
git add __tests__/dossier-acceptance.test.ts
git commit -m "test(dossier): opt-in live acceptance — cited paths must exist on disk"
```

---

## Task 10: Open the PR

**Files:** none

- [ ] **Step 1: Push the branch**

Run: `git push -u origin feat/repo-dossier`

- [ ] **Step 2: Open the PR**

Run:
```bash
gh pr create --title "feat: repo dossier — code-grounded interview-prep understanding doc" \
  --body "Implements the dossier (subsystem #1 of 5). Spec: docs/superpowers/specs/2026-06-08-repo-dossier-design.md. Plan: docs/superpowers/plans/2026-06-08-repo-dossier.md.

Generates an eight-section, code-grounded dossier per project via the existing agentic codebase tools, persisted to .know-your-stuff/dossier.md. View / per-section regenerate / edit in-app. Sequential generation continues on per-section failure; live acceptance gate asserts every cited path exists on disk.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review

- **Spec coverage:** Eight sections (Task 1) ✓; section-by-section grounded generation (Tasks 4–5) ✓; `.know-your-stuff/dossier.md` sibling + symlink guard (Task 1) ✓; graceful "not demonstrated" degradation (Task 4 prompt + Task 9 assertion) ✓; continue-on-failure / no half-written file (Task 3 + Task 5 assemble-at-end) ✓; view / per-section regenerate / edit UI (Task 6) ✓; nav link (Task 7) ✓; unit tests mirroring brief/quiz (Tasks 1–3) ✓; live path-existence acceptance gate (Task 9) ✓; reference-corpus check reported (header) ✓; no DB changes ✓.
- **Placeholder scan:** No TBD/TODO; every code step shows full code; the only "verify the signature" step (Task 6 Step 2) is a deliberate guard against assuming `Markdown`'s prop name, with the exact fix spelled out.
- **Type consistency:** `DossierSection {id,title,prompt}`, `DossierSectionContent {title,body}`, `DossierGenResult {id,title,body}`, `runDossierGeneration(sections, generateOne, onProgress?)`, `upsertSection(markdown,title,newBody)`, `generateDossier → {markdown,failedSectionIds}`, `generateSection → string` are used identically across Tasks 1–9. ✓
- **Scope:** Dossier subsystem only; learning modes deferred (spec roadmap). ✓
```
