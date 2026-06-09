# Socratic Teach-Back — Design Spec

**Date:** 2026-06-09 · **Status:** Approved (autonomous directive) · Subsystem #4 of 5.

## Summary
The user explains a dossier section in their own words; the tool compares it to
the section (ground truth), surfaces gaps and misconceptions, and asks ONE
Socratic probing question at the biggest gap. The user responds; the tool gives a
closing assessment. Active recall — the user leads, the tool reacts. Completed
sessions persist.

## Interaction (2 user turns)
1. Pick a dossier section. User writes a free-text **explanation** of it.
2. Tool **analyzes**: `{ coverageScore 0–1, gaps[], misconceptions[],
   socraticQuestion }` — gaps are points in the section the user omitted;
   misconceptions are things they got wrong; the question probes the biggest gap.
3. User answers the Socratic question.
4. Tool **closes**: `{ summary, masteredPoints[], stillMissing[] }`, persists the
   session, shows the closing card.

All generation is tools-free `generateObject` (dossier section = self-contained
context).

## Non-goals
Not a quiz (tool-led Q), not a drill (interview arc), not a gated tour. No changes
to dossier/walkthrough/drills/quiz runtime.

## Components
### `lib/schema.ts`
```ts
export const TeachbackSessionSchema = z.object({
  id: z.string(), projectId: z.string(), sectionId: z.string(),
  explanation: z.string(),
  coverageScore: z.number().min(0).max(1),
  gapsJson: z.string(),              // JSON string[]
  socraticQuestion: z.string(),
  response: z.string(),
  summary: z.string(),
  stillMissingJson: z.string(),      // JSON string[]
  createdAt: z.number(),
});
export type TeachbackSession = z.infer<typeof TeachbackSessionSchema>;
```
### `lib/db.ts` — migration `004_teachback_sessions`
Table with the columns above (FK projectId→projects ON DELETE CASCADE, index on (projectId, createdAt)).

### `lib/teachback.ts`
`insertTeachbackSession({...}) : TeachbackSession` (serializes JSON cols);
`listTeachbackSessions(projectId): TeachbackSession[]` (newest first).

### `lib/prompts/teachback.ts`
- `AnalysisSchema = { coverageScore: number(0..1), gaps: string[].default([]), misconceptions: string[].default([]), socraticQuestion: string }`.
- `ClosingSchema = { summary: string, masteredPoints: string[].default([]), stillMissing: string[].default([]) }`.
- `buildAnalysisPrompt({sectionTitle, sectionBody, explanation})` — compare the explanation to the section; list gaps/misconceptions; ask one Socratic question at the biggest gap.
- `buildClosingPrompt({sectionTitle, sectionBody, explanation, analysis, response})` — final assessment after the user answers the probe.

### `app/actions/teachback.ts` (tools-free)
- `loadTeachbackState(projectId) → { hasDossier, sections: {id,title,hasBody}[], past: TeachbackSession[] }`.
- `analyzeExplanation(projectId, sectionId, explanation) → Analysis` (throws on empty explanation / missing section).
- `submitSocraticResponse({projectId, sectionId, explanation, analysis, response}) → TeachbackSession` (closing + persist).
- Section body resolved from dossier via `parseDossierSections` matched by title.

### `components/teachback-runner.tsx` (client)
Section picker (empty disabled) → explanation textarea → "Analyze" → analysis
panel (coverage %, gaps, misconceptions, the Socratic question) → response
textarea → "Submit" → closing card (summary, mastered, still-missing) + past list.
`useTransition`; **commit state only on success, never mutate before the await**
(so a throw preserves the user's typed text for retry — the drills lesson). No
client import of `node:sqlite` (state carried via the loader; types via `import type`).

### `app/chat/[projectId]/teachback/page.tsx` + nav link "Teach-back".

## Error handling
No dossier / empty section → block / disable. API error → status; persist only in
`submitSocraticResponse` after a successful closing eval.

## Testing
- Unit: storage round-trip (tmp DB, JSON cols); prompt builders include
  section+explanation (+analysis+response for closing); schema validation/defaults.
- Opt-in live smoke (`KYS_LIVE`): drive real `analyzeExplanation` →
  `submitSocraticResponse` against the existing dossier; assert a coverage score
  in [0,1], a non-empty Socratic question, and a persisted session.

## Obligations
Reference-corpus check; verify by driving real actions; reuse the established grain; leave other features untouched.
