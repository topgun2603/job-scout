import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, loginLocked, recordLogin, setSessionCookie } from "@/lib/auth";
import { checkCredentials } from "@/lib/users";

export const runtime = "nodejs";

const body = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  const { username, password } = parsed.data;

  const wait = loginLocked(username);
  if (wait) return NextResponse.json({ error: `Too many attempts. Try again in ${wait}s.` }, { status: 429 });

  const user = checkCredentials(username, password);
  recordLogin(username, !!user);
  if (!user) return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });

  const { token, expires } = createSession(user.id);
  const res = NextResponse.json({ role: user.role });
  setSessionCookie(res, req, token, expires);
  return res;
}
