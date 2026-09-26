import { NextResponse } from "next/server";
import { applicantFrom, type IdCtx } from "@/lib/admin-guard";
import { firstIssue, updateUserBody } from "@/lib/user-input";
import { accessLog, deleteUser, updateUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: IdCtx) {
  const r = await applicantFrom(ctx);
  if (r.error) return r.error;
  return NextResponse.json({ user: r.user, log: accessLog(r.user.id) });
}

export async function PATCH(req: Request, ctx: IdCtx) {
  const r = await applicantFrom(ctx);
  if (r.error) return r.error;
  const parsed = updateUserBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  return NextResponse.json(updateUser(r.user.id, parsed.data));
}

export async function DELETE(_req: Request, ctx: IdCtx) {
  const r = await applicantFrom(ctx);
  if (r.error) return r.error;
  deleteUser(r.user.id);
  return NextResponse.json({ ok: true });
}
