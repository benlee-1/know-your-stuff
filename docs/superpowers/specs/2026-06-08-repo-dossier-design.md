# Repo Dossier — Design Spec

**Date:** 2026-06-08
**Status:** Approved for planning
**Scope:** Subsystem #1 of 5 (see "Roadmap" below). This spec covers the **dossier** only.

## Summary

Add a **dossier** capability to Know Your Stuff: point the tool at a local
codebase and generate a code-grounded "understanding doc" organized around how a
system-design interview actually unfolds — what it's for, who it's for, the
architecture, the data model, the key flows, the decisions and trade-offs, where
it strains, and how it fails.

The dossier is the foundation the four later learning modes build on. It is an
editable, git-diffable Markdown artifact the user reads first and hand-corrects.

## Roadmap (context, not in scope here)

The user wants five subsystems, each its own spec → plan → build cycle, built in
order. Only #1 is specified here.

1. **Dossier** (this spec) — generate / view / edit / regenerate the
   understanding doc.
2. **Guided walkthrough** — section-by-section tour with comprehension checks.
   Maps 1:1 onto dossier sections.
3. **Mock interview drills** — tool plays interviewer, probes, scores answers.
4. **Socratic teach-back** — user explains, tool finds gaps and corrects.
5. **Spaced repetition** — key facts/decisions become scheduled flashcards
   across sessions.

Learning state (drill attempts, spaced-rep schedule) is a DB concern introduced
by #3–#5, not here.

## Goals

- Generate a dossier grounded in the real code, with every substantive claim
  citing a real file path.
- Organize it around eight fixed interview-dimension sections (below).
- Degrade gracefully: when a dimension is genuinely thin in the repo, say so
  ("not demonstrated in this repo") rather than inventing a story.
- Make it editable and regenerable per-section, so the user can hand-correct and
  cheaply refresh a single weak section.

## Non-goals

- No interactive learning modes (those are subsystems #2–#5).
- No DB schema changes.
- No multi-repo / remote-repo support — local project roots only, as today.

## Architecture

Reuses the existing grain rather than building a new engine:

- **Agentic grounding** — the same `list_dir` / `read_file` / `grep` tools
  (`lib/codebase-tools-ai.ts`, scoped to the project root) that Technical mode
  already uses to ground claims in file paths.
- **File artifact** — `.know-your-stuff/dossier.md`, sibling of `brief.md`,
  using storage helpers that mirror `lib/brief.ts` (including its symlink-refusal
  write guard).
- **Section-by-section generation** — one bounded `generateText` call per
  section. Predictable cost, resumable, and a single weak section can be
  regenerated without redoing the whole file. The sections also become the
  guided-walkthrough units in subsystem #2.

### The eight sections

In interview-arc order:

1. **Problem & Users** — what it's for, who it's for.
2. **Requirements** — functional + non-functional, inferred from code/config.
3. **High-level Architecture** — components and how they connect.
4. **Data Model** — entities, schemas, persistence.
5. **Key Flows** — the main request/data paths end-to-end.
6. **Decisions & Trade-offs** — the "why", ADR-style, with plausible
   alternatives.
7. **Scale & Bottlenecks** — where it strains; "not demonstrated in this repo"
   when thin.
8. **Failure Modes** — what breaks, how it's handled.

## Components

### `lib/dossier.ts`

- `DOSSIER_DIR` / `DOSSIER_FILENAME` constants; `dossierPath(projectRoot)`.
- `loadDossierSync(projectRoot): string` — empty string when absent.
- `saveDossierSync(projectRoot, markdown)` — `mkdir -p` + write, with the same
  `lstat` symlink-refusal guard as `saveBriefSync` (an untrusted interview-prep
  repo could ship `.know-your-stuff -> ~/.config`).
- `DOSSIER_SECTIONS`: ordered array of `{ id, title, prompt }` — the section
  checklist. `id` is a stable slug (e.g. `architecture`), `title` is the Markdown
  header text, `prompt` is the section-specific generation instruction.
- `assembleDossier(sections: { title, body }[]): string` — joins completed
  sections under `# {title}` headers into the full document.

### `lib/prompts/dossier.ts`

- `buildDossierSectionPrompt(ctx: { projectName, sectionTitle, sectionPrompt, briefMarkdown }): string`
  — a per-section system prompt that carries the Technical-mode grounding
  discipline forward verbatim:
  1. orient with `list_dir`, locate with `grep`, confirm with `read_file`;
  2. **cite a real file path (line numbers where relevant) for every
     substantive claim**;
  3. when evidence is absent, write **"not demonstrated in this repo"** — never
     guess or invent.
  The brief is optional context ("answer from code only" when absent).

### `app/actions/dossier.ts` (server actions, local-only by construction)

- `generateDossier(projectId)` — runs all eight sections sequentially; returns
  progress/results. Assembles and writes the file only from successfully
  completed sections.
- `generateSection(projectId, sectionId)` — re-runs one section's agentic pass
  and swaps it into the existing file.
- `loadDossier(projectId)` / `saveDossier(projectId, markdown)` — same shape as
  `app/actions/brief.ts`.

Each generation call uses `getModel()`, `makeCodebaseTools(root, { enable: { list_dir: true, read_file: true, grep: true } })`,
and `generateText` with a step cap (bounded agentic loop). Not the chat route —
generation is a server action.

### `app/chat/[projectId]/dossier/page.tsx`

- Reachable from the existing project nav alongside Brief/Quiz.
- Renders `dossier.md` via the existing `components/markdown.tsx`.
- **Generate** control when no dossier exists — streams progress
  ("Generating Architecture… 3/8").
- **Regenerate section** — per-section button; re-runs just that section.
- **Edit** — reuse the `components/brief-editor.tsx` pattern (textarea + save),
  inheriting its proven async-write race fix.

## Data flow

```
generateDossier(projectId)
  └─ for each section in DOSSIER_SECTIONS (sequential):
       buildDossierSectionPrompt(...)  →  generateText(model, tools, stopWhen=stepCap)
         └─ agentic: list_dir / grep / read_file against project root
       on success → keep { title, body }
       on no-evidence → body is the "not demonstrated" line (still a success)
       on error (429/5xx) → mark section failed, skip, continue
  └─ assembleDossier(successful sections) → saveDossierSync(root, md)
  └─ return { written: bool, failedSectionIds: string[] }
```

## Error handling & graceful degradation

- **Thin dimension** → section emits "not demonstrated in this repo"; this is a
  successful section, not a failure. Critical for repos like the test target,
  `weekly-commit-module` (a Java/Nx monorepo where Scale and Failure Modes may
  legitimately be thin).
- **Section call error** (429/5xx/network) → mark that section failed, skip it,
  continue the run. The UI flags which sections need a retry.
- **No half-written file** → each section's body is held in memory; the file is
  assembled and written only at the end (or, for `generateSection`, swapped
  atomically into the existing file). A failed run never corrupts an existing
  dossier.
- **Missing API key** → `getModel()` already throws a clear, surfaced error.

## Testing & verification

- **Unit — `lib/dossier.ts`:** section checklist shape; `assembleDossier`
  joins under correct headers; storage round-trip; symlink-refusal guard
  (mirrors existing brief/quiz tests in `__tests__`).
- **Integration / acceptance (drive it, don't screenshot):** run
  `generateDossier` against `~/code/weekly-commit-module` and assert:
  (a) every file path cited in the output actually exists on disk;
  (b) thin dimensions degraded to "not demonstrated in this repo" rather than
  fabricating. This path-existence assertion is the gate, per the user's
  "verify by driving real interactions and asserting outcomes" rule.

## Implementation obligations (user global rules)

- **Reference-corpus check** before writing the dossier generator (a non-trivial
  unit): `search_references` / `list_references` for an agentic-generation
  exemplar; adapt it if one fits, and report which was used or that none matched.
- **Verification = driving the real interaction** (the integration gate above),
  not visual confirmation.
- **Land a verified baseline before flair:** generation + view first, then
  per-section regenerate, then edit — each behind its own check.

## Open questions

None blocking. Step-cap value per section and exact progress-streaming mechanism
(server action with incremental returns vs. a route) are implementation details
to settle in the plan.
