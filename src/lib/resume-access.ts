import { NextResponse } from "next/server";
import { PLANS } from "./access";
import { requireUser } from "./auth";
import { getResume, getUser, listResumes, type PublicUser, type ResumeInfo } from "./users";

type OwnerCtx = { params: Promise<{ userId: string }> };
type ResumeCtx = { params: Promise<{ userId: string; resumeId: string }> };

export const noStore = { "cache-control": "private, no-store, max-age=0" };

/** An applicant may see only their own resumes; the admin sees anyone's. */
async function ownerFor(ctx: OwnerCtx): Promise<{ owner: PublicUser; isAdmin: boolean; error?: never } | { error: NextResponse }> {
  const g = await requireUser();
  if (g.error) return { error: g.error };
  const id = Number((await ctx.params).userId);
  if (g.user.role !== "admin" && g.user.id !== id) return { error: NextResponse.json({ error: "Not your resume." }, { status: 403 }) };
  const owner = await getUser(id);
  if (!owner) return { error: NextResponse.json({ error: "User not found." }, { status: 404 }) };
  return { owner, isAdmin: g.user.role === "admin" };
}

export interface ResumeView extends ResumeInfo {
  /** Within the pass's resume allowance (e.g. #2 and #3 need the 1-month pass). */
  included: boolean;
  /** Full, unblurred view and download. */
  unlocked: boolean;
}

/** Every resume on file, marked with what this viewer may do with it. */
export async function resumeList(ctx: OwnerCtx) {
  const r = await ownerFor(ctx);
  if (r.error) return r;
  const { owner, isAdmin } = r;
  const resumes: ResumeView[] = (await listResumes(owner.id)).map((x, i) => {
    const included = isAdmin || i < owner.access.resumeLimit;
    return { ...x, included, unlocked: included && (isAdmin || owner.access.resumeUnlocked) };
  });
  return { owner, resumes };
}

/**
 * One resume the viewer is allowed to see at all. Resumes beyond the pass's allowance
 * are refused outright (not even a blurred preview).
 */
export async function resumeFor(ctx: ResumeCtx): Promise<
  { owner: PublicUser; resume: ResumeInfo & { path: string }; unlocked: boolean; error?: never } | { error: NextResponse }
> {
  const r = await ownerFor(ctx);
  if (r.error) return r;
  const { owner, isAdmin } = r;
  const resume = await getResume(owner.id, Number((await ctx.params).resumeId));
  if (!resume) return { error: NextResponse.json({ error: "Resume not found." }, { status: 404 }) };
  if (!isAdmin && resume.position >= owner.access.resumeLimit) {
    return { error: NextResponse.json({ error: `This resume is included with the ${PLANS["1m"].label} pass.` }, { status: 403 }) };
  }
  return { owner, resume, unlocked: isAdmin || owner.access.resumeUnlocked };
}
