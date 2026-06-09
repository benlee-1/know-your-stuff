# Guided Walkthrough — Design Spec

**Date:** 2026-06-08
**Status:** Approved for planning
**Scope:** Subsystem #2 of 5 (interview-prep roadmap). Builds on the dossier (#1).

## Summary

A mastery-gated, section-by-section tour of the dossier. The user reads each of
the eight dossier sections in order; at each one the tool generates a
comprehension question, grades the free-text answer, and gates advancement on a
score threshold. Progress persists per project so the user can leave and resume,
and the data becomes the substrate the spaced-repetition subsystem (#5) builds
on.

## Roadmap context (not in scope here)

1. Dossier — shipped (#1).
2. **Guided walkthrough** — this spec.
3. Mock interview drills.
4. Socratic teach-back.
5. Spaced repetition (will reuse `walkthrough_progress` and grading).

## Goals

- Walk the user through all eight dossier sections in canonical order.
- At each section: show content → generate a comprehension question → grade →
  gate on a threshold.
- A real gate, but bounded so the user can never get stuck.
- Persist per-section progress; resume where the user left off.

## Non-goals

- No spaced repetition / scheduling (#5).
- No "explain it back in your own words" Socratic flow (#4) — this uses
  tool-generated questions, not user-led explanation.
- No changes to the quiz feature's runtime (the grading helper is extracted, but
  quiz keeps calling its own path until a later, separate consolidation).

## Interaction model

Per section, **max two questions** (bounded — no infinite wall):

1. Show the section content (from the dossier).
2. Generate a comprehension question live from the section text.
3. User answers (free text) → grade → `{ score (0–1), rationale, missedPoints[] }`.
4. **Pass** (`score >= GATE_THRESHOLD`, default **0.7**) → mark `passed`, advance.
5. **Miss** → reveal the missed points AND the ideal answer, then ask ONE
   confirming question on the same section. Grade it. Then advance regardless.
   - `passed = true` iff either attempt cleared the threshold.
   - Otherwise the section advances as "completed (with reveal)".
   - `bestScore` and `attempts` are always recorded.

Per-section display state (derived):
- ✓ **passed** — cleared the gate on attempt 1 or the confirming attempt.
- ~ **completed-with-reveal** — saw the ideal answer, advanced without clearing.
- ○ **not reached** — sections after the current one.

**Current section** = the first section in `DOSSIER_SECTIONS` order whose row is
not `passed`. "Locked/unlocked" is derived from order; no status enum is stored.

## Architecture

Approach A: reuse the dossier's section parsing and the quiz's grading pattern;
keep walkthrough state in its own table.

- **Generation** is a tools-free `generateObject` call: input a section's
  `{ title, body }`, output `{ question, idealAnswer }`. The dossier body is
  already code-grounded with citations, so the section text is the only context
  needed — no codebase tools. (Tools-free structured output cannot hit the
  empty-text / tool-loop failure mode documented for the dossier generator.)
- **Grading** is a tools-free `generateObject` call with a `score / rationale /
  missedPoints` schema, comparing the answer to the generated `idealAnswer` plus
  the section text. Extracted into a shared `lib/grade.ts` helper.

## Components

### `lib/schema.ts` (extend)

```ts
export const WalkthroughProgressSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sectionId: z.string(),          // one of DOSSIER_SECTIONS ids
  passed: z.boolean(),
  bestScore: z.number().min(0).max(1),
  attempts: z.number().int().min(0),
  updatedAt: z.number(),
});
export type WalkthroughProgress = z.infer<typeof WalkthroughProgressSchema>;
```

### `lib/db.ts` (migration)

```sql
CREATE TABLE walkthrough_progress (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  sectionId TEXT NOT NULL,
  passed INTEGER NOT NULL,
  bestScore REAL NOT NULL,
  attempts INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  UNIQUE(projectId, sectionId)
);
```
Added as a new numbered migration (the repo uses a `migrations` table).

### `lib/walkthrough.ts` (pure + DB)

- `GATE_THRESHOLD = 0.7`.
- `gateDecision(score, attemptNumber): { passed: boolean; reveal: boolean; advance: boolean }`
  — pure. attempt 1 + pass → `{passed:true, reveal:false, advance:true}`;
  attempt 1 + miss → `{passed:false, reveal:true, advance:false}`; attempt 2
  (confirming) → `{passed: score>=threshold, reveal:false, advance:true}`.
- `getProgress(projectId): WalkthroughProgress[]`, `upsertProgress(...)` (DB).
- `computeCurrentSectionId(progress): string` — first `DOSSIER_SECTIONS` id not
  marked `passed`; `null`/sentinel when all passed.

### `lib/grade.ts` (extracted shared helper)

```ts
export interface Grade { score: number; rationale: string; missedPoints: string[] }
export async function gradeFreeTextAnswer(args: {
  question: string; idealAnswer: string; userAnswer: string; context: string;
}): Promise<Grade>
```
Tools-free `generateObject` with the score/rationale/missedPoints schema. Quiz is
NOT modified to use it in this spec (future consolidation noted).

### `lib/prompts/walkthrough.ts`

- `buildWalkthroughQuestionPrompt({ sectionTitle, sectionBody, priorQuestions })`
  — instructs a single interview-style comprehension question + ideal answer
  about the section; `priorQuestions` (asked already) must be avoided so retries
  use a fresh angle.

### `app/actions/walkthrough.ts` (server actions)

- `loadWalkthroughState(projectId)` — loads dossier, `parseDossierSections`,
  matches bodies to `DOSSIER_SECTIONS` by title, joins progress, returns sections
  + progress + current section id + a `missingSections` list (sections absent or
  empty in the dossier).
- `generateSectionQuestion(projectId, sectionId, priorQuestions[])` →
  `{ question, idealAnswer }`.
- `submitWalkthroughAnswer(projectId, sectionId, { question, idealAnswer,
  userAnswer, attemptNumber })` — grades via `gradeFreeTextAnswer`, applies
  `gateDecision`, upserts progress (updates `bestScore`/`attempts`/`passed`),
  returns `{ grade, decision }`.

### `components/walkthrough-runner.tsx` (client)

Progress rail (8 sections, ✓/~/○), current section via `Markdown`, the question,
an answer textarea, graded feedback (score/rationale/missed points; on a miss the
revealed ideal answer + confirming question), advance control. `useTransition` +
status, mirroring `quiz-runner.tsx`.

### `app/chat/[projectId]/walkthrough/page.tsx`

Server page; loads state; renders the runner. If no dossier exists, blocks with a
link to the Dossier page. **Nav link** "Walkthrough" added to the chat header.

## Data flow

```
loadWalkthroughState(projectId)
  └─ loadDossier → parseDossierSections → match to DOSSIER_SECTIONS by title
  └─ getProgress(projectId)
  └─ computeCurrentSectionId(progress)
  └─ { sections, progress, currentSectionId, missingSections }

per section (client):
  generateSectionQuestion(projectId, sectionId, priorQuestions)
    → { question, idealAnswer }
  user answers →
  submitWalkthroughAnswer(...)
    → gradeFreeTextAnswer → gateDecision → upsertProgress
    → { grade, decision: { passed, reveal, advance } }
  reveal? show idealAnswer + confirming question (attempt 2)
  advance? move to next section (or "walkthrough complete")
```

## Error handling & edge cases

- **No dossier** → page blocks with a link to generate one.
- **Missing/empty section** (hand-edited dossier) → listed in `missingSections`;
  the runner flags which and links to regenerate that section. Sections present
  are still walkable.
- **Grading/generation API error** → surfaced as a status message; the user can
  retry the action. No progress is written on a failed grade.
- **All sections passed** → "walkthrough complete" state with a summary
  (per-section best scores).

## Testing & verification

- **Unit (pure):** `gateDecision` (all branches), `computeCurrentSectionId`,
  progress upsert round-trip (tmp DB), prompt builder asserts (section title/body
  present, prior questions instructed to be avoided), `gradeFreeTextAnswer`
  schema shape.
- **Opt-in live smoke (`KYS_LIVE`):** drives the REAL `generateSectionQuestion`
  + `submitWalkthroughAnswer` actions against the existing dossier for one
  section — asserts a question/idealAnswer is produced and a deliberately-good
  answer grades `>= threshold`, a deliberately-empty answer grades low. Verifies
  the production path, not a copy (the dossier-subsystem lesson).

## Implementation obligations (user global rules)

- **Reference-corpus check** before writing the question generator / grading
  helper; report which exemplar was used or that none matched.
- **Verify by driving the real interaction** (the opt-in live smoke + manually
  driving the UI), not by screenshot.
- **Land a verified baseline before flair:** progress table + gate logic + a
  single-section pass loop first, then resume/progress rail, then the
  reveal/retry path.

## Open questions

None blocking. The grade threshold (0.7) and max-attempts (2) are constants that
can be tuned after first use.
