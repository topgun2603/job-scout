import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFullAccess } from "@/lib/auth";
import { setUserJobStatus } from "@/lib/db";

export const runtime = "nodejs";

const body = z.object({ status: z.enum(["new", "applied", "skipped"]) });

/** Applied / skipped marks are per user, and need a full pass (not the 1-hour preview). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireFullAccess();
  if (g.error) return g.error;
  const id = Number((await params).id);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!Number.isInteger(id) || !parsed.success) {
    return NextResponse.json({ error: "expected { status: new | applied | skipped }" }, { status: 400 });
  }
  return await setUserJobStatus(g.user.id, id, parsed.data.status)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
