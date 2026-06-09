# Mock Interview Drills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD, checkbox steps.

**Goal:** A 3-turn adaptive mock-interview drill on a dossier section, ending with a scored card; completed sessions persist.

**Architecture:** Mirrors the walkthrough's structure. Tools-free `generateObject` for opening/follow-up questions and the session scorecard. New `drill_sessions` table. Client runner holds the transcript in memory; only `finishDrill` persists. Spec: `docs/superpowers/specs/2026-06-09-mock-interview-drills-design.md`.

**Tech Stack:** Next.js server actions, AI SDK `generateObject`, Zod, node:sqlite, Vitest.

**Reference-corpus note:** closest exemplar `llm-judge-agent-ts` (structured eval). Real exemplar is in-repo: `app/actions/walkthrough.ts` + `lib/grade.ts` + `lib/db.ts` migrations. Adapt those.

---

## File Structure
- Modify `lib/schema.ts` — `DrillSessionSchema`.
- Modify `lib/db.ts` — migration `003_drill_sessions`.
- Create `lib/drills.ts` — storage (`insertDrillSession`, `listDrillSessions`) + pure `parseTranscript`/`serializeTranscript` + `DRILL_TURNS`.
- Create `lib/prompts/drills.ts` — `DrillQuestionSchema`, `DrillScoreSchema`, `buildOpeningPrompt`, `buildFollowupPrompt`, `buildScorePrompt`.
- Create `app/actions/drills.ts` — `startDrill`, `nextDrillQuestion`, `finishDrill`, `listDrills`.
- Create `components/drill-runner.tsx` + `app/chat/[projectId]/drills/page.tsx`.
- Modify `app/chat/[projectId]/page.tsx` — "Drills" nav link.
- Tests: `__tests__/drills.test.ts`, `__tests__/drills-prompts.test.ts`, `__tests__/drills-acceptance.test.ts`.

## Tasks
1. **Schema + migration + storage + pure transcript helpers** — `DrillSessionSchema`; `003_drill_sessions`; `lib/drills.ts` (`DRILL_TURNS=3`, `serializeTranscript`/`parseTranscript` inverse, `insertDrillSession`, `listDrillSessions`). Tests: storage round-trip (tmp DB, JSON cols), transcript inverse.
2. **Prompts + schemas** — `lib/prompts/drills.ts`. Tests: each builder includes section title/body; follow-up includes transcript Q&A; score schema validates + defaults arrays.
3. **Server actions** — `app/actions/drills.ts` (section body resolved from dossier; tools-free generateObject; `finishDrill` evaluates + `insertDrillSession`). Typecheck.
4. **Runner + page + nav** — `components/drill-runner.tsx` (section picker, 3-turn arc, scorecard, past-sessions list), page, nav link. Typecheck + build (client/node boundary: import `DrillSession`/actions as needed; the runner must not import node modules).
5. **Suite + build green**; then **opt-in live smoke** (`__tests__/drills-acceptance.test.ts`) driving real `startDrill`→`nextDrillQuestion`→`finishDrill`.
6. **PR**.

Exact code is provided in the implementer dispatches. Each task: write failing test → run (fail) → implement → run (pass) → commit. Pure logic gets real unit tests; actions/UI verified by typecheck + build + the live smoke.

## Self-Review
- Spec coverage: 3-turn arc (Tasks 3+4), scorecard persist (Tasks 1+3), section-topic source (Task 3), past sessions (Tasks 1+4), tools-free generation (Tasks 2+3), live smoke driving real code (Task 5). ✓
- Types consistent: `DrillSession`, transcript `{question,answer}[]`, `DrillQuestionSchema{question}`, `DrillScoreSchema{score,strengths,weaknesses}` used identically across tasks.
- Scope: drills only; quiz/walkthrough/dossier untouched.
