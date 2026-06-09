# Spaced Repetition Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD, checkbox steps.

**Goal:** Dossier-derived flashcards scheduled by SM-2; review sessions update each card's schedule across sessions.

**Architecture:** Pure SM-2 scheduler (`lib/srs.ts`) is the tested heart; `flashcards` table; tools-free `generateObject` card generation; retry-safe review runner. Spec: `docs/superpowers/specs/2026-06-09-spaced-repetition-design.md`.

**Reference-corpus note:** closest `swift-pomodoro-appstate-swift` (scheduling/state machine) — not a fit; real exemplars in-repo are `lib/drills.ts`/`app/actions/drills.ts` (storage + actions) and the SM-2 algorithm is standard. Adapt those.

## File Structure
- Modify `lib/schema.ts` (`FlashcardSchema`), `lib/db.ts` (migration `006_flashcards`).
- Create `lib/srs.ts` (pure SM-2 + DB), `lib/prompts/srs.ts` (`CardBatchSchema`, `buildCardGenPrompt`).
- Create `app/actions/srs.ts` (`loadSrsState`, `generateCards`, `getDueCards`, `rateCard`).
- Create `components/srs-runner.tsx`, `app/chat/[projectId]/cards/page.tsx`; modify chat nav.
- Tests: `__tests__/srs.test.ts` (SM-2 exhaustive + storage), `__tests__/srs-prompts.test.ts`, `__tests__/srs-acceptance.test.ts`.

## Tasks
1. **SM-2 pure scheduler + tests** — `scheduleCard`, `ratingToQuality`, `isDue`, `DEFAULT_EASE` in `lib/srs.ts`; exhaustive unit tests (fresh/second/third good, lapse, ease floor, easy, mapping, due boundary, dueAt math). NO DB yet.
2. **Schema + migration + card storage** — `FlashcardSchema`; `006_flashcards`; append DB fns to `lib/srs.ts` (`insertCards`, `listCards`, `listDueCards`, `countDueBySection`, `updateCardSchedule`); storage tests (tmp DB).
3. **Prompts** — `lib/prompts/srs.ts` + tests.
4. **Actions** — `app/actions/srs.ts` (loader + generate + due queue + rate); typecheck.
5. **Runner + page + nav** — deck overview + review mode; retry-safe; client/node boundary; build green.
6. **Suite+build; opt-in live smoke** driving real generate→rate.
7. **PR**.

Exact code in dispatches. Each task: failing test → fail → implement → pass → commit.

## Self-Review
- Spec coverage: SM-2 scheduler (T1), card persistence + due queue (T2), generation (T3+T4), review+rate (T4+T5), deck overview (T4+T5), live smoke real code (T6). ✓
- Types consistent: `Flashcard`, `scheduleCard(prev{ease,intervalDays,reps}, quality, now)`, `ratingToQuality(rating)`, `CardBatchSchema{cards:[{front,back}]}`.
- Scope: SRS only; others untouched. SM-2 is the highest-risk unit → most test coverage.
