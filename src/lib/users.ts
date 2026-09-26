import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { accessState, grant, MAX_RESUMES, type AccessState, type PlanId } from "./access";
import { bucket, col, firestore, inBatches, nextId } from "./firebase";

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

type Doc = Record<string, unknown>;
const opt = <T>(v: unknown) => (v === null || v === undefined || v === "" ? undefined : (v as T));

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

// ---------- documents ----------
// users/{id}: the profile, passwordHash, accessPlan, accessExpiresAt.
// usernames/{lowercase name}: { userId }, which keeps usernames unique inside a transaction.

const userRef = (id: number) => col("users").doc(String(id));

function toUser(d: Doc, resumes: ResumeInfo[]): PublicUser {
  return {
    id: d.id as number,
    username: d.username as string,
    role: d.role as Role,
    fullName: (d.fullName as string) ?? "",
    email: opt(d.email),
    phone: opt(d.phone),
    graduationYear: opt(d.graduationYear),
    locations: (d.locations as string[]) ?? [],
    coreSkills: (d.coreSkills as string[]) ?? [],
    bonusSkills: (d.bonusSkills as string[]) ?? [],
    notes: opt(d.notes),
    disabled: Boolean(d.disabled),
    createdAt: d.createdAt as string,
    resumes,
    access:
      d.role === "admin"
        ? { active: true, msLeft: Number.POSITIVE_INFINITY, full: true, resumeUnlocked: true, resumeLimit: MAX_RESUMES }
        : accessState({ plan: opt<PlanId>(d.accessPlan), expiresAt: opt(d.accessExpiresAt) }),
  };
}

export async function getUser(id: number): Promise<PublicUser | undefined> {
  if (!Number.isInteger(id)) return;
  const [snap, resumes] = await Promise.all([userRef(id).get(), listResumes(id)]);
  return snap.exists ? toUser(snap.data()!, resumes) : undefined;
}

export async function listApplicants(): Promise<PublicUser[]> {
  const [users, resumes] = await Promise.all([col("users").where("role", "==", "applicant").get(), col("resumes").get()]);
  const byUser = new Map<number, ResumeDoc[]>();
  for (const r of resumes.docs) {
    const d = r.data() as ResumeDoc;
    byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);
  }
  return users.docs
    .map((u) => toUser(u.data(), sortResumes(byUser.get(u.get("id")) ?? []).map(toResume)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function userDocByName(username: string): Promise<Doc | undefined> {
  const link = await col("usernames").doc(username.trim().toLowerCase()).get();
  if (!link.exists) return;
  const snap = await userRef(link.get("userId")).get();
  return snap.exists ? snap.data() : undefined;
}

/** Returns the user only when the password matches and the account is enabled. */
export async function checkCredentials(username: string, password: string): Promise<PublicUser | undefined> {
  const d = await userDocByName(username);
  if (!d || d.disabled) {
    hashPassword(password); // same work either way, so timing does not reveal which usernames exist
    return;
  }
  return verifyPassword(password, d.passwordHash as string) ? getUser(d.id as number) : undefined;
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

export class UsernameTakenError extends Error {}

export async function createUser(username: string, password: string, role: Role, fields: UserFields = {}): Promise<PublicUser> {
  const name = username.trim().toLowerCase();
  const id = await nextId("users");
  const nameRef = col("usernames").doc(name);
  await firestore().runTransaction(async (tx) => {
    if ((await tx.get(nameRef)).exists) throw new UsernameTakenError(`Username "${name}" is taken.`);
    tx.set(nameRef, { userId: id });
    tx.set(userRef(id), {
      id,
      username: name,
      passwordHash: hashPassword(password),
      role,
      fullName: fields.fullName ?? "",
      email: fields.email ?? null,
      phone: fields.phone ?? null,
      graduationYear: fields.graduationYear ?? null,
      locations: fields.locations ?? [],
      coreSkills: fields.coreSkills ?? [],
      bonusSkills: fields.bonusSkills ?? [],
      notes: fields.notes ?? null,
      disabled: false,
      accessPlan: null,
      accessExpiresAt: null,
      createdAt: new Date().toISOString(),
    });
  });
  return (await getUser(id))!;
}

export async function usernameTaken(username: string): Promise<boolean> {
  return (await col("usernames").doc(username.trim().toLowerCase()).get()).exists;
}

/** Admin CLI: set a password (and the admin role) on an existing account. Returns false if none. */
export async function resetAdmin(username: string, password: string): Promise<boolean> {
  const d = await userDocByName(username);
  if (!d) return false;
  await userRef(d.id as number).update({ passwordHash: hashPassword(password), role: "admin", disabled: false });
  await endSessions(d.id as number);
  return true;
}

async function endSessions(userId: number) {
  const s = await col("sessions").where("userId", "==", userId).get();
  await inBatches(s.docs, (b, d) => b.delete(d.ref));
}

export async function updateUser(id: number, f: UserFields): Promise<PublicUser | undefined> {
  const patch: Doc = {};
  if (f.fullName !== undefined) patch.fullName = f.fullName;
  if (f.email !== undefined) patch.email = f.email;
  if (f.phone !== undefined) patch.phone = f.phone;
  if (f.graduationYear !== undefined) patch.graduationYear = f.graduationYear;
  if (f.locations) patch.locations = f.locations;
  if (f.coreSkills) patch.coreSkills = f.coreSkills;
  if (f.bonusSkills) patch.bonusSkills = f.bonusSkills;
  if (f.notes !== undefined) patch.notes = f.notes;
  if (f.disabled !== undefined) patch.disabled = f.disabled;
  if (f.password) patch.passwordHash = hashPassword(f.password);
  if (Object.keys(patch).length) await userRef(id).update(patch);
  // A new password or a disabled account logs the user out everywhere.
  if (f.password || f.disabled) await endSessions(id);
  return getUser(id);
}

export async function deleteUser(id: number) {
  const snap = await userRef(id).get();
  if (!snap.exists) return;
  const [resumes, marks, log] = await Promise.all([
    col("resumes").where("userId", "==", id).get(),
    col("user_jobs").where("userId", "==", id).get(),
    col("access_log").where("userId", "==", id).get(),
  ]);
  await Promise.all(resumes.docs.map((r) => bucket().file(r.get("path")).delete({ ignoreNotFound: true })));
  await endSessions(id);
  await inBatches([...resumes.docs, ...marks.docs, ...log.docs], (b, d) => b.delete(d.ref));
  await col("usernames").doc(snap.get("username")).delete();
  await userRef(id).delete();
}

// ---------- access ----------

async function logAccess(userId: number, action: AccessLogEntry["action"], plan?: PlanId, expiresAt?: string) {
  const id = await nextId("access_log");
  await col("access_log")
    .doc(String(id))
    .set({ id, userId, action, plan: plan ?? null, expiresAt: expiresAt ?? null, at: new Date().toISOString() });
}

export async function grantAccess(id: number, plan: PlanId): Promise<PublicUser | undefined> {
  const snap = await userRef(id).get();
  if (!snap.exists) return;
  const next = grant({ plan: opt<PlanId>(snap.get("accessPlan")), expiresAt: opt(snap.get("accessExpiresAt")) }, plan);
  await userRef(id).update({ accessPlan: next.plan, accessExpiresAt: next.expiresAt });
  await logAccess(id, "grant", plan, next.expiresAt);
  return getUser(id);
}

/** Ends the pass now (kept as an expired pass, so the applicant sees "ended" rather than "not started"). */
export async function revokeAccess(id: number): Promise<PublicUser | undefined> {
  const snap = await userRef(id).get();
  if (!snap.exists) return;
  const now = new Date().toISOString();
  const exp = opt<string>(snap.get("accessExpiresAt"));
  if (exp && exp > now) await userRef(id).update({ accessExpiresAt: now });
  await logAccess(id, "revoke");
  return getUser(id);
}

export async function accessLog(id: number, limit = 20): Promise<AccessLogEntry[]> {
  return (await col("access_log").where("userId", "==", id).get()).docs
    .map((d) => d.data())
    .sort((a, b) => (b.id as number) - (a.id as number))
    .slice(0, limit)
    .map((d) => ({
      id: d.id as number,
      action: d.action as AccessLogEntry["action"],
      plan: opt(d.plan),
      expiresAt: opt(d.expiresAt),
      at: d.at as string,
    }));
}

// ---------- resumes ----------
// resumes/{id}: metadata; the PDF itself lives in Storage at `path`.

interface ResumeDoc {
  id: number;
  userId: number;
  label?: string | null;
  path: string;
  name: string;
  pages: number;
  size: number;
  uploadedAt: string;
}

const toResume = (d: ResumeDoc): ResumeInfo => ({
  id: d.id,
  label: opt(d.label),
  name: d.name,
  pages: d.pages,
  size: d.size,
  uploadedAt: d.uploadedAt,
});

const sortResumes = (rs: ResumeDoc[]) => rs.sort((a, b) => a.id - b.id);

async function resumeDocs(userId: number): Promise<ResumeDoc[]> {
  return sortResumes((await col("resumes").where("userId", "==", userId).get()).docs.map((d) => d.data() as ResumeDoc));
}

export async function listResumes(userId: number): Promise<ResumeInfo[]> {
  return (await resumeDocs(userId)).map(toResume);
}

/** One resume with its storage path, only if it belongs to that user. */
export async function getResume(
  userId: number,
  resumeId: number,
): Promise<(ResumeInfo & { path: string; position: number }) | undefined> {
  const all = await resumeDocs(userId);
  const i = all.findIndex((r) => r.id === resumeId);
  return i < 0 ? undefined : { ...toResume(all[i]!), path: all[i]!.path, position: i };
}

export async function readResume(path: string): Promise<Buffer> {
  const [bytes] = await bucket().file(path).download();
  return bytes;
}

export class ResumeLimitError extends Error {}

/** Stores the PDF under a server-chosen name; `id` is only passed by the SQLite migration. */
export async function addResume(
  userId: number,
  bytes: Buffer,
  originalName: string,
  pages: number,
  label?: string,
  keep?: { id: number; uploadedAt: string },
): Promise<ResumeInfo> {
  if ((await resumeDocs(userId)).length >= MAX_RESUMES) {
    throw new ResumeLimitError(`An applicant can have at most ${MAX_RESUMES} resumes. Remove one first.`);
  }
  const path = `jobscout/resumes/u${userId}-${randomBytes(8).toString("hex")}.pdf`;
  await bucket().file(path).save(bytes, { contentType: "application/pdf", resumable: false });
  const id = keep?.id ?? (await nextId("resumes"));
  const doc: ResumeDoc = {
    id,
    userId,
    label: label?.trim().slice(0, 40) || null,
    path,
    name: originalName.slice(0, 120),
    pages,
    size: bytes.length,
    uploadedAt: keep?.uploadedAt ?? new Date().toISOString(),
  };
  await col("resumes").doc(String(id)).set(doc);
  return toResume(doc);
}

export async function relabelResume(userId: number, resumeId: number, label: string | null) {
  if (!(await getResume(userId, resumeId))) return;
  await col("resumes").doc(String(resumeId)).update({ label: label?.trim().slice(0, 40) || null });
}

/** Deletes the record and the file; returns the removed path (for render-cache cleanup). */
export async function deleteResume(userId: number, resumeId: number): Promise<string | undefined> {
  const r = await getResume(userId, resumeId);
  if (!r) return;
  await col("resumes").doc(String(resumeId)).delete();
  await bucket().file(r.path).delete({ ignoreNotFound: true });
  return r.path;
}
