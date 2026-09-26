import { NextResponse } from "next/server";
import { z } from "zod";
import { PLAN_IDS, type PlanId } from "@/lib/access";
import { applicantFrom, type IdCtx } from "@/lib/admin-guard";
import { accessLog, grantAccess, revokeAccess } from "@/lib/users";

export const runtime = "nodejs";

const body = z.object({ plan: z.enum(PLAN_IDS as [PlanId, ...PlanId[]]) });

/** Grant (or extend) access. */
export async function POST(req: Request, ctx: IdCtx) {
  const r = await applicantFrom(ctx);
  if (r.error) return r.error;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: `plan must be one of ${PLAN_IDS.join(", ")}` }, { status: 400 });
  return NextResponse.json({ user: await grantAccess(r.user.id, parsed.data.plan), log: await accessLog(r.user.id) });
}

/** Revoke access immediately. */
export async function DELETE(_req: Request, ctx: IdCtx) {
  const r = await applicantFrom(ctx);
  if (r.error) return r.error;
  return NextResponse.json({ user: await revokeAccess(r.user.id), log: await accessLog(r.user.id) });
}
