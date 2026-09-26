import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createUserBody, firstIssue } from "@/lib/user-input";
import { createUser, listApplicants, usernameTaken } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireAdmin();
  if (g.error) return g.error;
  return NextResponse.json({ users: await listApplicants() });
}

export async function POST(req: Request) {
  const g = await requireAdmin();
  if (g.error) return g.error;
  const parsed = createUserBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const { username, password, ...fields } = parsed.data;
  if (await usernameTaken(username)) return NextResponse.json({ error: `Username "${username}" is taken.` }, { status: 409 });
  return NextResponse.json(await createUser(username, password, "applicant", fields), { status: 201 });
}
