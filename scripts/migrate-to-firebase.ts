/**
 *   npm run migrate-to-firebase
 * One-time copy of the local SQLite database (data/jobs.db) and its resume PDFs into Firebase.
 * Keeps every id, password hash, pass and applied/skipped mark. Safe to re-run: documents are
 * overwritten by id, and a resume already copied is skipped.
 */
import "dotenv/config";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { col, inBatches } from "@/lib/firebase";
import { addResume, listResumes } from "@/lib/users";

const file = path.resolve(process.cwd(), "data/jobs.db");
if (!fs.existsSync(file)) {
  console.error("No data/jobs.db to migrate.");
  process.exit(1);
}
const db = new Database(file, { readonly: true });
type Row = Record<string, unknown>;
const all = (sql: string) => db.prepare(sql).all() as Row[];
const arr = (v: unknown) => (v ? (JSON.parse(String(v)) as unknown[]) : []);
const has = (table: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
const maxId = (rows: Row[]) => rows.reduce((m, r) => Math.max(m, r.id as number), 0);

// ---- users ----
const users = all("SELECT * FROM users");
await inBatches(users, (b, u) => {
  b.set(col("users").doc(String(u.id)), {
    id: u.id,
    username: u.username,
    passwordHash: u.password_hash,
    role: u.role,
    fullName: u.full_name ?? "",
    email: u.email ?? null,
    phone: u.phone ?? null,
    graduationYear: u.graduation_year ?? null,
    locations: arr(u.locations),
    coreSkills: arr(u.core_skills),
    bonusSkills: arr(u.bonus_skills),
    notes: u.notes ?? null,
    disabled: Boolean(u.disabled),
    accessPlan: u.access_plan ?? null,
    accessExpiresAt: u.access_expires_at ?? null,
    createdAt: u.created_at,
  });
  b.set(col("usernames").doc(String(u.username).toLowerCase()), { userId: u.id });
});
console.log(`users: ${users.length}`);

const log = all("SELECT * FROM access_log");
await inBatches(log, (b, l) =>
  b.set(col("access_log").doc(String(l.id)), {
    id: l.id,
    userId: l.user_id,
    action: l.action,
    plan: l.plan ?? null,
    expiresAt: l.expires_at ?? null,
    at: l.at,
  }),
);
console.log(`access log: ${log.length}`);

// ---- resumes (PDFs go to Storage) ----
const resumes = all("SELECT * FROM resumes ORDER BY id");
let copied = 0;
for (const r of resumes) {
  const userId = r.user_id as number;
  if ((await listResumes(userId)).some((x) => x.id === r.id)) continue;
  if (!fs.existsSync(String(r.path))) {
    console.warn(`  resume ${r.id}: file missing, skipped`);
    continue;
  }
  await addResume(userId, fs.readFileSync(String(r.path)), String(r.name), r.pages as number, (r.label as string) ?? undefined, {
    id: r.id as number,
    uploadedAt: String(r.uploaded_at),
  });
  copied++;
}
console.log(`resumes: ${copied} copied (${resumes.length} on file)`);

// ---- jobs, marks, runs ----
const jobs = all("SELECT * FROM jobs");
await inBatches(jobs, (b, j) =>
  b.set(col("jobs").doc(String(j.id)), {
    id: j.id,
    source: j.source,
    sourceId: j.source_id,
    fingerprint: j.fingerprint,
    title: j.title,
    company: j.company,
    location: arr(j.location),
    remote: Boolean(j.remote),
    country: j.country ?? null,
    expMin: j.exp_min ?? null,
    expMax: j.exp_max ?? null,
    salary: j.salary ?? null,
    skills: arr(j.skills),
    batch: j.batch ?? null,
    description: j.description ?? null,
    postedAt: j.posted_at ?? null,
    url: j.url,
    flags: arr(j.flags),
    score: j.score ?? 0,
    scoreReasons: arr(j.score_reasons),
    matchedSkills: arr(j.matched_skills),
    filterReason: j.filter_reason ?? null,
    firstSeen: j.first_seen,
    lastSeen: j.last_seen,
    status: j.status,
    statusChangedAt: j.status_changed_at ?? null,
  }),
);
console.log(`jobs: ${jobs.length}`);

const marks = all("SELECT * FROM user_jobs");
await inBatches(marks, (b, m) =>
  b.set(col("user_jobs").doc(`${m.user_id}_${m.job_id}`), { userId: m.user_id, jobId: m.job_id, status: m.status, changedAt: m.changed_at }),
);
console.log(`applied/skipped marks: ${marks.length}`);

const runs = all("SELECT * FROM runs");
await inBatches(runs, (b, r) =>
  b.set(col("runs").doc(String(r.id)), {
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at ?? null,
    status: r.status,
    fetched: r.fetched ?? 0,
    inserted: r.inserted ?? 0,
    message: r.message ?? null,
  }),
);
console.log(`runs: ${runs.length}`);

// ---- MNC probe ----
if (has("mnc_companies")) {
  const companies = all(
    "SELECT c.*, (SELECT COUNT(*) FROM mnc_roles r WHERE r.company_id = c.id) AS roles FROM mnc_companies c",
  );
  const names = new Map(companies.map((c) => [c.id, c.name]));
  await inBatches(companies, (b, c) =>
    b.set(col("mnc_companies").doc(String(c.id)), {
      id: c.id,
      name: c.name,
      careersUrl: c.careers_url ?? null,
      status: c.status,
      note: c.note ?? null,
      checkedAt: c.checked_at,
      roles: c.roles,
    }),
  );
  const roles = all("SELECT * FROM mnc_roles");
  await inBatches(roles, (b, r) =>
    b.set(col("mnc_roles").doc(String(r.id)), {
      id: r.id,
      company: names.get(r.company_id) ?? "",
      title: r.title,
      location: r.location ?? null,
      experience: r.experience ?? null,
      posted: r.posted ?? null,
      url: r.url ?? null,
      fit: r.fit,
      why: r.why ?? null,
    }),
  );
  console.log(`MNC: ${companies.length} companies, ${roles.length} roles`);
}

// Counters continue after the copied ids, so new records never collide with them.
const counters: Record<string, number> = {
  users: maxId(users),
  access_log: maxId(log),
  resumes: maxId(resumes),
  jobs: maxId(jobs),
  runs: maxId(runs),
};
for (const [name, value] of Object.entries(counters)) {
  const ref = col("counters").doc(name);
  const current = ((await ref.get()).get("value") as number | undefined) ?? 0;
  await ref.set({ value: Math.max(current, value) });
}
console.log("counters:", counters);
console.log("Done.");
process.exit(0);
