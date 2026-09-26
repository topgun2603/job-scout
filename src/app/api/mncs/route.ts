import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/auth";
import { gateMncRoles, listMncCompanies, listMncRoles } from "@/lib/mnc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admins get every role plus the per-company probe status; applicants get what their pass reveals. */
export async function GET() {
  const g = await requireAccess();
  if (g.error) return g.error;
  const { user } = g;
  const companies = await listMncCompanies();
  const roles = await listMncRoles();
  const checkedAt = companies[0]?.checkedAt;
  if (user.role === "admin") return NextResponse.json({ roles, companies, checkedAt, readOnly: false });
  // Nothing about where or when the roles were found goes to applicants.
  return NextResponse.json({ roles: gateMncRoles(roles, user.access), readOnly: !user.access.full });
}
