---
title: "feat: Interview Prep Tool (Know Your Stuff)"
status: active
type: feat
created: 2026-05-25
depth: Standard
---

# feat: Interview Prep Tool (Know Your Stuff)

A personal interview-prep tool that ingests a local codebase and uses an LLM to help the user build (a) business fluency — domain lingo, product concepts — and (b) technical fluency — architecture, key decisions, code patterns. Exposes an interactive chat UI for conversation, drill-down, and self-testing.

**Target repo:** `know-your-stuff` (this repo, greenfield)

---

## Problem Frame

Engineers preparing for interviews about projects they've built (or are about to build) need a way to rehearse explaining their work — both the business context ("what does this product do, in whose language") and the technical substance ("why is it shaped this way, what would you change"). Skimming the repo is not the same as articulating it under pressure. The tool turns a codebase into an interactive study partner: it reads what you've built, drafts the business framing, and lets you converse with an LLM in two modes — explain-it-to-me and quiz-me.

Single user (the author). Runs locally. No deployment target beyond `localhost`.

---

## Requirements

- **R1.** Point the tool at a local codebase by path and persist that selection across sessions.
- **R2.** Auto-derive a first-draft "business brief" from repo signals (README, top-level docs, package manifests). User can edit and append to it.
- **R3.** Interactive chat UI with explicit mode switching: **Business**, **Technical**, **Quiz**.
- **R4.** LLM has agentic tools to read files, list directories, and grep the selected codebase on demand — answers cite file paths.
- **R5.** Quiz mode generates questions grounded in the actual codebase + business brief, accepts free-text answers, and grades them with rationale.
- **R6.** LLM access goes through Vercel AI Gateway so the model can be swapped via a `"provider/model"` string.
- **R7.** Support multiple saved projects; switch between them without re-configuring.
- **R8.** Filesystem access is sandboxed to the selected project root — no path traversal outside it.

---

## Scope Boundaries

In scope:
- Local-only Next.js App Router app on `localhost`.
- On-demand agentic file reading (no embedding/RAG index).
- SQLite or flat-file local persistence for project metadata, business brief, and quiz progress.
- Single-user (no auth).

### Deferred to Follow-Up Work

- Vector embeddings / RAG for very large repos.
- Spaced-repetition scheduling for quiz items.
- Cross-repo comparison ("how does this differ from project X").
- Multi-user / cloud deployment.
- Voice input/output for mock-interview realism.

### Outside this product's identity

- A general-purpose code search tool.
- A code-review or refactor assistant.
- A team-knowledge-base product.

---

## Key Technical Decisions

- **Framework: Next.js 16 App Router.** Local execution, Server Actions for filesystem + LLM calls, streaming UI for chat. Single binary mental model (`pnpm dev`).
- **LLM access: Vercel AI Gateway via AI SDK v6** with `streamText` and tool calling. Default model `anthropic/claude-sonnet-4-6`; surface a model picker in settings.
- **Codebase ingestion: on-demand agentic reading.** Tools — `list_dir`, `read_file`, `grep` — exposed to the model. Per-question latency is acceptable for a personal study tool; sidesteps vector-DB infra.
- **Persistence: SQLite via `better-sqlite3`.** Tables for `projects`, `chat_messages`, `quiz_items`, `quiz_attempts`. Business brief stored as a markdown file inside `.know-your-stuff/` within the target project (portable + user-editable in any editor).
- **UI: shadcn/ui + Tailwind.** Chat panel (left), context panel showing currently-cited files (right), top-bar mode toggle + project switcher.
- **Filesystem safety:** all path inputs to tools are resolved against the project root with `path.resolve` + prefix check; reject anything escaping the root. Symlinks resolved and re-checked.
- **No auth / no network exposure:** dev server binds to `127.0.0.1` only.

---

## Output Structure

```
know-your-stuff/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                       # project picker / dashboard
│   ├── chat/[projectId]/page.tsx      # main chat UI
│   ├── api/
│   │   └── chat/route.ts              # streamText handler with tools
│   └── actions/
│       ├── projects.ts                # add/list/select project
│       ├── brief.ts                   # generate/load/save business brief
│       └── quiz.ts                    # generate/grade quiz items
├── lib/
│   ├── db.ts                          # better-sqlite3 instance + migrations
│   ├── fs-sandbox.ts                  # safe path resolution
│   ├── codebase-tools.ts              # list_dir / read_file / grep tools
│   ├── ai.ts                          # AI Gateway client + model config
│   └── prompts/
│       ├── business.ts
│       ├── technical.ts
│       └── quiz.ts
├── components/
│   ├── chat-panel.tsx
│   ├── mode-toggle.tsx
│   ├── project-switcher.tsx
│   ├── context-panel.tsx              # shows cited files
│   ├── brief-editor.tsx
│   └── quiz-runner.tsx
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── components.json                    # shadcn config
└── .know-your-stuff.db                # local sqlite (gitignored)
```

---

## High-Level Technical Design

*Directional guidance for review — not implementation specification.*

```
┌──────────────────────────────────────────────────────────────────┐
│ Browser (localhost:3000)                                         │
│  Project Switcher ── Mode Toggle [Business|Technical|Quiz]       │
│  ┌──────────────────────────┐  ┌─────────────────────────────┐   │
│  │ Chat Panel (streaming)   │  │ Context Panel               │   │
│  │  user → assistant turns  │  │  files cited in last answer │   │
│  └──────────────────────────┘  └─────────────────────────────┘   │
└────────────────────────────┬─────────────────────────────────────┘
                             │ Server Action / route handler
                             ▼
              ┌──────────────────────────┐
              │ /api/chat route          │
              │  streamText + tools      │
              │   mode-specific system   │
              │   prompt + brief.md      │
              └──────┬───────────────────┘
                     │
       ┌─────────────┼────────────────────────────┐
       ▼             ▼                            ▼
 ┌──────────┐  ┌──────────────┐         ┌────────────────────┐
 │ AI       │  │ Tool calls   │         │ SQLite (projects,  │
 │ Gateway  │  │ list_dir     │ ◀────── │ chat_messages,     │
 │ (Sonnet) │  │ read_file    │         │ quiz_items)        │
 └──────────┘  │ grep         │         └────────────────────┘
               └──────┬───────┘
                      ▼
              ┌───────────────┐
              │ fs-sandbox    │  (resolve against project root)
              └──────┬────────┘
                     ▼
              local codebase
```

Mode → behavior mapping:

| Mode | System prompt focus | Tools enabled | UI affordance |
|---|---|---|---|
| Business | Use brief.md + README; speak like a PM | read_file, list_dir | Citations from docs |
| Technical | Architecture, key decisions, code paths | read_file, list_dir, grep | Citations from code |
| Quiz | Generates Q → user answers → LLM grades | read_file, list_dir, grep | Show question, accept answer, reveal grading |

---

## Implementation Units

### U1. Project scaffold and tooling

- **Goal:** Stand up the Next.js 16 App Router project with Tailwind, shadcn/ui, AI SDK v6, and TypeScript strict mode.
- **Requirements:** Enables all R-IDs.
- **Dependencies:** none.
- **Files:**
  - `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`
  - `app/layout.tsx`, `app/page.tsx` (placeholder)
  - `components.json` (shadcn init)
  - `.gitignore` (add `.know-your-stuff.db`, `.env.local`)
  - `README.md` (one-screen quickstart)
- **Approach:** `pnpm create next-app` with App Router + TS + Tailwind. `pnpm dlx shadcn@latest init`. Add deps: `ai`, `@ai-sdk/react`, `better-sqlite3`, `zod`. Bind dev server to `127.0.0.1` via `next dev -H 127.0.0.1`.
- **Patterns to follow:** Vercel AI SDK v6 quickstart; shadcn default theme.
- **Test expectation:** none — pure scaffolding. Verification is `pnpm dev` boots on `127.0.0.1:3000` and renders a hello page.
- **Verification:** Dev server starts cleanly; type-check passes; default shadcn `Button` renders.

### U2. SQLite persistence and project model

- **Goal:** Local persistence layer with a `projects` table and CRUD Server Actions.
- **Requirements:** R1, R7.
- **Dependencies:** U1.
- **Files:**
  - `lib/db.ts` (singleton, migrations on first run)
  - `lib/schema.ts` (zod types for `Project`, etc.)
  - `app/actions/projects.ts` (`addProject`, `listProjects`, `deleteProject`, `setActiveProject`)
  - `__tests__/projects.test.ts`
- **Approach:** `better-sqlite3` with a `migrations` table; embed migration SQL as strings. `Project` = `{ id, name, rootPath, createdAt, lastOpenedAt }`. Validate `rootPath` exists and is a directory before insert.
- **Patterns to follow:** simple synchronous SQLite pattern (no ORM).
- **Test scenarios:**
  - Adding a project with a valid path persists and is retrievable by `listProjects`.
  - Adding with a non-existent path rejects with a clear error.
  - Adding with a path that is a file (not directory) rejects.
  - Deleting removes the row and any dependent rows (chat messages, quiz items).
  - `setActiveProject` updates `lastOpenedAt` and reads back as the most-recent.
- **Verification:** All scenarios pass; sqlite file appears at repo root; manual add/list/delete via a temporary debug page works.

### U3. Filesystem sandbox and codebase tools

- **Goal:** Safe file-access primitives the LLM can call as tools.
- **Requirements:** R4, R8.
- **Dependencies:** U2.
- **Files:**
  - `lib/fs-sandbox.ts`
  - `lib/codebase-tools.ts`
  - `__tests__/fs-sandbox.test.ts`
  - `__tests__/codebase-tools.test.ts`
- **Approach:** `resolveSafe(root, candidate)` resolves and asserts the result starts with `root + path.sep`; rejects symlinks pointing outside; rejects on null bytes. Tools:
  - `list_dir(path)` → entries with `{name, type, size}`; respects `.gitignore` + a baked-in skip list (`node_modules`, `.git`, `dist`, `.next`).
  - `read_file(path, {maxBytes})` → text content, default cap ~200 KB, returns `{truncated, content}`.
  - `grep(query, {path, maxResults})` → ripgrep-style via Node `child_process` if `rg` exists, else JS fallback walking the tree.
  Each tool exported with a zod schema for AI SDK tool definitions.
- **Execution note:** Test-first — security boundary is the whole point of this unit. Write the path-traversal test cases before the implementation.
- **Test scenarios:**
  - `resolveSafe` accepts `foo/bar.ts` inside root.
  - `resolveSafe` rejects `../../../etc/passwd`.
  - `resolveSafe` rejects an absolute path outside the root.
  - `resolveSafe` rejects a symlink whose target is outside the root (create a temp symlink in test setup).
  - `resolveSafe` rejects strings containing null bytes.
  - `list_dir` skips `node_modules` and `.git`.
  - `list_dir` honors a `.gitignore` entry.
  - `read_file` truncates at the byte cap and reports `truncated: true`.
  - `read_file` on a non-existent path returns a structured error, not a thrown exception.
  - `grep` finds matches across multiple files with correct file paths and line numbers.
  - `grep` falls back to JS implementation when `rg` is absent (mock `which`).
- **Verification:** All scenarios pass; tools are importable as AI SDK tool definitions.

### U4. AI Gateway client and mode-specific system prompts

- **Goal:** Centralized LLM access via Vercel AI Gateway with three system prompts (Business, Technical, Quiz).
- **Requirements:** R3, R6.
- **Dependencies:** U1.
- **Files:**
  - `lib/ai.ts` (gateway client, default model, model picker config)
  - `lib/prompts/business.ts`
  - `lib/prompts/technical.ts`
  - `lib/prompts/quiz.ts`
  - `.env.local.example` (`AI_GATEWAY_API_KEY=`)
  - `__tests__/prompts.test.ts` (snapshot-style sanity)
- **Approach:** Single `getModel(modelId?)` returning the AI SDK gateway model. Prompts are template functions taking `{projectName, briefMarkdown}` and returning a string. Business prompt instructs the model to lean on `brief.md` first, use `read_file` to cite docs second, and answer as a PM/founder would. Technical prompt instructs it to use `grep`+`read_file` to ground answers in code with file path citations. Quiz prompt instructs JSON output for question generation, plain prose for grading.
- **Patterns to follow:** Vercel AI SDK v6 `gateway()` provider; default to `anthropic/claude-sonnet-4-6`.
- **Test scenarios:**
  - Each prompt builder injects project name and brief content correctly.
  - Quiz prompt's JSON schema example is parseable by `zod`.
  - `getModel` returns a usable model object given a valid env var (integration-style — skip when env unset).
- **Verification:** Tests pass; manual `streamText` call from a scratch script returns tokens.

### U5. Business brief auto-generation and editor

- **Goal:** First-draft brief from repo signals + editable markdown surface.
- **Requirements:** R2.
- **Dependencies:** U3, U4.
- **Files:**
  - `app/actions/brief.ts` (`generateBrief`, `loadBrief`, `saveBrief`)
  - `components/brief-editor.tsx`
  - `app/chat/[projectId]/brief/page.tsx`
  - `__tests__/brief.test.ts`
- **Approach:** `generateBrief` reads README, top-level `*.md`, `package.json` description, and (if present) `STRATEGY.md` from the project root, then asks the LLM (non-streaming `generateText`) to produce a structured brief: *Product, Users, Core Value, Domain Lingo (glossary), Key Flows, Open Questions*. Saved to `<projectRoot>/.know-your-stuff/brief.md`. The editor is a plain `<textarea>` with save-on-blur; later iterations can swap in a richer editor.
- **Test scenarios:**
  - `generateBrief` on a fixture project (test fixtures dir with a README + package.json) produces a brief containing each required section header.
  - `saveBrief` writes to `.know-your-stuff/brief.md` and creates the directory if missing.
  - `loadBrief` returns empty string when the file doesn't yet exist (not an error).
  - `generateBrief` is a no-op overwrite-guard: if a brief already exists, returns it unless `force: true`.
- **Verification:** On a real repo, the generated brief is recognizable and editable; edits persist across reloads.

### U6. Chat UI with mode toggle, project switcher, and streaming

- **Goal:** The primary interactive surface — chat panel + context panel + mode toggle + project switcher.
- **Requirements:** R3, R4, R7.
- **Dependencies:** U2, U3, U4.
- **Files:**
  - `app/api/chat/route.ts` (`streamText` with mode-routed system prompt + tools)
  - `app/chat/[projectId]/page.tsx`
  - `components/chat-panel.tsx` (uses `useChat` from `@ai-sdk/react`)
  - `components/mode-toggle.tsx`
  - `components/project-switcher.tsx`
  - `components/context-panel.tsx`
  - `app/page.tsx` (project picker / add new)
  - `__tests__/chat-route.test.ts`
- **Approach:** Route handler reads `projectId` + `mode` from request body, loads the project root, instantiates the mode's system prompt with the brief, registers the codebase tools scoped to that root, and calls `streamText`. Tool calls render in the context panel: each `read_file` invocation pushes the file path to a "cited files" state. Mode toggle is a shadcn `Tabs` component. Project switcher is a shadcn `Select` populated from `listProjects`.
- **Test scenarios:**
  - POST to `/api/chat` with a known fixture project and a Business-mode question returns a streaming response.
  - The route refuses requests for a `projectId` not in the DB with a 404.
  - The route in Technical mode includes all three tools; in Business mode, `grep` is excluded.
  - Tool calls inside the stream emit annotated parts the UI can render (verify the SSE/data stream includes tool-call deltas).
  - Switching project mid-session loads the new project's chat history.
- **Verification:** Manual: start dev server, add this repo as a project, ask "what does this project do" in Business mode and "where is the chat route handler" in Technical mode — both produce grounded answers with cited paths.

### U7. Quiz mode

- **Goal:** Generate codebase-grounded questions, accept free-text answers, grade with rationale, persist attempts.
- **Requirements:** R5.
- **Dependencies:** U4, U5, U6.
- **Files:**
  - `app/actions/quiz.ts` (`generateQuizBatch`, `submitAnswer`, `listAttempts`)
  - `components/quiz-runner.tsx`
  - `app/chat/[projectId]/quiz/page.tsx`
  - `__tests__/quiz.test.ts`
- **Approach:** `generateQuizBatch({projectId, focus: 'business'|'technical', count})` calls the LLM with the quiz prompt + relevant context (brief for business; sampled file tree + targeted reads for technical), expecting JSON `{questions: [{id, prompt, idealAnswer, citations}]}`. Stored in `quiz_items`. `submitAnswer` sends `{question, userAnswer, idealAnswer}` to the LLM for grading → `{score: 0..1, rationale, missedPoints[]}`, stored in `quiz_attempts`. UI shows one question at a time with a textarea, reveals grading after submit, advances to next.
- **Test scenarios:**
  - `generateQuizBatch` returns the requested count and validates against the zod schema; malformed LLM output is retried once.
  - `submitAnswer` persists the attempt with score and rationale.
  - `listAttempts` returns most-recent first and includes the question text via join.
  - Quiz items reference real file paths (validated by attempting `read_file` on each citation).
  - Empty answer is rejected client-side, never sent.
- **Verification:** On a real repo, a 5-question business batch and 5-question technical batch generate, can be answered, and produce graded feedback that names what was missed.

### U8. Chat history persistence and session resume

- **Goal:** Chat messages persist per project + mode and reload on return.
- **Requirements:** R7.
- **Dependencies:** U2, U6.
- **Files:**
  - Migration in `lib/db.ts` for `chat_messages` table
  - `app/actions/chat-history.ts` (`appendMessage`, `loadHistory`, `clearHistory`)
  - Update `app/api/chat/route.ts` to append assistant + user messages
  - Update `components/chat-panel.tsx` to hydrate from history on mount
  - `__tests__/chat-history.test.ts`
- **Approach:** `chat_messages = {id, projectId, mode, role, content, toolCallsJson, createdAt}`. Hydrate `useChat`'s `initialMessages` from `loadHistory(projectId, mode)`. Provide a "Clear conversation" button per mode.
- **Test scenarios:**
  - Messages persist across page reload for the same project+mode.
  - Switching mode shows that mode's separate history (not mixed).
  - Switching projects shows that project's history.
  - `clearHistory` removes only the (project, mode) tuple's rows.
  - Tool-call metadata round-trips (stored and rehydrated correctly).
- **Verification:** Manual reload retains conversation; switching modes/projects shows correct separate threads.

---

## System-Wide Impact

- **Local filesystem:** the app reads arbitrary user-selected directories. Every tool call goes through `fs-sandbox` (U3). Any new code path that touches user paths must reuse that helper — never call `fs.readFile` with a user-supplied path directly.
- **LLM cost:** on-demand reading means tool-heavy turns. Default model is Sonnet for cost; expose a picker so the user can downgrade to Haiku for quiz grading.
- **Secrets:** `AI_GATEWAY_API_KEY` lives in `.env.local`; `.gitignore` must cover it and `.know-your-stuff.db`.

---

## Risks and Mitigations

- **Path traversal / data exfil via tool calls.** Mitigation: U3 sandbox is test-first; symlink and null-byte cases are explicit test scenarios; `grep` and `list_dir` go through the same resolver.
- **LLM returns malformed JSON for quiz generation.** Mitigation: zod-validate; one retry with a "your previous output was invalid JSON, here it is: …" follow-up; fail visibly on second failure.
- **Very large files blow context.** Mitigation: `read_file` has a default byte cap and reports truncation; system prompts instruct the model to `grep` first and read targeted ranges.
- **SQLite native binding install pain (`better-sqlite3`).** Fallback: if install is fragile on the user's machine, swap to `node:sqlite` (Node 22+) or LibSQL. Decision deferred to first install; not blocking the plan.
- **Brief drift from the repo over time.** Mitigation: brief is regeneratable; show a "regenerate from repo" button that diffs against the existing brief before overwriting.

---

## Deferred to Implementation

- Exact `useChat` v6 API surface for tool-call rendering (verify against current AI SDK release at U6 time).
- Whether to ship a default shadcn theme or pick a custom one — decided when U6 lands.
- `ripgrep` vs JS-fallback heuristic for `grep` (try `which rg`; choose at runtime).
- Migration mechanism: hand-rolled `migrations` table vs a tiny lib. Decide at U2 when the second migration appears.

---

## Verification Strategy

- Unit tests for `fs-sandbox`, codebase tools, persistence actions, prompt builders, quiz round-trip, and chat history.
- Manual end-to-end smoke after U6: this repo added as a project, business and technical chat each return grounded answers with citations.
- Manual quiz smoke after U7: generate 5 questions, answer 2 well + 2 poorly + 1 partial, confirm grading rationale is specific and references the codebase.
- No CI configured for v1 — solo local tool. `pnpm test` + `pnpm typecheck` is the discipline.
