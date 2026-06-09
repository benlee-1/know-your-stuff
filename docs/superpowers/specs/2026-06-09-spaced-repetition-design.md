# Spaced Repetition — Design Spec

**Date:** 2026-06-09 · **Status:** Approved (autonomous directive) · Subsystem #5 of 5 (final).

## Summary
Turn dossier facts/decisions into flashcards scheduled with an SM-2 algorithm.
The user generates cards per dossier section; a review session surfaces due cards
one at a time (front → reveal back → self-rate recall), and each rating updates
the card's schedule (ease, interval, next due date). Cards persist; the schedule
spans sessions — the point of spaced repetition.

## The scheduler (the heart — pure + thoroughly tested)
SM-2. Each card carries `ease` (default 2.5), `intervalDays` (default 0), `reps`
(default 0), `dueAt` (default = creation time → immediately due).

`scheduleCard(prev: {ease, intervalDays, reps}, quality 0..5, now) → {ease, intervalDays, reps, dueAt}`:
- quality < 3 (lapse): `reps = 0`, `intervalDays = 1`.
- quality ≥ 3: `reps==0 → 1`; `reps==1 → 6`; else `round(intervalDays * ease)`; then `reps += 1`.
- always: `ease = max(1.3, ease + (0.1 - (5-q)*(0.08 + (5-q)*0.02)))`.
- `dueAt = now + intervalDays * 86_400_000`.

Rating → quality: **Again=2, Hard=3, Good=4, Easy=5**. `isDue(card, now) = dueAt <= now`.

## Non-goals
No FSRS/advanced algorithms. No cross-device sync. No editing card text in v1
(regenerate instead). No changes to other features' runtime.

## Components
### `lib/schema.ts`
```ts
export const FlashcardSchema = z.object({
  id: z.string(), projectId: z.string(), sectionId: z.string(),
  front: z.string(), back: z.string(),
  ease: z.number(), intervalDays: z.number(), reps: z.number().int(),
  dueAt: z.number(), createdAt: z.number(),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;
```
### `lib/db.ts` — migration `006_flashcards`
Table with the columns above (FK projectId→projects ON DELETE CASCADE; index on `(projectId, dueAt)`).

### `lib/srs.ts`
- Pure: `DEFAULT_EASE=2.5`; `ratingToQuality(rating: "again"|"hard"|"good"|"easy"): number`; `scheduleCard(prev, quality, now)`; `isDue(card, now)`.
- DB: `insertCards({projectId, sectionId, cards:[{front,back}], now})` (defaults: ease 2.5, interval 0, reps 0, dueAt=now); `listCards(projectId)`; `listDueCards(projectId, now)` (dueAt<=now, oldest-due first); `countDueBySection(projectId, now)`; `updateCardSchedule(id, {ease, intervalDays, reps, dueAt})`.

### `lib/prompts/srs.ts`
- `CardBatchSchema = { cards: array({front: string, back: string}) }`.
- `buildCardGenPrompt({sectionTitle, sectionBody, count})` — extract up to `count` interview-worthy Q→A flashcards (front = a question/prompt, back = the concise answer) grounded in the section.

### `app/actions/srs.ts` (tools-free)
- `loadSrsState(projectId) → { hasDossier, sections: {id,title,hasBody,cardCount,dueCount}[], totalDue }`.
- `generateCards(projectId, sectionId, count=8) → Flashcard[]` (generate + insert, immediately due).
- `getDueCards(projectId) → Flashcard[]` (the review queue at call time).
- `rateCard(projectId, cardId, rating) → Flashcard` (schedule via `scheduleCard` + `updateCardSchedule`; returns updated card).

### `components/srs-runner.tsx` (client)
- Deck overview: per-section card counts + due counts + "Generate cards" (count selector); total due.
- Review mode: "Review N due" → one card at a time — show front, "Show answer" reveals back, then four rating buttons (Again/Hard/Good/Easy) → `rateCard` → next due card → "Review complete". Retry-safe (commit on success; rating preserved on error).
- No client import of `node:sqlite` (state via the loader; `Flashcard` via `import type`).

### `app/chat/[projectId]/cards/page.tsx` + nav link "Cards".

## Error handling
No dossier / empty section → block / disable generation for that section. API
error during generation/rating → status; card schedule only updated on a
successful `rateCard`.

## Testing
- **Unit (SM-2 — exhaustive):** fresh-good→interval 1; second-good→6; third-good→round(interval*ease); lapse(q<3)→reps 0/interval 1 + ease drop; ease floor 1.3; easy raises ease; `ratingToQuality` mapping; `isDue` boundary; `dueAt` math.
- **Unit (storage):** insert defaults + round-trip; `listDueCards` ordering + filter; `updateCardSchedule` persists; `countDueBySection`.
- **Opt-in live smoke (`KYS_LIVE`):** generate cards for one section against the existing dossier (assert ≥1 card with non-empty front/back, immediately due); then `rateCard(good)` and assert `dueAt` moved into the future and `reps` incremented.

## Obligations
Reference-corpus check; verify by driving real actions; reuse the grain; leave other features untouched. (Roadmap note: this is the substrate the persisted progress feeds; a future enhancement can weight generation toward weak `walkthrough_progress` sections — out of scope here.)
