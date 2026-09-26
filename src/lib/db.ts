import { col, inBatches, nextId } from "./firebase";
import type { Job, JobRow, JobStatus, RunRow } from "./types";

// Jobs and scout runs in Firestore. Documents are keyed by their numeric id (as a string) and hold
// the JobRow fields as-is. Queries stay on single fields so no composite indexes are needed.

type Doc = Record<string, unknown>;
const opt = <T>(v: unknown) => (v === null || v === undefined ? undefined : (v as T));

function toRow(d: Doc): JobRow {
  return {
    id: d.id as number,
    source: d.source as string,
    sourceId: d.sourceId as string,
    fingerprint: d.fingerprint as string,
    title: d.title as string,
    company: d.company as string,
    location: (d.location as string[]) ?? [],
    remote: Boolean(d.remote),
    country: opt(d.country),
    expMin: opt(d.expMin),
    expMax: opt(d.expMax),
    salary: opt(d.salary),
    skills: (d.skills as string[]) ?? [],
    batch: opt(d.batch),
    description: opt(d.description),
    postedAt: opt(d.postedAt),
    url: d.url as string,
    flags: (d.flags as string[]) ?? [],
    score: (d.score as number) ?? 0,
    scoreReasons: (d.scoreReasons as string[]) ?? [],
    matchedSkills: (d.matchedSkills as string[]) ?? [],
    filterReason: opt(d.filterReason),
    firstSeen: d.firstSeen as string,
    lastSeen: d.lastSeen as string,
    status: d.status as JobStatus,
    statusChangedAt: opt(d.statusChangedAt),
  };
}

const byScore = (a: JobRow, b: JobRow) => b.score - a.score || (b.postedAt ?? "").localeCompare(a.postedAt ?? "");

export interface UpsertResult {
  inserted: number;
  known: number;
  duplicates: number;
}

/**
 * Dedupe against the store: same (source, sourceId) just refreshes lastSeen;
 * a different listing with the same fingerprint (repost, or another source) is skipped.
 */
export async function upsertJobs(jobs: Array<Job & { fingerprint: string }>, now = new Date().toISOString()): Promise<UpsertResult> {
  const known = await col("jobs").select("source", "sourceId", "fingerprint").get();
  const bySourceId = new Map<string, string>();
  const byFingerprint = new Map<string, string>();
  for (const d of known.docs) {
    bySourceId.set(`${d.get("source")}|${d.get("sourceId")}`, d.id);
    if (!byFingerprint.has(d.get("fingerprint"))) byFingerprint.set(d.get("fingerprint"), d.id);
  }

  const result: UpsertResult = { inserted: 0, known: 0, duplicates: 0 };
  const touches: { id: string; postedAt?: string }[] = [];
  const fresh: Array<Job & { fingerprint: string }> = [];
  for (const j of jobs) {
    const same = bySourceId.get(`${j.source}|${j.sourceId}`);
    if (same) {
      touches.push({ id: same, postedAt: j.postedAt });
      result.known++;
      continue;
    }
    const twin = byFingerprint.get(j.fingerprint);
    if (twin) {
      touches.push({ id: twin });
      result.duplicates++;
      continue;
    }
    fresh.push(j);
    byFingerprint.set(j.fingerprint, "pending");
  }

  await inBatches(touches, (b, t) => b.update(col("jobs").doc(t.id), { lastSeen: now, ...(t.postedAt ? { postedAt: t.postedAt } : {}) }));
  if (fresh.length) {
    const first = await nextId("jobs", fresh.length);
    await inBatches(
      fresh.map((j, i) => ({ ...j, id: first + i })),
      (b, j) => b.set(col("jobs").doc(String(j.id)), { ...j, score: 0, firstSeen: now, lastSeen: now, status: "new" }),
    );
  }
  result.inserted = fresh.length;
  return result;
}

async function allJobs(): Promise<JobRow[]> {
  return (await col("jobs").get()).docs.map((d) => toRow(d.data()));
}

/** Rows whose verdict can still change when the config changes. */
export async function jobsToEvaluate(): Promise<JobRow[]> {
  return (await col("jobs").where("status", "in", ["new", "filtered"]).get()).docs.map((d) => toRow(d.data()));
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

export async function saveEvaluations(evals: Evaluation[]) {
  await inBatches(evals, (b, e) =>
    b.update(col("jobs").doc(String(e.id)), {
      status: e.status,
      score: e.score,
      scoreReasons: e.reasons,
      matchedSkills: e.matchedSkills,
      flags: e.flags,
      filterReason: e.filterReason ?? null,
    }),
  );
}

const userJobId = (userId: number, jobId: number) => `${userId}_${jobId}`;

/** All jobs as one user sees them: the shared filter verdict plus that user's applied / skipped marks. */
export async function listJobsFor(userId: number): Promise<JobRow[]> {
  const [jobs, marks] = await Promise.all([allJobs(), col("user_jobs").where("userId", "==", userId).get()]);
  const mine = new Map(marks.docs.map((d) => [d.get("jobId") as number, d.data()]));
  return jobs
    .map((row) => {
      const m = mine.get(row.id);
      if (row.status !== "filtered") row.status = (m?.status as JobStatus | undefined) ?? "new";
      row.statusChangedAt = opt(m?.changedAt);
      return row;
    })
    .sort(byScore);
}

export async function setUserJobStatus(userId: number, jobId: number, status: "new" | "applied" | "skipped"): Promise<boolean> {
  if (!(await col("jobs").doc(String(jobId)).get()).exists) return false;
  const ref = col("user_jobs").doc(userJobId(userId, jobId));
  if (status === "new") await ref.delete();
  else await ref.set({ userId, jobId, status, changedAt: new Date().toISOString() });
  return true;
}

export async function topNewJobs(limit: number, minScore: number): Promise<JobRow[]> {
  return (await col("jobs").where("status", "==", "new").get()).docs
    .map((d) => toRow(d.data()))
    .filter((j) => j.score >= minScore && !j.flags.some((f) => f.includes("possible-scam")))
    .sort(byScore)
    .slice(0, limit);
}

// ---- runs ----

function toRun(d: Doc): RunRow {
  return {
    id: d.id as number,
    startedAt: d.startedAt as string,
    finishedAt: opt(d.finishedAt),
    status: d.status as RunRow["status"],
    fetched: (d.fetched as number) ?? 0,
    inserted: (d.inserted as number) ?? 0,
    message: opt(d.message),
  };
}

export async function startRun(): Promise<number> {
  // A run that never finished (killed process) should not block the next one forever.
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const stuck = await col("runs").where("status", "==", "running").get();
  await inBatches(
    stuck.docs.filter((d) => (d.get("startedAt") as string) < cutoff),
    (b, d) => b.update(d.ref, { status: "error", message: "interrupted" }),
  );
  const id = await nextId("runs");
  await col("runs").doc(String(id)).set({ id, startedAt: new Date().toISOString(), status: "running", fetched: 0, inserted: 0 });
  return id;
}

export async function finishRun(id: number, patch: { status: "ok" | "error"; fetched: number; inserted: number; message?: string }) {
  await col("runs")
    .doc(String(id))
    .update({ finishedAt: new Date().toISOString(), ...patch, message: patch.message ?? null });
}

export async function recentRuns(limit = 10): Promise<RunRow[]> {
  return (await col("runs").orderBy("id", "desc").limit(limit).get()).docs.map((d) => toRun(d.data()));
}
