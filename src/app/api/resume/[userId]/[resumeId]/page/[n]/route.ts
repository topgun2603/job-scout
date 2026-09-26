import { NextResponse } from "next/server";
import { renderPage } from "@/lib/resume";
import { readResume } from "@/lib/users";
import { noStore, resumeFor } from "@/lib/resume-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One resume page as PNG. Without a full pass: page 1 with its lower half blurred and every
 * other page fully blurred; the blur is baked into the image here.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ userId: string; resumeId: string; n: string }> }) {
  const r = await resumeFor(ctx);
  if (r.error) return r.error;
  const index = Number((await ctx.params).n) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= r.resume.pages) {
    return NextResponse.json({ error: "No such page." }, { status: 404 });
  }
  const png = await renderPage(r.resume.path, () => readResume(r.resume.path), index, r.unlocked ? "none" : index === 0 ? "bottom" : "full");
  return new NextResponse(new Uint8Array(png), {
    headers: { ...noStore, "content-type": "image/png", "content-disposition": "inline", "x-content-type-options": "nosniff" },
  });
}
