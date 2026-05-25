---
module: "Vercel AI SDK / quiz generation"
date: 2026-05-25
problem_type: integration_issue
component: tooling
severity: high
symptoms:
  - "Model produced invalid JSON twice in a row."
  - "No object generated: response did not match schema."
  - "Model returns prose stating it could not access the codebase, despite custom tools being registered."
root_cause: wrong_api
resolution_type: code_fix
related_components:
  - tooling
tags:
  - ai-sdk
  - vercel-ai-sdk
  - experimental-output
  - tool-calling
  - structured-output
  - anthropic
  - generate-object
---

# Vercel AI SDK `experimental_output` blocks custom tools

## Problem

Vercel AI SDK v5's `experimental_output: Output.object({ schema })` parameter on `generateText` / `streamText` is incompatible with custom tools. When set, it forces `toolChoice` to a synthetic JSON-output tool, so the model never invokes any other tools you registered. Code paths that need both "model can use tools to do research" and "final answer must match a Zod schema" cannot use `experimental_output`.

## Symptoms

The bug surfaces differently depending on how you try to work around it:

- **Naive single-call with manual JSON parsing + retry:** `Error: Model produced invalid JSON twice in a row.` The model ends its turn after a tool call without ever emitting JSON, so the parser fails. Retry feedback rarely fixes it because the underlying issue is that the model never gets a chance to emit text.
- **`experimental_output: Output.object(...)`:** No error, but the model never calls your tools — it goes straight to producing the structured output. The structured output's content reflects only the prompt + brief, not the actual codebase. The model may even say so explicitly: *"I wasn't able to inspect the 'meridian' codebase directly — could you share the repository path, key source files, or a brief description of the project's architecture?"*
- **Two-phase `generateText` → `generateObject` with an under-budgeted research step:** `Error: No object generated: response did not match schema.` Phase 1 (research) ends inside the tool-call loop without producing text, so Phase 2 has nothing to convert, and `generateObject` rejects the empty input.

## What Didn't Work

Each attempt below was reasonable and failed in an instructive way.

1. **Single `generateText` call with a custom "JSON or retry once" wrapper.** The wrapper assumed the model would always emit JSON as its last step. With `tools` set and a `stopWhen: ({ steps }) => steps.length >= 8` cap, the model often used the entire budget on tool calls and never wrote a final answer. The "retry with feedback" pass appended the malformed-output instructions but the model still hit the step ceiling.

2. **Two-phase split into `generateText({ tools })` (research) and `generateObject({ schema })` (format), with the same 12-step budget on Phase 1.** Same step-budget problem migrated to Phase 1: when the model was still inside the tool-call loop at step 12, Phase 1's `text` was empty, and Phase 2's `generateObject` correctly raised `No object generated: response did not match schema.`

3. **Single-call with `experimental_output: Output.object({ schema: QuizBatchSchema })` and tools registered.** The SDK quietly sets `toolChoice` to its synthetic structured-output tool. Custom tools (`list_dir`, `read_file`, `grep`) are registered but never called. The model produces a structured response with content invented from the prompt alone. Catastrophic for an agentic workflow that depends on grounding: questions are well-formed JSON but completely untethered from the codebase.

4. **Loosening the Zod schema to `min(0)` on the questions array.** Removes the schema-validation error but does not fix the underlying problem (no questions ever produced).

## Solution

Use the two-phase pattern with an **explicit, deterministic research script** in Phase 1 and a **generous step budget**. Do not use `experimental_output` when you need both tools and structured output — those are currently mutually exclusive in AI SDK v5.

```ts
// app/actions/quiz.ts
import { generateObject, generateText } from "ai";

// Phase 1: research with tools. The prompt walks the model through a fixed
// process so it always reaches a "write the final list" step before the
// step budget runs out.
const tools = makeCodebaseTools(project.rootPath, {
  enable: { list_dir: true, read_file: true, grep: focus === "technical" },
});

const research = await generateText({
  model: getModel(),
  tools,
  stopWhen: ({ steps }) => steps.length >= 20, // generous budget
  prompt: `${baseSystemPrompt}

Process (follow exactly):
1. First, call list_dir on "." to see the project layout.
2. Use grep and read_file to explore specific interview-worthy files.
3. Then, in a plain-text response (NOT JSON), write exactly ${count}
   numbered questions. Each one: prompt, ideal answer, 0-3 citations.

End your turn with that list as plain text. The next step will convert
it to JSON.`,
});

// Fail loud if Phase 1 didn't actually produce text.
const text = research.text?.trim() ?? "";
if (!text || text.length < 80) {
  console.error("[quiz] research text empty/short. finishReason=", research.finishReason);
  console.error("[quiz] steps=", research.steps?.length, "toolCalls=",
    research.steps?.reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0));
  throw new Error(
    `Research phase didn't produce written output (finishReason=${research.finishReason}, steps=${research.steps?.length}). The model used its whole step budget on tool calls. Reduce question count.`,
  );
}

// Phase 2: format. No tools — generateObject can safely force the JSON tool.
const { object } = await generateObject({
  model: getModel(),
  schema: QuizBatchSchema,
  prompt: `Convert the following interview questions into the structured schema. Preserve question text and ideal answer verbatim.

Source material:
${text}`,
});
```

Three things make this work:

1. **Phase 1 has no `experimental_output`**, so `toolChoice` stays at `auto` and the model actually uses the tools.
2. **The prompt scripts the process explicitly** ("call list_dir, then explore, then write the list as plain text"). The model knows it must terminate on text, not a tool call.
3. **The step budget is generous** (20 for generation, 12 for grading) so tool-heavy turns still leave room for the final text step.

## Why This Works

`experimental_output` is implemented by adding a synthetic tool to the toolset and setting `toolChoice` to that tool. For provider implementations (Anthropic in particular) that respect a strict `toolChoice`, the model is forced to call only the JSON-output tool — every other tool is unreachable, including the ones you defined. There is no per-step toggle in the public API to make `toolChoice` switch from "any tool" to "JSON tool only" between steps, so you can't get both behaviors in one call.

`generateObject` works in Phase 2 because there are no other tools registered — its synthetic JSON tool is the only one, so the model has nothing to compete with.

The "model says I couldn't inspect the codebase" symptom is diagnostic. When chat mode (no `experimental_output`) sees and reads files fine, and quiz mode (with `experimental_output`) explicitly says it can't, the difference is the `toolChoice` constraint — not the toolset, not the model, not the project root.

## Prevention

1. **Treat `experimental_output` as a "structured-only" mode.** Use it when the model needs to return only a schema-conformant object and does not need to call your tools. Do not use it for agentic workflows.

2. **Default to two-phase for tools + structured output:**
   ```
   Phase 1: generateText({ tools, stopWhen, prompt: "...explicit process..., then write the result as plain text" })
   Phase 2: generateObject({ schema, prompt: "Convert this to the schema: ${phase1.text}" })
   ```

3. **Always script Phase 1's terminal step in the prompt.** "End your turn with the list as plain text" or "After exploring, write a 2-4 sentence assessment." Without this, the model may end on a tool call, leaving `text` empty.

4. **Set step budgets generously and fail loud when they're exhausted.** Phase 1 should have a budget that comfortably covers expected tool calls plus the final text step. If the budget is hit and `text` is empty, throw an explicit error with `finishReason`, step count, and total tool-call count — silent fallbacks make this class of bug very hard to diagnose.

5. **When debugging "schema didn't match" errors, check Phase 1 first.** The error surfaces in Phase 2 (`generateObject`), but the cause is almost always upstream — empty/truncated input from Phase 1, not a schema problem.

6. **Diagnostic snippet to drop in when investigating:**
   ```ts
   console.error("[debug] finishReason=", res.finishReason);
   console.error("[debug] text first 500 chars=", res.text?.slice(0, 500));
   console.error("[debug] step count=", res.steps?.length);
   console.error("[debug] tool calls per step=", res.steps?.map((s) => s.toolCalls?.length ?? 0));
   ```
   The combination of `finishReason === "stop"` with `text === ""` is the giveaway that the model ended in a tool-call loop.

## Originating context

- Repo: `know-your-stuff`
- Branch: `feat/interview-prep-tool`
- Fix commit: `f56c8be fix(quiz): two-phase with explicit research process, drop experimental_output`
- Stack: Vercel AI SDK v5.0.192, `@ai-sdk/anthropic` v2.0.79, Anthropic Sonnet 4.6, Next.js 16.2.6
- Files touched: `app/actions/quiz.ts`, `lib/prompts/quiz.ts`, `__tests__/prompts.test.ts`
