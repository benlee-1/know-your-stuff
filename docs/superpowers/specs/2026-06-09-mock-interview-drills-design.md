# Mock Interview Drills — Design Spec

**Date:** 2026-06-09
**Status:** Approved (autonomous build directive) — subsystem #3 of 5.

## Summary

The tool plays interviewer. The user picks a dossier section as the topic; the
tool runs a short adaptive interview — an opening question, then follow-up probes
that dig into the user's answers — and ends with a scorecard (overall score +
strengths + weaknesses). Completed sessions persist for review.

## Interaction model

A fixed **3-turn arc** (bounded, predictable cost):

1. **Opening question** — generated from the section text.
2. **Follow-up probe #1** — generated from the section + the running transcript
   (digs into what the user said, or pivots to an adjacent sub-aspect).
3. **Follow-up probe #2** — same, deeper.
4. After the 3rd answer, **evaluate the whole transcript** → `{ score 0–1,
   strengths[], weaknesses[] }`, persist the session, show the scorecard.

All generation/evaluation is tools-free `generateObject` (the dossier section is
self-contained context — same rationale as the walkthrough).

## Non-goals

- Not unbounded/free-form chat (the quiz/technical chat already cover that).
- No voice. No real-time streaming. No changes to dossier/walkthrough/quiz runtime.

## Components

### `lib/schema.ts` (extend)
```ts
export const DrillSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sectionId: z.string(),
  transcriptJson: z.string(),   // JSON of [{question, answer}, ...]
  score: z.number().min(0).max(1),
  strengthsJson: z.string(),    // JSON string[]
  weaknessesJson: z.string(),   // JSON string[]
  createdAt: z.number(),
});
export type DrillSession = z.infer<typeof DrillSessionSchema>;
```

### `lib/db.ts` — migration `003_drill_sessions`
```sql
CREATE TABLE drill_sessions (
  id            TEXT PRIMARY KEY,
  projectId     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sectionId     TEXT NOT NULL,
  transcriptJson TEXT NOT NULL,
  score         REAL NOT NULL,
  strengthsJson TEXT NOT NULL,
  weaknessesJson TEXT NOT NULL,
  createdAt     INTEGER NOT NULL
);
CREATE INDEX idx_drills_project ON drill_sessions(projectId, createdAt);
```

### `lib/drills.ts`
- `DRILL_TURNS = 3`.
- `insertDrillSession({projectId, sectionId, transcript, score, strengths, weaknesses}): DrillSession` (serializes JSON columns).
- `listDrillSessions(projectId): DrillSession[]` (newest first).
- Pure `parseTranscript(json): {question,answer}[]` / `serializeTranscript(t): string` helpers.

### `lib/prompts/drills.ts`
- `DrillQuestionSchema = { question: string }`.
- `DrillScoreSchema = { score: number(0..1), strengths: string[].default([]), weaknesses: string[].default([]) }`.
- `buildOpeningPrompt({sectionTitle, sectionBody})`.
- `buildFollowupPrompt({sectionTitle, sectionBody, transcript})` — instructs a probe that builds on the candidate's last answer; avoids repeating earlier questions.
- `buildScorePrompt({sectionTitle, sectionBody, transcript})` — evaluate the candidate across the arc.

### `app/actions/drills.ts` (server actions, tools-free)
- `startDrill(projectId, sectionId) → { question }` — opening (no DB write).
- `nextDrillQuestion(projectId, sectionId, transcript) → { question }` — follow-up given prior Q&A.
- `finishDrill(projectId, sectionId, transcript) → DrillSession` — evaluate + persist.
- `listDrills(projectId) → DrillSession[]`.
- Section body resolved from the dossier via `parseDossierSections` matched to `DOSSIER_SECTIONS` by title (reuse the walkthrough helper shape); throws if the dossier/section is missing.

### `components/drill-runner.tsx` (client)
- Section picker (the 8 DOSSIER_SECTIONS; disabled if no dossier).
- Drives the 3-turn arc: shows interviewer question, answer textarea, submit; after 3 answers calls `finishDrill` and renders the scorecard (score %, strengths, weaknesses, and the transcript).
- A "New drill" reset; a collapsed list of past sessions (`listDrills`).
- `useTransition` + status, mirroring the walkthrough/quiz runners. Client tracks the transcript in memory; only `finishDrill` persists.

### `app/chat/[projectId]/drills/page.tsx`
Server page; loads dossier presence + section list + past drills; renders runner.
Blocks with a Dossier link when no dossier. **Nav link** "Drills" in the chat header.

## Error handling
- No dossier / empty section → block / disable that section (reuse walkthrough's missing-section detection).
- Generation/eval API error → surfaced status; no partial session persisted (persist only in `finishDrill` after a successful eval).

## Testing
- **Unit:** storage round-trip (tmp DB, JSON columns), `parseTranscript`/`serializeTranscript` inverse, prompt builders (section + transcript present; follow-up references transcript; score schema validation/defaults).
- **Opt-in live smoke (`KYS_LIVE`):** drive the REAL `startDrill` → `nextDrillQuestion` → `finishDrill` against the existing dossier for one section; assert each step returns a non-empty question and `finishDrill` returns a persisted session with a 0–1 score. Drives production code, not a copy.

## Implementation obligations
- Reference-corpus check before the generators (report match or none).
- Verify by driving the real interaction (live smoke), not screenshots.
- Reuse `lib/grade.ts`-style structured output; keep quiz/walkthrough untouched.
