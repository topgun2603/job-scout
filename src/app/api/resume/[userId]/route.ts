import { NextResponse } from "next/server";
import { noStore, resumeList } from "@/lib/resume-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const r = await resumeList(ctx);
  if ("error" in r) return r.error;
  return NextResponse.json({ resumes: r.resumes, access: r.owner.access }, { headers: noStore });
}
