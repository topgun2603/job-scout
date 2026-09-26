import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "./db";
import { getUser, type PublicUser } from "./users";

export const SESSION_COOKIE = "jsf_session";
const SESSION_DAYS = 7;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Creates a session and returns the raw token for the cookie; only its hash is stored. */
export function createSession(userId: number): { token: string; expires: Date } {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const d = getDb();
  d.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
  d.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha(token), userId, expires.toISOString());
  return { token, expires };
}

export function destroySession(token: string | undefined) {
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
}

function userForToken(token: string | undefined): PublicUser | undefined {
  if (!token) return;
  const row = getDb()
    .prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .get(sha(token), new Date().toISOString()) as { user_id: number } | undefined;
  const user = row && getUser(row.user_id);
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
