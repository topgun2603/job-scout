import { NextResponse } from "next/server";
import { applicantFrom, type IdCtx } from "@/lib/admin-guard";
import { loadConfig } from "@/lib/config";
import { detectSkills, inspectPdf } from "@/lib/resume";
import { addResume, getUser, ResumeLimitError } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a resume version (multipart: "resume" = PDF, optional "label"). Returns the skills found in it. */
export async function POST(req: Request, ctx: IdCtx) {
  const r = await applicantFrom(ctx);
  if (r.error) return r.error;
  const form = await req.formData().catch(() => undefined);
  const file = form?.get("resume");
  const label = form?.get("label");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a PDF in the 'resume' field." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const info = inspectPdf(bytes);
    const resume = await addResume(r.user.id, bytes, file.name || "resume.pdf", info.pages, typeof label === "string" ? label : undefined);
    return NextResponse.json({ resume, user: await getUser(r.user.id), detected: detectSkills(info.text, loadConfig().profile) }, { status: 201 });
  } catch (e) {
    const status = e instanceof ResumeLimitError ? 409 : 400;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
