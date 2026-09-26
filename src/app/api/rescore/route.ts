import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadConfig } from "@/lib/config";
import { evaluateAll } from "@/lib/pipeline/run";

export const runtime = "nodejs";

/** Re-apply config/*.yaml to stored jobs. Cheap, no network. */
export async function POST() {
  const g = await requireAdmin();
  if (g.error) return g.error;
  try {
    return NextResponse.json(evaluateAll(loadConfig()));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
