import { NextResponse } from "next/server";
import { requireAdmin } from "./auth";
import { getUser, type PublicUser } from "./users";

export type IdCtx = { params: Promise<{ id: string }> };

/** Admin-only routes that act on one applicant (admins themselves are managed from the CLI). */
export async function applicantFrom(ctx: IdCtx): Promise<{ user: PublicUser; error?: never } | { user?: never; error: NextResponse }> {
  const g = await requireAdmin();
  if (g.error) return { error: g.error };
  const user = await getUser(Number((await ctx.params).id));
  if (!user || user.role !== "applicant") return { error: NextResponse.json({ error: "Applicant not found." }, { status: 404 }) };
  return { user };
}
