import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadConfig } from "@/lib/config";
import { skillCatalogue } from "@/lib/resume";

export const runtime = "nodejs";

/** Skill names for the admin's autocomplete; core = the ones the scoring treats as core by default. */
export async function GET() {
  const g = await requireAdmin();
  if (g.error) return g.error;
  const { profile } = loadConfig();
  return NextResponse.json({
    all: skillCatalogue(profile).map((s) => s.name),
    core: profile.skills.core.map((s) => s.name),
    cities: profile.locations.preferred,
  });
}
