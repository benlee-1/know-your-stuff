# Know Your Stuff

A personal interview-prep tool. Point it at a local codebase; chat with an LLM in **Business**, **Technical**, or **Quiz** mode to build (and test) fluency on what you've built.

## Quickstart

```bash
pnpm install
cp .env.local.example .env.local   # add your Vercel AI Gateway key
pnpm dev                           # opens at http://127.0.0.1:3000
```

## How it works

- **Business mode** answers like a PM/founder, leaning on README + your editable `business-brief.md`.
- **Technical mode** answers like a staff engineer, grounding every claim in file paths via agentic `read_file` / `grep` / `list_dir` tool calls.
- **Quiz mode** generates codebase-grounded questions, accepts free-text answers, grades them with rationale.

LLM access is via Vercel AI Gateway — swap models by changing `DEFAULT_MODEL` in `.env.local`.

Local persistence: a SQLite file at the repo root (`.know-your-stuff.db`), plus a per-project `.know-your-stuff/brief.md` written inside each codebase you point at.

## Plan

See [docs/plans/2026-05-25-001-feat-interview-prep-tool-plan.md](docs/plans/2026-05-25-001-feat-interview-prep-tool-plan.md).
