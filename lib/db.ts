import { DatabaseSync } from "node:sqlite";
import path from "node:path";

let _db: DatabaseSync | null = null;

export type Db = DatabaseSync;

/**
 * node:sqlite returns rows with `Object.create(null)` prototypes. Next.js refuses
 * to serialize those across the Server → Client boundary, so we copy into a plain
 * object at every read boundary.
 */
export function toPlain<T>(row: T | undefined | null): T | null {
  if (row == null) return null;
  return { ...row } as T;
}

export function toPlainArray<T>(rows: T[]): T[] {
  return rows.map((r) => ({ ...r }) as T);
}

function resolveDbPath(): string {
  return process.env.KYS_DB_PATH ?? path.join(process.cwd(), ".know-your-stuff.db");
}

export function getDb(): Db {
  if (_db) return _db;
  const db = new DatabaseSync(resolveDbPath());
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  _db = db;
  return db;
}

const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_init",
    sql: `
      CREATE TABLE projects (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        rootPath      TEXT NOT NULL UNIQUE,
        createdAt     INTEGER NOT NULL,
        lastOpenedAt  INTEGER NOT NULL
      );

      CREATE TABLE chat_messages (
        id            TEXT PRIMARY KEY,
        projectId     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        mode          TEXT NOT NULL,
        role          TEXT NOT NULL,
        content       TEXT NOT NULL,
        toolCallsJson TEXT,
        createdAt     INTEGER NOT NULL
      );
      CREATE INDEX idx_chat_project_mode ON chat_messages(projectId, mode, createdAt);

      CREATE TABLE quiz_items (
        id            TEXT PRIMARY KEY,
        projectId     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        focus         TEXT NOT NULL,
        prompt        TEXT NOT NULL,
        idealAnswer   TEXT NOT NULL,
        citationsJson TEXT NOT NULL,
        createdAt     INTEGER NOT NULL
      );

      CREATE TABLE quiz_attempts (
        id              TEXT PRIMARY KEY,
        quizItemId      TEXT NOT NULL REFERENCES quiz_items(id) ON DELETE CASCADE,
        userAnswer      TEXT NOT NULL,
        score           REAL NOT NULL,
        rationale       TEXT NOT NULL,
        missedPointsJson TEXT NOT NULL,
        createdAt       INTEGER NOT NULL
      );
    `,
  },
  {
    name: "002_walkthrough_progress",
    sql: `
      CREATE TABLE walkthrough_progress (
        id         TEXT PRIMARY KEY,
        projectId  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        sectionId  TEXT NOT NULL,
        passed     INTEGER NOT NULL,
        bestScore  REAL NOT NULL,
        attempts   INTEGER NOT NULL,
        updatedAt  INTEGER NOT NULL,
        UNIQUE(projectId, sectionId)
      );
    `,
  },
  {
    name: "003_drill_sessions",
    sql: `
      CREATE TABLE drill_sessions (
        id             TEXT PRIMARY KEY,
        projectId      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        sectionId      TEXT NOT NULL,
        transcriptJson TEXT NOT NULL,
        score          REAL NOT NULL,
        strengthsJson  TEXT NOT NULL,
        weaknessesJson TEXT NOT NULL,
        createdAt      INTEGER NOT NULL
      );
      CREATE INDEX idx_drills_project ON drill_sessions(projectId, createdAt);
    `,
  },
  {
    name: "004_teachback_sessions",
    sql: `
      CREATE TABLE teachback_sessions (
        id               TEXT PRIMARY KEY,
        projectId        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        sectionId        TEXT NOT NULL,
        explanation      TEXT NOT NULL,
        coverageScore    REAL NOT NULL,
        gapsJson         TEXT NOT NULL,
        socraticQuestion TEXT NOT NULL,
        response         TEXT NOT NULL,
        summary          TEXT NOT NULL,
        stillMissingJson TEXT NOT NULL,
        createdAt        INTEGER NOT NULL
      );
      CREATE INDEX idx_teachback_project ON teachback_sessions(projectId, createdAt);
    `,
  },
  {
    name: "005_teachback_mastered_points",
    sql: `ALTER TABLE teachback_sessions ADD COLUMN masteredPointsJson TEXT NOT NULL DEFAULT '[]';`,
  },
];

function runMigrations(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name      TEXT PRIMARY KEY,
      appliedAt INTEGER NOT NULL
    );
  `);
  const applied = new Set(
    db
      .prepare("SELECT name FROM migrations")
      .all()
      .map((r) => (r as { name: string }).name),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO migrations (name, appliedAt) VALUES (?, ?)").run(m.name, Date.now());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

// Test helper — closes the singleton so tests can use ephemeral databases.
export function _resetDbForTests() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
