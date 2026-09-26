import fs from "node:fs";
import { NextResponse } from "next/server";
import { noStore, resumeFor } from "@/lib/resume-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The original PDF. Only for the admin, or an applicant on a 1-day+ pass that includes this resume. */
export async function GET(_req: Request, ctx: { params: Promise<{ userId: string; resumeId: string }> }) {
  const r = await resumeFor(ctx);
  if (r.error) return r.error;
  if (!r.unlocked) {
    return NextResponse.json({ error: "Download unlocks with 1 day of access or more." }, { status: 403 });
  }
  const safeName = r.resume.name.replace(/[^\w.\- ]+/g, "_").replace(/(\.pdf)?$/i, ".pdf");
  return new NextResponse(new Uint8Array(fs.readFileSync(r.resume.path)), {
    headers: {
      ...noStore,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${safeName}"`,
      "x-content-type-options": "nosniff",
    },
  });
}
