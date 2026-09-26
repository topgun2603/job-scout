import { NextResponse } from "next/server";
import { z } from "zod";
import { applicantFrom } from "@/lib/admin-guard";
import { loadConfig } from "@/lib/config";
import { detectSkills, forgetRenders, resumeText } from "@/lib/resume";
import { deleteResume, getResume, getUser, readResume, relabelResume } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; rid: string }> };

async function target(ctx: Ctx) {
  const r = await applicantFrom(ctx);
  if (r.error) return { error: r.error };
  const resume = await getResume(r.user.id, Number((await ctx.params).rid));
  if (!resume) return { error: NextResponse.json({ error: "Resume not found." }, { status: 404 }) };
  return { user: r.user, resume };
}

/** Skills detected in this resume. */
export async function GET(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t.error) return t.error;
  return NextResponse.json({ detected: detectSkills(resumeText(await readResume(t.resume.path)), loadConfig().profile) });
}

const labelBody = z.object({ label: z.string().trim().max(40).nullable() });

export async function PATCH(req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t.error) return t.error;
  const parsed = labelBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Label: up to 40 characters." }, { status: 400 });
  await relabelResume(t.user.id, t.resume.id, parsed.data.label);
  return NextResponse.json({ user: await getUser(t.user.id) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t.error) return t.error;
  const path = await deleteResume(t.user.id, t.resume.id);
  if (path) forgetRenders(path);
  return NextResponse.json({ user: await getUser(t.user.id) });
}
