import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { recentRuns } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One scout at a time: the same process as `npm run scout`, started from the dashboard.
let child: ChildProcess | undefined;
let lines: string[] = [];

const isRunning = () => !!child && child.exitCode === null && !child.killed;

export async function GET() {
  const g = await requireAdmin();
  if (g.error) return g.error;
  return NextResponse.json({ running: isRunning(), log: lines.slice(-12), runs: await recentRuns(5) });
}

export async function POST() {
  const g = await requireAdmin();
  if (g.error) return g.error;
  const last = (await recentRuns(1))[0];
  const staleCutoff = Date.now() - 15 * 60_000;
  if (isRunning() || (last?.status === "running" && new Date(last.startedAt).getTime() > staleCutoff)) {
    return NextResponse.json({ error: "A scout run is already in progress." }, { status: 409 });
  }

  lines = [];
  const cli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  child = spawn(process.execPath, [cli, "scripts/scout.ts"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  const collect = (buf: Buffer) => {
    lines.push(...buf.toString().split(/\r?\n/).filter(Boolean));
    if (lines.length > 200) lines = lines.slice(-200);
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  return NextResponse.json({ started: true }, { status: 202 });
}
