# Guided Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mastery-gated, section-by-section tour of the dossier — generate a comprehension question per section, grade the answer, gate advancement on a threshold, and persist/resume progress.

**Architecture:** Reuse the dossier's `parseDossierSections` and the quiz's structured-grading pattern. Question generation and grading are tools-free `generateObject` calls (the dossier section text is the only context needed). Per-section progress lives in a new `walkthrough_progress` table; the current section is derived from `DOSSIER_SECTIONS` order. Pure gate logic is isolated and unit-tested. Spec: `docs/superpowers/specs/2026-06-08-guided-walkthrough-design.md`.

**Tech Stack:** Next.js (App Router, server actions), AI SDK v6 (`generateObject`), `@ai-sdk/anthropic`, Zod, `node:sqlite` (via `lib/db.ts`), Vitest.

**Reference-corpus note:** Corpus checked. Closest match `llm-judge-agent-ts` (structured eval/grading output). The actual exemplar is in-repo: `QuizGradeSchema` + the `generateObject` format step in `app/actions/quiz.ts`, and `lib/db.ts` migrations. This plan adapts those. Walkthrough grading is tools-free (single `generateObject`), unlike quiz grading which is two-phase to verify code citations — the dossier section text needs no code verification.

---

## File Structure

- **Modify `lib/schema.ts`** — add `WalkthroughProgressSchema`.
- **Modify `lib/db.ts`** — add migration `002_walkthrough_progress`.
- **Create `lib/walkthrough.ts`** — pure: `GATE_THRESHOLD`, `gateDecision`, `computeCurrentSectionId`, `mergeProgress`; DB: `getProgress`, `upsertProgress`.
- **Create `lib/grade.ts`** — `GradeSchema`, `gradeFreeTextAnswer` (tools-free `generateObject`).
- **Create `lib/prompts/walkthrough.ts`** — `WalkthroughQuestionSchema`, `buildWalkthroughQuestionPrompt`, `buildGradePrompt`.
- **Create `app/actions/walkthrough.ts`** — `loadWalkthroughState`, `generateSectionQuestion`, `submitWalkthroughAnswer`.
- **Create `components/walkthrough-runner.tsx`** — client UI.
- **Create `app/chat/[projectId]/walkthrough/page.tsx`** — page.
- **Modify `app/chat/[projectId]/page.tsx`** — add "Walkthrough" nav link.
- **Create** `__tests__/walkthrough.test.ts`, `__tests__/walkthrough-prompts.test.ts`, `__tests__/walkthrough-acceptance.test.ts`.

---

## Task 1: Schema + migration + progress storage

**Files:**
- Modify: `lib/schema.ts`
- Modify: `lib/db.ts`
- Create: `lib/walkthrough.ts`
- Test: `__tests__/walkthrough.test.ts`

- [ ] **Step 1: Add the schema type** to `lib/schema.ts` (append):

```ts
export const WalkthroughProgressSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sectionId: z.string(),
  passed: z.boolean(),
  bestScore: z.number().min(0).max(1),
  attempts: z.number().int().min(0),
  updatedAt: z.number(),
});
export type WalkthroughProgress = z.infer<typeof WalkthroughProgressSchema>;
```

- [ ] **Step 2: Add the migration** to the `MIGRATIONS` array in `lib/db.ts` (after `001_init`):

```ts
  {
    name: "002_walkthrough_progress",
    sql: `
      CREATE TABLE walkthrough_progress (
        id         TEXT PRIMARY KEY,
        projectId  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        sectionId  TEXT NOT NULL,
        passed     INTEGER NOT NULL,
        bestScore  REAL NOT NULL,
        attempts   INTEGER NOT NULL,
        updatedAt  INTEGER NOT NULL,
        UNIQUE(projectId, sectionId)
      );
    `,
  },
```

- [ ] **Step 3: Write the failing storage test** `__tests__/walkthrough.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import { addProjectRaw } from "@/lib/projects";
import { getProgress, upsertProgress } from "@/lib/walkthrough";

let dbPath: string;
let projectId: string;
let projectRoot: string;

beforeEach(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kys-wt-")), "db.sqlite");
  process.env.KYS_DB_PATH = dbPath;
  _resetDbForTests();
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kys-wt-proj-"));
  projectId = addProjectRaw({ name: "p", rootPath: projectRoot }).id;
});
afterEach(() => {
  _resetDbForTests();
  delete process.env.KYS_DB_PATH;
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe("walkthrough progress storage", () => {
  it("returns [] when no progress yet", () => {
    expect(getProgress(projectId)).toEqual([]);
  });

  it("upsertProgress inserts then updates the same (project, section) row", () => {
    upsertProgress(projectId, "architecture", { passed: false, bestScore: 0.4, attempts: 1 });
    let rows = getProgress(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sectionId: "architecture",
      passed: false,
      bestScore: 0.4,
      attempts: 1,
    });

    upsertProgress(projectId, "architecture", { passed: true, bestScore: 0.9, attempts: 2 });
    rows = getProgress(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ passed: true, bestScore: 0.9, attempts: 2 });
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm vitest run __tests__/walkthrough.test.ts`
Expected: FAIL — `Cannot find module '@/lib/walkthrough'`.

- [ ] **Step 5: Implement the storage half of `lib/walkthrough.ts`**

```ts
import { randomUUID } from "node:crypto";
import { getDb, toPlainArray } from "./db";
import type { WalkthroughProgress } from "./schema";

export function getProgress(projectId: string): WalkthroughProgress[] {
  const rows = getDb()
    .prepare("SELECT * FROM walkthrough_progress WHERE projectId = ?")
    .all(projectId) as Array<Omit<WalkthroughProgress, "passed"> & { passed: number }>;
  return toPlainArray(rows).map((r) => ({ ...r, passed: !!r.passed }));
}

export function upsertProgress(
  projectId: string,
  sectionId: string,
  v: { passed: boolean; bestScore: number; attempts: number },
): void {
  getDb()
    .prepare(
      `INSERT INTO walkthrough_progress (id, projectId, sectionId, passed, bestScore, attempts, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(projectId, sectionId) DO UPDATE SET
         passed = excluded.passed,
         bestScore = excluded.bestScore,
         attempts = excluded.attempts,
         updatedAt = excluded.updatedAt`,
    )
    .run(randomUUID(), projectId, sectionId, v.passed ? 1 : 0, v.bestScore, v.attempts, Date.now());
}
```

Note: `toPlainArray` is already exported from `lib/db.ts` (used by `lib/quiz.ts`). If `getDb`/`toPlainArray` import names differ, match the real exports in `lib/db.ts`.

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm vitest run __tests__/walkthrough.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/schema.ts lib/db.ts lib/walkthrough.ts __tests__/walkthrough.test.ts
git commit -m "feat(walkthrough): progress table + storage helpers"
```

---

## Task 2: Pure gate logic — gateDecision, mergeProgress, computeCurrentSectionId

**Files:**
- Modify: `lib/walkthrough.ts`
- Test: `__tests__/walkthrough.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

```ts
import {
  GATE_THRESHOLD,
  gateDecision,
  mergeProgress,
  computeCurrentSectionId,
} from "@/lib/walkthrough";
import { DOSSIER_SECTIONS } from "@/lib/dossier";

describe("gateDecision", () => {
  it("attempt 1 pass -> advance, no reveal", () => {
    expect(gateDecision(0.8, 1)).toEqual({ passed: true, reveal: false, advance: true });
  });
  it("attempt 1 miss -> reveal, no advance", () => {
    expect(gateDecision(0.5, 1)).toEqual({ passed: false, reveal: true, advance: false });
  });
  it("attempt 2 always advances; passed reflects the threshold", () => {
    expect(gateDecision(0.9, 2)).toEqual({ passed: true, reveal: false, advance: true });
    expect(gateDecision(0.3, 2)).toEqual({ passed: false, reveal: false, advance: true });
  });
  it("uses GATE_THRESHOLD as the boundary (inclusive)", () => {
    expect(gateDecision(GATE_THRESHOLD, 1).passed).toBe(true);
  });
});

describe("mergeProgress", () => {
  it("from no prior row: records the attempt", () => {
    expect(mergeProgress(null, 0.4, false)).toEqual({ passed: false, bestScore: 0.4, attempts: 1 });
  });
  it("keeps the best score, increments attempts, ORs passed", () => {
    const prev = { passed: false, bestScore: 0.4, attempts: 1 };
    expect(mergeProgress(prev, 0.9, true)).toEqual({ passed: true, bestScore: 0.9, attempts: 2 });
  });
  it("does not lower bestScore or un-pass", () => {
    const prev = { passed: true, bestScore: 0.9, attempts: 1 };
    expect(mergeProgress(prev, 0.2, false)).toEqual({ passed: true, bestScore: 0.9, attempts: 2 });
  });
});

describe("computeCurrentSectionId", () => {
  it("first section when no progress", () => {
    expect(computeCurrentSectionId([])).toBe(DOSSIER_SECTIONS[0].id);
  });
  it("first not-passed section in canonical order", () => {
    const progress = [
      { sectionId: DOSSIER_SECTIONS[0].id, passed: true },
      { sectionId: DOSSIER_SECTIONS[1].id, passed: false },
    ] as any;
    expect(computeCurrentSectionId(progress)).toBe(DOSSIER_SECTIONS[1].id);
  });
  it("null when every section is passed", () => {
    const progress = DOSSIER_SECTIONS.map((s) => ({ sectionId: s.id, passed: true })) as any;
    expect(computeCurrentSectionId(progress)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run __tests__/walkthrough.test.ts`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Append the implementation to `lib/walkthrough.ts`**

```ts
import { DOSSIER_SECTIONS } from "./dossier";

export const GATE_THRESHOLD = 0.7;

export interface GateOutcome {
  passed: boolean;
  reveal: boolean;
  advance: boolean;
}

/**
 * Bounded gate: attempt 1 gates (miss => reveal, stay); attempt 2 (the
 * confirming question after a reveal) always advances. `passed` is true only if
 * the answer cleared the threshold on whichever attempt.
 */
export function gateDecision(score: number, attemptNumber: number): GateOutcome {
  const passed = score >= GATE_THRESHOLD;
  if (attemptNumber >= 2) return { passed, reveal: false, advance: true };
  if (passed) return { passed: true, reveal: false, advance: true };
  return { passed: false, reveal: true, advance: false };
}

export interface ProgressValue {
  passed: boolean;
  bestScore: number;
  attempts: number;
}

/** Merge a new attempt into the prior row (or null) — best score wins, attempts++, passed sticks. */
export function mergeProgress(
  prev: ProgressValue | null,
  score: number,
  passedThisAttempt: boolean,
): ProgressValue {
  return {
    passed: (prev?.passed ?? false) || passedThisAttempt,
    bestScore: Math.max(prev?.bestScore ?? 0, score),
    attempts: (prev?.attempts ?? 0) + 1,
  };
}

/** First DOSSIER_SECTIONS id not marked passed, or null when all passed. */
export function computeCurrentSectionId(
  progress: Array<{ sectionId: string; passed: boolean }>,
): string | null {
  const passedIds = new Set(progress.filter((p) => p.passed).map((p) => p.sectionId));
  for (const s of DOSSIER_SECTIONS) {
    if (!passedIds.has(s.id)) return s.id;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run __tests__/walkthrough.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/walkthrough.ts __tests__/walkthrough.test.ts
git commit -m "feat(walkthrough): pure gate/merge/current-section logic"
```

---

## Task 3: Shared grading helper

**Files:**
- Create: `lib/grade.ts`
- Test: `__tests__/walkthrough-prompts.test.ts`

- [ ] **Step 1: Write the failing test** `__tests__/walkthrough-prompts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GradeSchema, buildGradePrompt } from "@/lib/grade";

describe("GradeSchema", () => {
  it("accepts a well-formed grade and defaults missedPoints", () => {
    const g = GradeSchema.parse({ score: 0.8, rationale: "good" });
    expect(g.missedPoints).toEqual([]);
  });
  it("rejects out-of-range scores", () => {
    expect(() => GradeSchema.parse({ score: 1.5, rationale: "x" })).toThrow();
  });
});

describe("buildGradePrompt", () => {
  it("includes the question, ideal answer, user answer, and context", () => {
    const p = buildGradePrompt({
      question: "What is X?",
      idealAnswer: "X is Y.",
      userAnswer: "X is Z.",
      context: "Section body about X.",
    });
    expect(p).toContain("What is X?");
    expect(p).toContain("X is Y.");
    expect(p).toContain("X is Z.");
    expect(p).toContain("Section body about X.");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run __tests__/walkthrough-prompts.test.ts`
Expected: FAIL — `Cannot find module '@/lib/grade'`.

- [ ] **Step 3: Implement `lib/grade.ts`**

```ts
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./ai";

export const GradeSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string(),
  missedPoints: z.array(z.string()).default([]),
});
export type Grade = z.infer<typeof GradeSchema>;

export function buildGradePrompt(args: {
  question: string;
  idealAnswer: string;
  userAnswer: string;
  context: string;
}): string {
  return `
You are grading a learner's free-text answer to a comprehension question. Score how well their answer matches the ideal answer, judged against the source context. Be specific and fair.

Question:
${args.question}

Ideal answer:
${args.idealAnswer}

Source context (the material the question is drawn from):
${args.context}

Learner's answer:
${args.userAnswer}

Return:
- score: 0.0–1.0 (1.0 = fully correct and complete).
- rationale: 2–4 sentences naming what was right and what was hand-wavy or wrong.
- missedPoints: 0–5 specific points the ideal answer covers that the learner missed.
`.trim();
}

/**
 * Grade a free-text answer with a single tools-free `generateObject` call. No
 * codebase tools — the `context` (a dossier section) is self-contained, so the
 * empty-text/tool-loop failure mode cannot occur here.
 */
export async function gradeFreeTextAnswer(args: {
  question: string;
  idealAnswer: string;
  userAnswer: string;
  context: string;
}): Promise<Grade> {
  const { object } = await generateObject({
    model: getModel(),
    schema: GradeSchema,
    prompt: buildGradePrompt(args),
  });
  return object;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run __tests__/walkthrough-prompts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/grade.ts __tests__/walkthrough-prompts.test.ts
git commit -m "feat(walkthrough): shared free-text grading helper (tools-free generateObject)"
```

---

## Task 4: Question generation prompt + schema

**Files:**
- Create: `lib/prompts/walkthrough.ts`
- Test: `__tests__/walkthrough-prompts.test.ts` (append)

- [ ] **Step 1: Append the failing test**

```ts
import {
  WalkthroughQuestionSchema,
  buildWalkthroughQuestionPrompt,
} from "@/lib/prompts/walkthrough";

describe("WalkthroughQuestionSchema", () => {
  it("requires question and idealAnswer", () => {
    expect(() => WalkthroughQuestionSchema.parse({ question: "q" })).toThrow();
    expect(WalkthroughQuestionSchema.parse({ question: "q", idealAnswer: "a" })).toEqual({
      question: "q",
      idealAnswer: "a",
    });
  });
});

describe("buildWalkthroughQuestionPrompt", () => {
  const base = {
    sectionTitle: "High-level Architecture",
    sectionBody: "Two apps under apps/: wc-api and wc-remote.",
    priorQuestions: [] as string[],
  };
  it("includes the section title and body", () => {
    const p = buildWalkthroughQuestionPrompt(base);
    expect(p).toContain("High-level Architecture");
    expect(p).toContain("Two apps under apps/");
  });
  it("instructs avoiding prior questions when present", () => {
    const p = buildWalkthroughQuestionPrompt({ ...base, priorQuestions: ["What are the two apps?"] });
    expect(p).toContain("What are the two apps?");
    expect(p.toLowerCase()).toContain("different");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run __tests__/walkthrough-prompts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/prompts/walkthrough.ts`**

```ts
import { z } from "zod";

export const WalkthroughQuestionSchema = z.object({
  question: z.string(),
  idealAnswer: z.string(),
});
export type WalkthroughQuestion = z.infer<typeof WalkthroughQuestionSchema>;

export function buildWalkthroughQuestionPrompt(args: {
  sectionTitle: string;
  sectionBody: string;
  priorQuestions: string[];
}): string {
  const avoid = args.priorQuestions.length
    ? `\nYou have already asked these questions — ask about a DIFFERENT aspect of the section:\n${args.priorQuestions.map((q) => `- ${q}`).join("\n")}\n`
    : "";
  return `
You are an interview coach. Write ONE comprehension question that tests whether the learner understood the following dossier section about a codebase, plus the ideal answer.

Section: ${args.sectionTitle}

Section content:
${args.sectionBody}
${avoid}
Rules:
- The question must be answerable from the section content above (do not require outside knowledge).
- Favor "why / how / what trade-off" questions an interviewer would ask, not trivia.
- The ideal answer should be 2–5 sentences, grounded in the section content.
`.trim();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run __tests__/walkthrough-prompts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/prompts/walkthrough.ts __tests__/walkthrough-prompts.test.ts
git commit -m "feat(walkthrough): comprehension-question prompt + schema"
```

---

## Task 5: Server actions

**Files:**
- Create: `app/actions/walkthrough.ts`
- (No new unit test — thin glue over tested pure logic + LLM calls; covered by the Task 9 live smoke.)

- [ ] **Step 1: Implement `app/actions/walkthrough.ts`**

```ts
"use server";

import { generateObject } from "ai";
import { getModel } from "@/lib/ai";
import { getProjectRaw } from "@/lib/projects";
import { loadDossierSync } from "@/lib/dossier-storage";
import { DOSSIER_SECTIONS, parseDossierSections } from "@/lib/dossier";
import {
  WalkthroughQuestionSchema,
  buildWalkthroughQuestionPrompt,
} from "@/lib/prompts/walkthrough";
import { gradeFreeTextAnswer, type Grade } from "@/lib/grade";
import {
  GATE_THRESHOLD,
  gateDecision,
  mergeProgress,
  computeCurrentSectionId,
  getProgress,
  upsertProgress,
  type GateOutcome,
} from "@/lib/walkthrough";
import type { WalkthroughProgress } from "@/lib/schema";

export interface WalkthroughSectionView {
  id: string;
  title: string;
  body: string; // "" when missing/empty in the dossier
}

export interface WalkthroughState {
  hasDossier: boolean;
  sections: WalkthroughSectionView[];
  progress: WalkthroughProgress[];
  currentSectionId: string | null;
  missingSectionIds: string[];
}

/** Map the dossier into the 8 canonical sections (body matched by title). */
function sectionsFromDossier(markdown: string): WalkthroughSectionView[] {
  const parsed = parseDossierSections(markdown);
  const byTitle = new Map(parsed.map((s) => [s.title, s.body]));
  return DOSSIER_SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    body: (byTitle.get(s.title) ?? "").trim(),
  }));
}

export async function loadWalkthroughState(projectId: string): Promise<WalkthroughState> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const markdown = loadDossierSync(p.rootPath);
  const hasDossier = markdown.trim().length > 0;
  const sections = hasDossier ? sectionsFromDossier(markdown) : [];
  const progress = getProgress(projectId);
  return {
    hasDossier,
    sections,
    progress,
    currentSectionId: hasDossier ? computeCurrentSectionId(progress) : null,
    missingSectionIds: sections.filter((s) => s.body.length === 0).map((s) => s.id),
  };
}

function sectionBodyOrThrow(projectRoot: string, sectionId: string): { title: string; body: string } {
  const section = DOSSIER_SECTIONS.find((s) => s.id === sectionId);
  if (!section) throw new Error(`Unknown section: ${sectionId}`);
  const view = sectionsFromDossier(loadDossierSync(projectRoot)).find((s) => s.id === sectionId)!;
  if (!view.body) throw new Error(`Section "${section.title}" is empty in the dossier — regenerate it first.`);
  return { title: section.title, body: view.body };
}

export async function generateSectionQuestion(
  projectId: string,
  sectionId: string,
  priorQuestions: string[] = [],
): Promise<{ question: string; idealAnswer: string }> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  const { title, body } = sectionBodyOrThrow(p.rootPath, sectionId);
  const { object } = await generateObject({
    model: getModel(),
    schema: WalkthroughQuestionSchema,
    prompt: buildWalkthroughQuestionPrompt({ sectionTitle: title, sectionBody: body, priorQuestions }),
  });
  return object;
}

export async function submitWalkthroughAnswer(args: {
  projectId: string;
  sectionId: string;
  question: string;
  idealAnswer: string;
  userAnswer: string;
  attemptNumber: number;
}): Promise<{ grade: Grade; decision: GateOutcome }> {
  const p = getProjectRaw(args.projectId);
  if (!p) throw new Error("Project not found");
  const trimmed = args.userAnswer.trim();
  if (!trimmed) throw new Error("Answer cannot be empty.");

  const { title, body } = sectionBodyOrThrow(p.rootPath, args.sectionId);
  const grade = await gradeFreeTextAnswer({
    question: args.question,
    idealAnswer: args.idealAnswer,
    userAnswer: trimmed,
    context: `Section: ${title}\n\n${body}`,
  });

  const decision = gateDecision(grade.score, args.attemptNumber);

  const prior = getProgress(args.projectId).find((r) => r.sectionId === args.sectionId) ?? null;
  const merged = mergeProgress(
    prior ? { passed: prior.passed, bestScore: prior.bestScore, attempts: prior.attempts } : null,
    grade.score,
    decision.passed,
  );
  upsertProgress(args.projectId, args.sectionId, merged);

  return { grade, decision };
}

export { GATE_THRESHOLD };
```

- [ ] **Step 2: Verify shapes against the real codebase**

Run: `grep -n "export function parseDossierSections\|export function loadDossierSync\|export function getProgress\|export function upsertProgress" lib/dossier.ts lib/dossier-storage.ts lib/walkthrough.ts`
Expected: confirms `parseDossierSections` (in `lib/dossier.ts`), `loadDossierSync` (in `lib/dossier-storage.ts`), `getProgress`/`upsertProgress` (in `lib/walkthrough.ts`). If any path differs, fix the import to match reality.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions/walkthrough.ts
git commit -m "feat(walkthrough): server actions — load state, generate question, submit answer"
```

---

## Task 6: Runner component + page

**Files:**
- Create: `components/walkthrough-runner.tsx`
- Create: `app/chat/[projectId]/walkthrough/page.tsx`

- [ ] **Step 1: Implement `components/walkthrough-runner.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import {
  generateSectionQuestion,
  submitWalkthroughAnswer,
  type WalkthroughState,
} from "@/app/actions/walkthrough";

type Phase =
  | { kind: "idle" }
  | { kind: "question"; question: string; idealAnswer: string; attempt: number }
  | {
      kind: "feedback";
      question: string;
      idealAnswer: string;
      attempt: number;
      grade: { score: number; rationale: string; missedPoints: string[] };
      reveal: boolean;
      advance: boolean;
    };

export function WalkthroughRunner({
  projectId,
  initial,
}: {
  projectId: string;
  initial: WalkthroughState;
}) {
  const [state, setState] = useState(initial);
  const [currentId, setCurrentId] = useState(initial.currentSectionId);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [answer, setAnswer] = useState("");
  const [asked, setAsked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const passedIds = new Set(state.progress.filter((p) => p.passed).map((p) => p.sectionId));
  const section = state.sections.find((s) => s.id === currentId) ?? null;

  function statusGlyph(sectionId: string): string {
    if (passedIds.has(sectionId)) return "✓";
    const row = state.progress.find((p) => p.sectionId === sectionId);
    if (row) return "~"; // attempted, completed-with-reveal
    if (sectionId === currentId) return "▸";
    return "○";
  }

  function ask() {
    if (!currentId) return;
    setError(null);
    startTransition(async () => {
      try {
        const q = await generateSectionQuestion(projectId, currentId, asked);
        setAsked((a) => [...a, q.question]);
        setPhase({ kind: "question", question: q.question, idealAnswer: q.idealAnswer, attempt: 1 });
        setAnswer("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate a question");
      }
    });
  }

  function submit() {
    if (phase.kind !== "question" || !currentId || !answer.trim()) return;
    const { question, idealAnswer, attempt } = phase;
    setError(null);
    startTransition(async () => {
      try {
        const { grade, decision } = await submitWalkthroughAnswer({
          projectId,
          sectionId: currentId,
          question,
          idealAnswer,
          userAnswer: answer,
          attemptNumber: attempt,
        });
        // refresh progress so the rail + glyphs update
        const rows = state.progress.filter((p) => p.sectionId !== currentId);
        setState({
          ...state,
          progress: [
            ...rows,
            {
              id: "local",
              projectId,
              sectionId: currentId,
              passed: decision.passed || passedIds.has(currentId),
              bestScore: grade.score,
              attempts: attempt,
              updatedAt: Date.now(),
            },
          ],
        });
        setPhase({
          kind: "feedback",
          question,
          idealAnswer,
          attempt,
          grade,
          reveal: decision.reveal,
          advance: decision.advance,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to grade your answer");
      }
    });
  }

  function continueAfterFeedback() {
    if (phase.kind !== "feedback") return;
    if (phase.advance) {
      // move to next not-passed section
      const order = state.sections.map((s) => s.id);
      const passedNow = new Set(
        state.progress.filter((p) => p.passed).map((p) => p.sectionId),
      );
      const next = order.find((id) => id !== currentId && !passedNow.has(id)) ?? null;
      setCurrentId(next);
      setAsked([]);
      setPhase({ kind: "idle" });
      setAnswer("");
    } else {
      // reveal path: ask the confirming question (attempt 2)
      startTransition(async () => {
        try {
          const q = await generateSectionQuestion(projectId, currentId!, asked);
          setAsked((a) => [...a, q.question]);
          setPhase({ kind: "question", question: q.question, idealAnswer: q.idealAnswer, attempt: 2 });
          setAnswer("");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to generate a question");
        }
      });
    }
  }

  if (!state.hasDossier) {
    return (
      <p className="text-sm text-muted-foreground">
        No dossier yet. <Link className="underline" href={`/chat/${projectId}/dossier`}>Generate the dossier</Link> first — the walkthrough is built from it.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-xs">
        {state.sections.map((s) => (
          <li key={s.id} className="rounded border border-[hsl(var(--border))] px-2 py-1">
            {statusGlyph(s.id)} {s.title}
          </li>
        ))}
      </ol>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!currentId ? (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Walkthrough complete 🎉</h2>
          <p className="text-sm text-muted-foreground">
            You worked through all {state.sections.length} sections. Best scores are saved per section.
          </p>
        </div>
      ) : !section ? null : (
        <div className="space-y-4">
          <article>
            <h2 className="mb-2 text-lg font-semibold">{section.title}</h2>
            {section.body ? (
              <Markdown>{section.body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">
                This section is empty in the dossier.{" "}
                <Link className="underline" href={`/chat/${projectId}/dossier`}>Regenerate it</Link> to walk it.
              </p>
            )}
          </article>

          {section.body && phase.kind === "idle" && (
            <button onClick={ask} disabled={pending}
              className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
              {pending ? "…" : "Check my understanding"}
            </button>
          )}

          {phase.kind === "question" && (
            <div className="space-y-3">
              <p className="font-medium">{phase.question}</p>
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={pending}
                className="h-40 w-full rounded-md border border-[hsl(var(--border))] bg-transparent p-3 text-sm outline-none focus:border-[hsl(var(--primary))] disabled:opacity-60"
                placeholder="Answer in your own words…" />
              <button onClick={submit} disabled={pending || !answer.trim()}
                className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
                {pending ? "Grading…" : "Submit"}
              </button>
            </div>
          )}

          {phase.kind === "feedback" && (
            <div className="space-y-3">
              <p className="text-sm">Score: <strong>{Math.round(phase.grade.score * 100)}%</strong></p>
              <p className="text-sm text-muted-foreground">{phase.grade.rationale}</p>
              {phase.grade.missedPoints.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {phase.grade.missedPoints.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              )}
              {phase.reveal && (
                <div className="rounded-md border border-[hsl(var(--border))] p-3">
                  <p className="text-xs uppercase text-muted-foreground">Ideal answer</p>
                  <p className="text-sm">{phase.idealAnswer}</p>
                </div>
              )}
              <button onClick={continueAfterFeedback} disabled={pending}
                className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
                {pending ? "…" : phase.advance ? "Continue →" : "Try the confirming question"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the `Markdown` prop** (it takes `children: string`, confirmed in the dossier work). Run: `grep -n "export function Markdown" components/markdown.tsx` — confirm `{ children }`. The component above uses `<Markdown>{section.body}</Markdown>`; adjust only if the real signature differs.

- [ ] **Step 3: Implement `app/chat/[projectId]/walkthrough/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/app/actions/projects";
import { loadWalkthroughState } from "@/app/actions/walkthrough";
import { WalkthroughRunner } from "@/components/walkthrough-runner";

export default async function WalkthroughPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const initial = await loadWalkthroughState(projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Link href={`/chat/${projectId}`} className="text-xs text-muted-foreground hover:underline">
          ← back to chat
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Guided Walkthrough</h1>
        <p className="text-sm text-muted-foreground">{project.name} — {project.rootPath}</p>
      </header>
      <WalkthroughRunner projectId={projectId} initial={initial} />
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/walkthrough-runner.tsx "app/chat/[projectId]/walkthrough/page.tsx"
git commit -m "feat(walkthrough): runner UI + page"
```

---

## Task 7: Nav link

**Files:**
- Modify: `app/chat/[projectId]/page.tsx`

- [ ] **Step 1: Add the link** immediately after the existing "Dossier" link in the header nav group:

```tsx
          <Link
            href={`/chat/${projectId}/walkthrough`}
            className="text-sm text-muted-foreground hover:underline"
          >
            Walkthrough
          </Link>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/chat/[projectId]/page.tsx"
git commit -m "feat(walkthrough): link Walkthrough from project header nav"
```

---

## Task 8: Suite + build green

**Files:** none (verification)

- [ ] **Step 1: Full unit suite**

Run: `pnpm vitest run`
Expected: PASS — all existing tests + `walkthrough.test.ts` + `walkthrough-prompts.test.ts`. (The live acceptance test from Task 9 is skipped without `KYS_LIVE`.)

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: succeeds; `/chat/[projectId]/walkthrough` route registered. (`lib/walkthrough.ts` imports `node:sqlite` via `lib/db.ts` — confirm it is only reached through the server action and the page's server component, NOT imported by the client `walkthrough-runner.tsx`. The runner imports only types + actions, so the client bundle stays clean. If the build complains about `node:` in the client bundle, that import boundary was violated — fix by importing the `WalkthroughState` type via `import type`.)

- [ ] **Step 3: Commit (only if fixups were needed)**

```bash
git add -A
git commit -m "test(walkthrough): suite + build green"
```

---

## Task 9: Opt-in live smoke — real generate + grade

**Files:**
- Create: `__tests__/walkthrough-acceptance.test.ts`

This drives the REAL actions against the dossier already generated for `weekly-commit-module`. Opt-in (`KYS_LIVE=1`); hits the paid API.

- [ ] **Step 1: Write the opt-in test**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetDbForTests } from "@/lib/db";
import { addProjectRaw } from "@/lib/projects";
import {
  generateSectionQuestion,
  submitWalkthroughAnswer,
} from "@/app/actions/walkthrough";

const LIVE = process.env.KYS_LIVE === "1";
const TARGET = process.env.KYS_TARGET ?? path.join(os.homedir(), "code", "weekly-commit-module");

let dbDir: string;
let projectId: string;

beforeAll(() => {
  if (!LIVE) return;
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "kys-wt-live-"));
  process.env.KYS_DB_PATH = path.join(dbDir, "db.sqlite");
  _resetDbForTests();
  projectId = addProjectRaw({ name: "weekly-commit-module", rootPath: TARGET }).id;
});
afterAll(() => {
  if (!LIVE) return;
  _resetDbForTests();
  delete process.env.KYS_DB_PATH;
  fs.rmSync(dbDir, { recursive: true, force: true });
});

describe.skipIf(!LIVE)("walkthrough live smoke (KYS_LIVE=1)", () => {
  it(
    "generates a question and grades a good answer high, a poor answer low",
    async () => {
      // requires the dossier to exist at TARGET/.know-your-stuff/dossier.md
      expect(fs.existsSync(path.join(TARGET, ".know-your-stuff", "dossier.md"))).toBe(true);

      const q = await generateSectionQuestion(projectId, "architecture", []);
      expect(q.question.length).toBeGreaterThan(0);
      expect(q.idealAnswer.length).toBeGreaterThan(0);

      const good = await submitWalkthroughAnswer({
        projectId,
        sectionId: "architecture",
        question: q.question,
        idealAnswer: q.idealAnswer,
        userAnswer: q.idealAnswer, // answering with the ideal answer should score high
        attemptNumber: 1,
      });
      expect(good.grade.score).toBeGreaterThanOrEqual(0.7);
      expect(good.decision.advance).toBe(true);

      const bad = await submitWalkthroughAnswer({
        projectId,
        sectionId: "architecture",
        question: q.question,
        idealAnswer: q.idealAnswer,
        userAnswer: "I don't know.",
        attemptNumber: 1,
      });
      expect(bad.grade.score).toBeLessThan(0.7);
      expect(bad.decision.reveal).toBe(true);
    },
    180_000,
  );
});
```

- [ ] **Step 2: Run it (manual gate — costs API tokens)**

Run: `KYS_LIVE=1 pnpm vitest run __tests__/walkthrough-acceptance.test.ts`
Expected: PASS — a question is generated, the ideal-answer submission scores ≥ 0.7 and advances, the "I don't know" submission scores < 0.7 and triggers reveal. If the good answer scores low, the grading prompt is too harsh or the question is unanswerable from the section — inspect and adjust before declaring done.

- [ ] **Step 3: Confirm the default suite still skips it**

Run: `pnpm vitest run`
Expected: PASS; acceptance test skipped.

- [ ] **Step 4: Commit**

```bash
git add __tests__/walkthrough-acceptance.test.ts
git commit -m "test(walkthrough): opt-in live smoke — real generate + grade path"
```

---

## Task 10: Open the PR

- [ ] **Step 1: Push**

Run: `git push -u origin feat/guided-walkthrough`

- [ ] **Step 2: Open the PR**

Run:
```bash
gh pr create --title "feat: guided walkthrough — mastery-gated dossier tour" \
  --body "Implements the guided walkthrough (subsystem #2 of 5). Spec: docs/superpowers/specs/2026-06-08-guided-walkthrough-design.md. Plan: docs/superpowers/plans/2026-06-08-guided-walkthrough.md.

Section-by-section tour of the dossier: per-section comprehension question (tools-free generateObject), free-text answer graded (score/rationale/missedPoints), gated on a 0.7 threshold with a bounded reveal+retry path. Progress persists per project in a new walkthrough_progress table; the current section is derived from DOSSIER_SECTIONS order so you resume where you left off. Reuses parseDossierSections and the quiz grading shape; the grading helper is extracted to lib/grade.ts (quiz left untouched).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review

- **Spec coverage:** progress table + storage (Task 1) ✓; bounded gate + current-section derivation (Task 2) ✓; tools-free grading helper (Task 3) ✓; question generation prompt/schema, avoid-prior-questions (Task 4) ✓; load/generate/submit actions incl. missing-section handling (Task 5) ✓; runner UI with progress rail, reveal/confirm flow, no-dossier + empty-section blocks, complete state (Task 6) ✓; nav link (Task 7) ✓; suite + build + client/node boundary (Task 8) ✓; opt-in live smoke driving real actions (Task 9) ✓; resume = derived current section on load (Tasks 2+5+6) ✓; quiz untouched ✓.
- **Placeholder scan:** none — every code step is complete; the Task 5 "verify shapes" and Task 6/8 boundary checks are explicit guards with concrete grep commands, not TODOs.
- **Type consistency:** `GateOutcome {passed,reveal,advance}`, `ProgressValue {passed,bestScore,attempts}`, `mergeProgress(prev,score,passed)`, `gateDecision(score,attempt)`, `WalkthroughQuestionSchema {question,idealAnswer}`, `Grade {score,rationale,missedPoints}`, `gradeFreeTextAnswer({question,idealAnswer,userAnswer,context})`, `loadWalkthroughState→WalkthroughState`, `submitWalkthroughAnswer(args)→{grade,decision}` are used identically across Tasks 1–9. `getProgress`/`upsertProgress` signatures match between Task 1 and Task 5.
- **Scope:** walkthrough only; #3–#5 deferred; quiz runtime untouched.
