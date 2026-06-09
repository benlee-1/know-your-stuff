# Socratic Teach-Back Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD, checkbox steps.

**Goal:** User explains a dossier section; tool finds gaps + asks a Socratic probe; closing assessment persists.

**Architecture:** Mirrors drills (subsystem #3). Tools-free `generateObject` for analysis + closing. New `teachback_sessions` table. Client runner commits state only on success (no pre-await mutation). Spec: `docs/superpowers/specs/2026-06-09-socratic-teachback-design.md`.

**Reference-corpus note:** closest `llm-judge-agent-ts`; real exemplar in-repo `app/actions/drills.ts` + `lib/drills.ts` + `lib/prompts/drills.ts`. Adapt those.

## File Structure
- Modify `lib/schema.ts` (`TeachbackSessionSchema`), `lib/db.ts` (migration `004_teachback_sessions`).
- Create `lib/teachback.ts` (insert/list), `lib/prompts/teachback.ts` (`AnalysisSchema`, `ClosingSchema`, `buildAnalysisPrompt`, `buildClosingPrompt`).
- Create `app/actions/teachback.ts` (`loadTeachbackState`, `analyzeExplanation`, `submitSocraticResponse`).
- Create `components/teachback-runner.tsx`, `app/chat/[projectId]/teachback/page.tsx`; modify chat header nav.
- Tests: `__tests__/teachback.test.ts`, `__tests__/teachback-prompts.test.ts`, `__tests__/teachback-acceptance.test.ts`.

## Tasks
1. Schema + migration + storage (round-trip test, tmp DB).
2. Prompts + schemas (builders include section/explanation/analysis/response; schema defaults).
3. Actions (loader + analyze + submit/persist; tools-free; typecheck).
4. Runner + page + nav (commit-on-success state machine; no node import in client; build green).
5. Suite+build; opt-in live smoke driving real analyze→submit.
6. PR.

Exact code in the implementer dispatches. Each task: failing test → fail → implement → pass → commit.

## Self-Review
- Spec coverage: explain→analyze→probe→close→persist (Tasks 3+4), section source + past list (1+3+4), tools-free (2+3), retry-safe runner (4), live smoke real code (5). ✓
- Types consistent: `TeachbackSession`, `AnalysisSchema{coverageScore,gaps,misconceptions,socraticQuestion}`, `ClosingSchema{summary,masteredPoints,stillMissing}`.
- Scope: teach-back only; others untouched.
