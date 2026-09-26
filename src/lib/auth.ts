import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { col } from "./firebase";
import { getUser, type PublicUser } from "./users";

export const SESSION_COOKIE = "jsf_session";
const SESSION_DAYS = 7;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Creates a session and returns the raw token for the cookie; only its hash is stored (as the doc id). */
export async function createSession(userId: number): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await col("sessions").doc(sha(token)).set({ userId, expiresAt: expires.toISOString() });
  // Sweep this user's expired sessions (a per-user query needs no composite index).
  const old = await col("sessions").where("userId", "==", userId).get();
  const now = new Date().toISOString();
  await Promise.all(old.docs.filter((d) => (d.get("expiresAt") as string) < now).map((d) => d.ref.delete()));
  return { token, expires };
}

export async function destroySession(token: string | undefined) {
  if (token) await col("sessions").doc(sha(token)).delete();
}

async function userForToken(token: string | undefined): Promise<PublicUser | undefined> {
  if (!token) return;
  const s = await col("sessions").doc(sha(token)).get();
  if (!s.exists || (s.get("expiresAt") as string) <= new Date().toISOString()) return;
  const user = await getUser(s.get("userId") as number);
  return user && !user.disabled ? user : undefined;
}

/** The signed-in user for a server component or route handler. */
export async function currentUser(): Promise<PublicUser | undefined> {
  return userForToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(res: NextResponse, req: Request, token: string, expires: Date) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    expires,
  });
}

type Guard = { user: PublicUser; error?: never } | { user?: never; error: NextResponse };

const deny = (status: number, error: string): Guard => ({ error: NextResponse.json({ error }, { status }) });

/** For route handlers: any signed-in user. */
export async function requireUser(): Promise<Guard> {
  const user = await currentUser();
  return user ? { user } : deny(401, "Please sign in.");
}

/** Signed in and (for applicants) inside an active access window. */
export async function requireAccess(): Promise<Guard> {
  const g = await requireUser();
  if (g.user && !g.user.access.active) return deny(403, "Your access has expired. Contact the admin to renew it.");
  return g;
}

/** A full pass (1 day or longer): needed to apply, mark Applied / Skipped. Admins always pass. */
export async function requireFullAccess(): Promise<Guard> {
  const g = await requireAccess();
  if (g.user && !g.user.access.full) return deny(403, "Applying and tracking jobs need a 1-day pass or longer.");
  return g;
}

export async function requireAdmin(): Promise<Guard> {
  const g = await requireUser();
  if (g.user && g.user.role !== "admin") return deny(403, "Admins only.");
  return g;
}

// Naive in-memory login throttle: 5 failures per username locks it for a minute.
const failures = new Map<string, { count: number; until: number }>();

export function loginLocked(username: string): number {
  const f = failures.get(username.toLowerCase());
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}

export function recordLogin(username: string, ok: boolean) {
  const key = username.toLowerCase();
  if (ok) return void failures.delete(key);
  const f = failures.get(key) ?? { count: 0, until: 0 };
  f.count++;
  if (f.count >= 5) {
    f.until = Date.now() + 60_000;
    f.count = 0;
  }
  failures.set(key, f);
}
