---
module: "Next.js bundler / local persistence layer"
date: 2026-05-25
problem_type: runtime_error
component: tooling
severity: high
symptoms:
  - "Failed to load external module node:sqlite: ReferenceError: require is not defined"
  - "Cannot find module 'node:sqlite': Unsupported external type Url for commonjs reference"
  - "Cannot find module as expression is too dynamic"
  - "Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported."
root_cause: config_error
resolution_type: config_change
related_components:
  - database
tags:
  - turbopack
  - next-js
  - node-sqlite
  - webpack
  - bundler
  - server-component-serialization
  - node-26
---

# Turbopack 16 cannot resolve `node:sqlite`; switch dev/build to `--webpack`

## Problem

A Next.js 16 App Router app using Node.js's built-in `node:sqlite` for local persistence fails at server-side module evaluation time with `Failed to load external module node:sqlite: ReferenceError: require is not defined`. Every page that imports the DB layer returns HTTP 500. The same code runs fine under Vitest and `pnpm typecheck` passes — the failure is bundler-specific, not Node- or TypeScript-specific.

## Symptoms

- Dev server boots, but every request returns 500.
- Server log shows one of these errors depending on the workaround attempted:
  - `Failed to load external module node:sqlite: ReferenceError: require is not defined`
  - `Cannot find module 'node:sqlite': Unsupported external type Url for commonjs reference`
  - `Cannot find module as expression is too dynamic` (after attempting a runtime-built module name)
- Once the DB does load, navigating to a page that passes a DB row to a Client Component throws: `Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported.`

## What Didn't Work

Each attempt below was reasonable and each one failed in a distinct, instructive way.

1. **Plain ESM import (`import { DatabaseSync } from "node:sqlite"`)** — Turbopack 16 tries to externalize the module but emits a CJS-style `require("node:sqlite")` into the dev-mode SSR chunk. The chunk runs in an ESM context where `require` is undefined.

2. **`serverExternalPackages: ["node:sqlite"]` in `next.config.ts`** — No effect. The `node:` prefix is mis-parsed as a URL, not a package name, so the option doesn't reach the externalization path.

3. **`createRequire(import.meta.url)` with a literal `"node:sqlite"` arg** — Turbopack still statically resolves the literal string and rejects the import the same way as the direct ESM form.

4. **`createRequire` with a runtime-built name (`["node", "sqlite"].join(":")`)** — Turbopack's analyzer flags this with `Cannot find module as expression is too dynamic`. It refuses to leave any unresolved import in the graph, even with `createRequire` as the call site.

5. **Indirect-eval `require` (`const r = (0, eval)("require"); r("node:sqlite")`)** — Defeats the analyzer, but Next.js's dev-mode SSR runs the module in ESM, where there is no `require` global to retrieve via `eval`. Fails at runtime with `ReferenceError: require is not defined`.

6. **Falling back to `better-sqlite3`** — Two failure modes:
   - No prebuilt binary for Node 26 / darwin-arm64.
   - Source compile via `npm install` fails: `better-sqlite3@11.10.0` does not compile against Node 26's V8 headers (multiple `V8_DEPRECATED` usages now hard errors; 6 compile errors in `src/better_sqlite3.cpp`).

## Solution

Switch the dev and build scripts to use Next.js's `--webpack` flag. Webpack handles `node:`-prefixed built-ins correctly and the plain ESM import works as written.

`package.json`:

```json
{
  "scripts": {
    "dev": "next dev --webpack -H 127.0.0.1",
    "build": "next build --webpack",
    "start": "next start -H 127.0.0.1"
  }
}
```

`lib/db.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;
  const db = new DatabaseSync(resolveDbPath());
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  _db = db;
  return db;
}
```

No `createRequire`, no `eval`, no `serverExternalPackages` config. Webpack's externalization for Node built-ins Just Works.

### Secondary fix — null-prototype rows across Server → Client boundary

`node:sqlite`'s `Statement.prototype.all()` and `.get()` return rows whose prototype is `Object.create(null)` (a deliberate optimization — no inherited keys to worry about). Next.js's Server → Client serializer rejects these because they fail the "is plain object" check.

Add a thin helper in `lib/db.ts` and apply it at every read boundary:

```ts
export function toPlain<T>(row: T | undefined | null): T | null {
  if (row == null) return null;
  return { ...row } as T;
}

export function toPlainArray<T>(rows: T[]): T[] {
  return rows.map((r) => ({ ...r }) as T);
}
```

Use them in every data-access function that crosses to a Client Component:

```ts
// lib/projects.ts
export function listProjectsRaw(): Project[] {
  const rows = getDb()
    .prepare("SELECT * FROM projects ORDER BY lastOpenedAt DESC")
    .all() as Project[];
  return toPlainArray(rows);
}

export function getProjectRaw(id: string): Project | null {
  const row = getDb()
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as Project | undefined;
  return toPlain(row);
}
```

The spread `{ ...row }` produces a fresh object with the standard `Object.prototype`, which the boundary accepts.

## Why This Works

**Bundler fix.** Webpack treats `node:`-prefixed specifiers as Node built-ins and externalizes them via Node's actual module loader at runtime. Turbopack 16's externalization pipeline mis-routes them through a URL-style CJS require that runs inside an ESM chunk where `require` does not exist. This is a Turbopack bug or unfinished feature, not something you can work around inside user code — the bundler must hand off built-ins correctly. `--webpack` does that.

**Serialization fix.** `node:sqlite` returns rows with `Object.create(null)` for performance (no prototype chain to walk, no inherited keys). Next.js's RSC payload encoder calls `Object.prototype.toString.call(value)` to validate "plain object" — null-prototype objects return `[object Object]` but fail an internal prototype check designed to reject `Map`/`Set`/custom classes. Spreading into a fresh literal restores the standard prototype and the encoder accepts the value.

## Prevention

1. **Pick a bundler-friendly DB up front.** For a Next.js + Node-26 app, the choices currently sort as:
   - **`node:sqlite` + `--webpack`** — works today, zero dependencies, but locks you out of Turbopack until the upstream issue is fixed.
   - **`better-sqlite3`** — works with either bundler once it ships a Node-26 prebuilt (or you stay on Node 22/24).
   - **WASM SQLite** (`@sqlite.org/sqlite-wasm`) — bundler-agnostic, no native compile, slower than the others.

   If you need Turbopack-in-dev for any reason (Tailwind 4 features, faster HMR), don't reach for `node:sqlite`.

2. **Detect the class of problem fast.** If `pnpm test` and `pnpm typecheck` both pass but a Next.js route returns 500 on a Node built-in import, the bundler is almost always the culprit — not the import. Don't burn an hour on `createRequire` / `eval` / config tweaks before testing `next dev --webpack`.

3. **Make Server → Client serialization explicit.** When the DB returns rows directly to React Server Components, route every read through a `toPlain`/`toPlainArray` helper at the lib boundary. This is a one-line fix per query and prevents the null-prototype foot-gun from re-appearing every time someone adds a new query.

4. **Watch for these specific error strings as a confirmation that this learning applies:**
   - `Failed to load external module node:` (anything) → bundler can't externalize a Node built-in.
   - `Unsupported external type Url for commonjs reference` → same root cause, different attempt.
   - `Only plain objects … can be passed to Client Components` with the offending value showing object literal syntax → null-prototype serialization issue.

5. **When `pnpm approve-builds` prompts you to compile a native module against Node 26, build a quick checklist first:**
   - Does the package have a Node-26 prebuilt? (`npm view <pkg> dist | grep node-v`).
   - Has the package shipped a release after Node 26's release? (`npm view <pkg> time.modified`).
   - If both are "no," compiling will almost certainly fail on V8 API changes. Skip ahead to alternatives.

## Originating context

- Repo: `know-your-stuff`
- Branch: `feat/interview-prep-tool`
- Commit: `d0d19d7 fix: dev server runs with webpack, plain-object serialization, hydration`
- Files touched by the fix: `lib/db.ts`, `lib/projects.ts`, `lib/chat-history.ts`, `lib/quiz.ts`, `package.json`, `app/layout.tsx`
- Stack: Next.js 16.2.6, React 19, Node 26.0.0, pnpm 10.4.1, darwin-arm64
