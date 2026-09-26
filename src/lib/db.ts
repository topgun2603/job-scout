import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Job, JobRow, JobStatus, RunRow } from "./types";

export const DB_PATH = path.resolve(process.cwd(), "data/jobs.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id              INTEGER PRIMARY KEY,
  source          TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  fingerprint     TEXT NOT NULL,          -- hash(lower(title)+lower(company))
  title TEXT, company TEXT, location TEXT, remote INTEGER, country TEXT,
  exp_min INTEGER, exp_max INTEGER, salary TEXT, skills TEXT, batch TEXT,
  description TEXT, posted_at TEXT, url TEXT,
  flags           TEXT,                   -- JSON array of warnings
  score INTEGER, score_reasons TEXT, matched_skills TEXT,
  filter_reason   TEXT,                   -- why the seniority filter dropped it
  first_seen      TEXT NOT NULL,
  last_seen       TEXT NOT NULL,
  status          TEXT DEFAULT 'new',     -- new | applied | skipped | filtered
  status_changed_at TEXT,
  UNIQUE(source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_fp ON jobs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_status ON jobs(status);

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'applicant',   -- admin | applicant
  full_name       TEXT NOT NULL DEFAULT '',
  email TEXT, phone TEXT, graduation_year INTEGER,
  locations       TEXT DEFAULT '[]',
  core_skills     TEXT DEFAULT '[]',
  bonus_skills    TEXT DEFAULT '[]',
  notes           TEXT,
  resume_path     TEXT, resume_name TEXT, resume_pages INTEGER, resume_size INTEGER, resume_uploaded_at TEXT,
  access_plan     TEXT, access_expires_at TEXT,
  disabled        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_log (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,             -- grant | revoke
  plan        TEXT,
  expires_at  TEXT,
  at          TEXT NOT NULL
);

-- Up to 3 resume versions per applicant (the 1-month pass shows all 3, other passes the first).
CREATE TABLE IF NOT EXISTS resumes (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT,
  path        TEXT NOT NULL,
  name        TEXT NOT NULL,
  pages       INTEGER NOT NULL,
  size        INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);

-- Applied / skipped is per user; jobs.status only holds the shared filter verdict.
CREATE TABLE IF NOT EXISTS user_jobs (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,             -- applied | skipped
  changed_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, job_id)
);

-- MNC careers-page probe: one row per company checked, its matched roles below. Replaced wholesale on import.
CREATE TABLE IF NOT EXISTS mnc_companies (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  careers_url TEXT,
  status      TEXT NOT NULL,             -- ok | no-match | blocked | error
  note        TEXT,
  checked_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mnc_roles (
  id          INTEGER PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES mnc_companies(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  location    TEXT, experience TEXT, posted TEXT, url TEXT,
  fit         INTEGER NOT NULL,          -- 1-5
  why         TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status      TEXT NOT NULL,              -- running | ok | error
  fetched     INTEGER DEFAULT 0,
  inserted    INTEGER DEFAULT 0,
  message     TEXT
);
`;

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    // One-time move from the old single-resume columns on users.
    db.exec(`
      INSERT INTO resumes (user_id, label, path, name, pages, size, uploaded_at)
        SELECT id, NULL, resume_path, resume_name, COALESCE(resume_pages, 1), COALESCE(resume_size, 0), resume_uploaded_at
        FROM users WHERE resume_path IS NOT NULL AND id NOT IN (SELECT user_id FROM resumes);
      UPDATE users SET resume_path = NULL WHERE resume_path IS NOT NULL;
    `);
  }
  return db;
}

type Raw = Record<string, unknown>;
const json = <T>(v: unknown, fallback: T): T => {
  try {
    return v ? (JSON.parse(String(v)) as T) : fallback;
  } catch {
    return fallback;
  }
};
const opt = <T>(v: unknown) => (v === null || v === undefined ? undefined : (v as T));

function toRow(r: Raw): JobRow {
  return {
    id: r.id as number,
    source: r.source as string,
    sourceId: r.source_id as string,
    fingerprint: r.fingerprint as string,
    title: r.title as string,
    company: r.company as string,
    location: json<string[]>(r.location, []),
    remote: Boolean(r.remote),
    country: opt(r.country),
    expMin: opt(r.exp_min),
    expMax: opt(r.exp_max),
    salary: opt(r.salary),
    skills: json<string[]>(r.skills, []),
    batch: opt(r.batch),
    description: opt(r.description),
    postedAt: opt(r.posted_at),
    url: r.url as string,
    flags: json<string[]>(r.flags, []),
    score: (r.score as number) ?? 0,
    scoreReasons: json<string[]>(r.score_reasons, []),
    matchedSkills: json<string[]>(r.matched_skills, []),
    filterReason: opt(r.filter_reason),
    firstSeen: r.first_seen as string,
    lastSeen: r.last_seen as string,
    status: r.status as JobStatus,
    statusChangedAt: opt(r.status_changed_at),
  };
}

export interface UpsertResult {
  inserted: number;
  known: number;
  duplicates: number;
}

/**
 * Dedupe against the database: same (source, source_id) just refreshes last_seen;
 * a different listing with the same fingerprint (repost, or another source) is skipped.
 */
export function upsertJobs(jobs: Array<Job & { fingerprint: string }>, now = new Date().toISOString()): UpsertResult {
  const d = getDb();
  const bySourceId = d.prepare("SELECT id FROM jobs WHERE source = ? AND source_id = ?");
  const byFingerprint = d.prepare("SELECT id FROM jobs WHERE fingerprint = ? LIMIT 1");
  const touch = d.prepare("UPDATE jobs SET last_seen = ?, posted_at = COALESCE(?, posted_at) WHERE id = ?");
  const insert = d.prepare(`
    INSERT INTO jobs (source, source_id, fingerprint, title, company, location, remote, country, exp_min, exp_max,
      salary, skills, batch, description, posted_at, url, flags, first_seen, last_seen, status)
    VALUES (@source, @sourceId, @fingerprint, @title, @company, @location, @remote, @country, @expMin, @expMax,
      @salary, @skills, @batch, @description, @postedAt, @url, @flags, @now, @now, 'new')`);

  const result: UpsertResult = { inserted: 0, known: 0, duplicates: 0 };
  d.transaction(() => {
    for (const j of jobs) {
      const same = bySourceId.get(j.source, j.sourceId) as { id: number } | undefined;
      if (same) {
        touch.run(now, j.postedAt ?? null, same.id);
        result.known++;
        continue;
      }
      const twin = byFingerprint.get(j.fingerprint) as { id: number } | undefined;
      if (twin) {
        touch.run(now, null, twin.id);
        result.duplicates++;
        continue;
      }
      insert.run({
        ...j,
        location: JSON.stringify(j.location),
        remote: j.remote ? 1 : 0,
        country: j.country ?? null,
        expMin: j.expMin ?? null,
        expMax: j.expMax ?? null,
        salary: j.salary ?? null,
        skills: JSON.stringify(j.skills),
        batch: j.batch ?? null,
        description: j.description ?? null,
        postedAt: j.postedAt ?? null,
        flags: JSON.stringify(j.flags),
        now,
      });
      result.inserted++;
    }
  })();
  return result;
}

/** Rows whose verdict can still change when the config changes. */
export function jobsToEvaluate(): JobRow[] {
  return (getDb().prepare("SELECT * FROM jobs WHERE status IN ('new', 'filtered')").all() as Raw[]).map(toRow);
}

export interface Evaluation {
  id: number;
  status: "new" | "filtered";
  score: number;
  reasons: string[];
  matchedSkills: string[];
  flags: string[];
  filterReason?: string;
}

export function saveEvaluations(evals: Evaluation[]) {
  const d = getDb();
  const stmt = d.prepare(`UPDATE jobs SET status = @status, score = @score, score_reasons = @reasons,
      matched_skills = @matchedSkills, flags = @flags, filter_reason = @filterReason WHERE id = @id`);
  d.transaction(() => {
    for (const e of evals) {
      stmt.run({
        ...e,
        reasons: JSON.stringify(e.reasons),
        matchedSkills: JSON.stringify(e.matchedSkills),
        flags: JSON.stringify(e.flags),
        filterReason: e.filterReason ?? null,
      });
    }
  })();
}

/** All jobs as one user sees them: the shared filter verdict plus that user's applied / skipped marks. */
export function listJobsFor(userId: number): JobRow[] {
  const rows = getDb()
    .prepare(
      `SELECT jobs.*, uj.status AS user_status, uj.changed_at AS user_changed_at
       FROM jobs LEFT JOIN user_jobs uj ON uj.job_id = jobs.id AND uj.user_id = ?
       ORDER BY jobs.score DESC, jobs.posted_at DESC`,
    )
    .all(userId) as Raw[];
  return rows.map((r) => {
    const row = toRow(r);
    if (row.status !== "filtered") row.status = (r.user_status as JobStatus | null) ?? "new";
    row.statusChangedAt = opt(r.user_changed_at);
    return row;
  });
}

export function setUserJobStatus(userId: number, jobId: number, status: "new" | "applied" | "skipped"): boolean {
  const d = getDb();
  if (!d.prepare("SELECT 1 FROM jobs WHERE id = ?").get(jobId)) return false;
  if (status === "new") d.prepare("DELETE FROM user_jobs WHERE user_id = ? AND job_id = ?").run(userId, jobId);
  else
    d.prepare(
      `INSERT INTO user_jobs (user_id, job_id, status, changed_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, job_id) DO UPDATE SET status = excluded.status, changed_at = excluded.changed_at`,
    ).run(userId, jobId, status, new Date().toISOString());
  return true;
}

export function topNewJobs(limit: number, minScore: number): JobRow[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM jobs WHERE status = 'new' AND score >= ? AND (flags IS NULL OR flags NOT LIKE '%possible-scam%')
       ORDER BY score DESC, posted_at DESC LIMIT ?`,
    )
    .all(minScore, limit) as Raw[];
  return rows.map(toRow);
}

// ---- runs ----

function toRun(r: Raw): RunRow {
  return {
    id: r.id as number,
    startedAt: r.started_at as string,
    finishedAt: opt(r.finished_at),
    status: r.status as RunRow["status"],
    fetched: (r.fetched as number) ?? 0,
    inserted: (r.inserted as number) ?? 0,
    message: opt(r.message),
  };
}

export function startRun(): number {
  const d = getDb();
  // A run that never finished (killed process) should not block the next one forever.
  d.prepare(
    "UPDATE runs SET status = 'error', message = 'interrupted' WHERE status = 'running' AND started_at < ?",
  ).run(new Date(Date.now() - 15 * 60_000).toISOString());
  return Number(d.prepare("INSERT INTO runs (started_at, status) VALUES (?, 'running')").run(new Date().toISOString()).lastInsertRowid);
}

export function finishRun(id: number, patch: { status: "ok" | "error"; fetched: number; inserted: number; message?: string }) {
  getDb()
    .prepare("UPDATE runs SET finished_at = ?, status = ?, fetched = ?, inserted = ?, message = ? WHERE id = ?")
    .run(new Date().toISOString(), patch.status, patch.fetched, patch.inserted, patch.message ?? null, id);
}

export function recentRuns(limit = 10): RunRow[] {
  return (getDb().prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?").all(limit) as Raw[]).map(toRun);
}
