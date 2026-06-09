---
module: "Vercel AI SDK / dossier generation"
date: 2026-06-08
problem_type: integration_issue
component: tooling
severity: high
symptoms:
  - "Agentic generateText returns empty text; several sections come back blank."
  - "A section body is the model's mid-exploration narration, not the content."
  - "Acceptance test reports empty/wrong output while the real feature works fine."
root_cause: wrong_api
resolution_type: code_fix
related_components:
  - tooling
  - testing
tags:
  - ai-sdk
  - vercel-ai-sdk
  - tool-calling
  - two-phase
  - agentic
  - anthropic
  - test-fidelity
---

# Dossier two-phase generation + the acceptance-test fidelity trap

Building the repo-dossier generator (one grounded section per agentic pass) hit
three failures in sequence. Each was confirmed by a cheap probe before fixing —
do not skip the probe; two plausible theories were disproven by it.

## Symptom 1 — empty sections from a single agentic call

`generateText({ tools, stopWhen: ({steps}) => steps.length >= 12 })` returned
`res.text === ""` with `finishReason: "tool-calls"` for ~6 of 8 sections on a
real monorepo. Probe of one empty section: `steps: 12`, `stepTextLens: [115, 0,
0, …]` — only the first step (a "I'll start by exploring…" preamble) had text;
the model spent all 12 steps on tool calls and **never reached a write step**.
This is the same failure as `ai-sdk-experimental-output-blocks-custom-tools.md`:
tools + a step cap, no scripted terminal step ⇒ the model ends in a tool-call
loop with empty text.

Raising the cap to 20 and prompting "stop calling tools and write" did **not**
fix it — on a large repo the model keeps finding more to read and never
voluntarily stops. **You cannot rely on the model deciding to stop.**

## Symptom 2 — Phase-1 text is narration, not the section

The robust fix is two-phase: Phase 1 explores with tools; **Phase 2 replays the
gathered messages with NO tools**, so the model has nothing to call and must
emit prose. With `messages: [userPrompt, ...research.response.messages, "now
write the section, body only"]` and no `tools`, Phase 2 reliably produced
6–10 KB grounded sections.

But an early-return optimisation — "if Phase 1 already produced text, use it" —
reintroduced the bug in disguise. The model emits a mid-exploration text block
like *"I now have sufficient evidence to write the section. Let me do one final
check on the K8s manifest…"* and then calls more tools. That narration is
non-empty, so the shortcut returned **it** as the section body. Fix: **always
run Phase 2.** Treat Phase 1's prose as scratch, never as the answer. Ending on
a tool call (or on narration) is the expected Phase 1 outcome.

## Symptom 3 — the acceptance test validated a divergent copy

The live acceptance test **inlined its own** `generateText({ stopWhen: steps>=12
})` generator instead of importing the real one. So every fix above landed in
`app/actions/dossier.ts`, was confirmed by a standalone probe, and **never ran
in the test** — the test kept reporting empty sections from the old single-phase
code. This wastes 20-minute live runs chasing a bug you already fixed.

Fix: extract the generation core into a plain module
(`lib/dossier-generate.ts`, exporting `generateSectionBody` /
`generateAllSections`) that **both** the `"use server"` action and the
acceptance test import. One source of truth. The test now drives the real
production path; `failedSectionIds` (the two-phase generator throws on empty)
becomes a real assertion that an empty section fails the gate.

## Prevention

1. **Tools + a required final answer ⇒ two-phase, and Phase 2 always runs.**
   Phase 1 = explore (tools, generous cap). Phase 2 = `generateText` with **no
   tools**, replaying `research.response.messages`, forced to write. Never
   early-return on Phase 1 text — it may be narration.
2. **Empty/whitespace output must throw, never silently succeed.** A blank
   section sailing through `failedSectionIds === []` is how 6 blank sections
   shipped "successfully." Guard with `isUsableSectionText` and surface the
   failure.
3. **Acceptance/integration tests must import the real code path.** If a test
   re-implements the logic it claims to verify, it verifies nothing. Extract a
   shared core; never copy generation logic into the test.
4. **Decouple expensive verification from iteration.** Persist the generated
   artifact to disk; iterate gate/parse logic offline against the saved file.
   Probe ONE unit (~2 min) before committing to a full 20-minute run.
5. **Read the artifact.** A green path-existence gate proved cited paths exist;
   it did **not** catch that a section was pure narration or that 6 were blank.
   Only reading the output caught those. Green gate ≠ good output.

## Originating context

- Repo: `know-your-stuff`, branch `feat/repo-dossier`
- Files: `lib/dossier-generate.ts`, `app/actions/dossier.ts`,
  `__tests__/dossier-acceptance.test.ts`, `lib/repo-path-resolver.ts`
- Target under test: `~/code/weekly-commit-module` (Java 21 / Spring Boot / Nx)
- Related: `ai-sdk-experimental-output-blocks-custom-tools.md` (the quiz feature
  hit the same tools-vs-final-answer wall and also resolved to two-phase).
