import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { accessState, grant, MAX_RESUMES, type AccessState, type PlanId } from "./access";
import { getDb } from "./db";

export type Role = "admin" | "applicant";

/** A user as the app and the admin UI see it: never includes the password hash or resume path. */
export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  fullName: string;
  email?: string;
  phone?: string;
  graduationYear?: number;
  locations: string[];
  coreSkills: string[];
  bonusSkills: string[];
  notes?: string;
  disabled: boolean;
  createdAt: string;
  /** Resume versions in upload order; the pass decides how many the applicant sees. */
  resumes: ResumeInfo[];
  access: AccessState;
}

export interface ResumeInfo {
  id: number;
  label?: string;
  name: string;
  pages: number;
  size: number;
  uploadedAt: string;
}

export interface AccessLogEntry {
  id: number;
  action: "grant" | "revoke";
  plan?: PlanId;
  expiresAt?: string;
  at: string;
}

type Raw = Record<string, unknown>;
const arr = (v: unknown): string[] => {
  try {
    return v ? (JSON.parse(String(v)) as string[]) : [];
  } catch {
    return [];
  }
};
const opt = <T>(v: unknown) => (v === null || v === undefined || v === "" ? undefined : (v as T));

export const RESUME_DIR = path.resolve(process.cwd(), "data/resumes");

// ---------- passwords ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD = 8;

// ---------- rows ----------

function toUser(r: Raw): PublicUser {
  return {
    id: r.id as number,
    username: r.username as string,
    role: r.role as Role,
    fullName: (r.full_name as string) ?? "",
    email: opt(r.email),
    phone: opt(r.phone),
    graduationYear: opt(r.graduation_year),
    locations: arr(r.locations),
    coreSkills: arr(r.core_skills),
    bonusSkills: arr(r.bonus_skills),
    notes: opt(r.notes),
    disabled: Boolean(r.disabled),
    createdAt: r.created_at as string,
    resumes: listResumes(r.id as number),
    access:
      r.role === "admin"
        ? { active: true, msLeft: Number.POSITIVE_INFINITY, full: true, resumeUnlocked: true, resumeLimit: MAX_RESUMES }
        : accessState({ plan: opt<PlanId>(r.access_plan), expiresAt: opt(r.access_expires_at) }),
  };
}

export function getUser(id: number): PublicUser | undefined {
  const r = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as Raw | undefined;
  return r ? toUser(r) : undefined;
}

export function listApplicants(): PublicUser[] {
  return (getDb().prepare("SELECT * FROM users WHERE role = 'applicant' ORDER BY created_at DESC").all() as Raw[]).map(toUser);
}

/** Returns the user only when the password matches and the account is enabled. */
export function checkCredentials(username: string, password: string): PublicUser | undefined {
  const r = getDb().prepare("SELECT * FROM users WHERE username = ?").get(username.trim()) as Raw | undefined;
  if (!r || r.disabled) {
    hashPassword(password); // same work either way, so timing does not reveal which usernames exist
    return;
  }
  return verifyPassword(password, r.password_hash as string) ? toUser(r) : undefined;
}

export interface UserFields {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  graduationYear?: number | null;
  locations?: string[];
  coreSkills?: string[];
  bonusSkills?: string[];
  notes?: string | null;
  disabled?: boolean;
  password?: string;
}

export function createUser(username: string, password: string, role: Role, fields: UserFields = {}): PublicUser {
  const info = getDb()
    .prepare(
      `INSERT INTO users (username, password_hash, role, full_name, email, phone, graduation_year, locations, core_skills, bonus_skills, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      username.trim().toLowerCase(),
      hashPassword(password),
      role,
      fields.fullName ?? "",
      fields.email ?? null,
      fields.phone ?? null,
      fields.graduationYear ?? null,
      JSON.stringify(fields.locations ?? []),
      JSON.stringify(fields.coreSkills ?? []),
      JSON.stringify(fields.bonusSkills ?? []),
      fields.notes ?? null,
      new Date().toISOString(),
    );
  return getUser(Number(info.lastInsertRowid))!;
}

export function usernameTaken(username: string): boolean {
  return !!getDb().prepare("SELECT 1 FROM users WHERE username = ?").get(username.trim());
}

export function updateUser(id: number, f: UserFields): PublicUser | undefined {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (f.fullName !== undefined) set("full_name", f.fullName);
  if (f.email !== undefined) set("email", f.email);
  if (f.phone !== undefined) set("phone", f.phone);
  if (f.graduationYear !== undefined) set("graduation_year", f.graduationYear);
  if (f.locations) set("locations", JSON.stringify(f.locations));
  if (f.coreSkills) set("core_skills", JSON.stringify(f.coreSkills));
  if (f.bonusSkills) set("bonus_skills", JSON.stringify(f.bonusSkills));
  if (f.notes !== undefined) set("notes", f.notes);
  if (f.disabled !== undefined) set("disabled", f.disabled ? 1 : 0);
  if (f.password) set("password_hash", hashPassword(f.password));
  const d = getDb();
  if (sets.length) d.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  // A new password or a disabled account logs the user out everywhere.
  if (f.password || f.disabled) d.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  return getUser(id);
}

export function deleteUser(id: number) {
  const d = getDb();
  const files = d.prepare("SELECT path FROM resumes WHERE user_id = ?").all(id) as { path: string }[];
  d.prepare("DELETE FROM users WHERE id = ?").run(id); // resumes rows cascade
  for (const f of files) fs.rmSync(f.path, { force: true });
}

// ---------- access ----------

export function grantAccess(id: number, plan: PlanId): PublicUser | undefined {
  const d = getDb();
  const r = d.prepare("SELECT access_plan, access_expires_at FROM users WHERE id = ?").get(id) as Raw | undefined;
  if (!r) return;
  const next = grant({ plan: opt<PlanId>(r.access_plan), expiresAt: opt(r.access_expires_at) }, plan);
  d.transaction(() => {
    d.prepare("UPDATE users SET access_plan = ?, access_expires_at = ? WHERE id = ?").run(next.plan, next.expiresAt, id);
    d.prepare("INSERT INTO access_log (user_id, action, plan, expires_at, at) VALUES (?, 'grant', ?, ?, ?)").run(
      id,
      plan,
      next.expiresAt,
      new Date().toISOString(),
    );
  })();
  return getUser(id);
}

/** Ends the pass now (kept as an expired pass, so the applicant sees "ended" rather than "not started"). */
export function revokeAccess(id: number): PublicUser | undefined {
  const d = getDb();
  const now = new Date().toISOString();
  d.transaction(() => {
    d.prepare("UPDATE users SET access_expires_at = ? WHERE id = ? AND access_expires_at > ?").run(now, id, now);
    d.prepare("INSERT INTO access_log (user_id, action, at) VALUES (?, 'revoke', ?)").run(id, now);
  })();
  return getUser(id);
}

export function accessLog(id: number, limit = 20): AccessLogEntry[] {
  return (
    getDb().prepare("SELECT * FROM access_log WHERE user_id = ? ORDER BY id DESC LIMIT ?").all(id, limit) as Raw[]
  ).map((r) => ({
    id: r.id as number,
    action: r.action as AccessLogEntry["action"],
    plan: opt(r.plan),
    expiresAt: opt(r.expires_at),
    at: r.at as string,
  }));
}

// ---------- resumes ----------

const toResume = (r: Raw): ResumeInfo => ({
  id: r.id as number,
  label: opt(r.label),
  name: r.name as string,
  pages: r.pages as number,
  size: r.size as number,
  uploadedAt: r.uploaded_at as string,
});

export function listResumes(userId: number): ResumeInfo[] {
  return (getDb().prepare("SELECT * FROM resumes WHERE user_id = ? ORDER BY id").all(userId) as Raw[]).map(toResume);
}

/** One resume with its file path, only if it belongs to that user. */
export function getResume(userId: number, resumeId: number): (ResumeInfo & { path: string; position: number }) | undefined {
  const all = getDb().prepare("SELECT * FROM resumes WHERE user_id = ? ORDER BY id").all(userId) as Raw[];
  const i = all.findIndex((r) => r.id === resumeId);
  return i < 0 ? undefined : { ...toResume(all[i]!), path: all[i]!.path as string, position: i };
}

export class ResumeLimitError extends Error {}

export function addResume(userId: number, bytes: Buffer, originalName: string, pages: number, label?: string): ResumeInfo {
  const d = getDb();
  const count = (d.prepare("SELECT COUNT(*) AS n FROM resumes WHERE user_id = ?").get(userId) as { n: number }).n;
  if (count >= MAX_RESUMES) throw new ResumeLimitError(`An applicant can have at most ${MAX_RESUMES} resumes. Remove one first.`);
  fs.mkdirSync(RESUME_DIR, { recursive: true });
  // Server-chosen file name: nothing from the upload ends up in a path.
  const file = path.join(RESUME_DIR, `u${userId}-${randomBytes(8).toString("hex")}.pdf`);
  fs.writeFileSync(file, bytes);
  const info = d
    .prepare("INSERT INTO resumes (user_id, label, path, name, pages, size, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(userId, label?.trim().slice(0, 40) || null, file, originalName.slice(0, 120), pages, bytes.length, new Date().toISOString());
  return toResume(d.prepare("SELECT * FROM resumes WHERE id = ?").get(info.lastInsertRowid) as Raw);
}

export function relabelResume(userId: number, resumeId: number, label: string | null) {
  getDb().prepare("UPDATE resumes SET label = ? WHERE id = ? AND user_id = ?").run(label?.trim().slice(0, 40) || null, resumeId, userId);
}

/** Deletes the row and the file; returns the removed path (for render-cache cleanup). */
export function deleteResume(userId: number, resumeId: number): string | undefined {
  const r = getResume(userId, resumeId);
  if (!r) return;
  getDb().prepare("DELETE FROM resumes WHERE id = ?").run(resumeId);
  fs.rmSync(r.path, { force: true });
  return r.path;
}
