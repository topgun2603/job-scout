import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/auth";
import { loadConfig } from "@/lib/config";
import { listJobsFor, recentRuns } from "@/lib/db";
import { scoreJob } from "@/lib/pipeline/score";
import { profileFor } from "@/lib/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Links and bare domains ("apply on example.com") in a description become [link]. */
const hideSites = (text?: string) =>
  text
    ?.replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link]")
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.(?:com|in|co|io|net|org|jobs|ai)\b\S*/gi, "[link]");

export async function GET() {
  const g = await requireAccess();
  if (g.error) return g.error;
  const { user } = g;
  const { profile: base } = loadConfig();

  // Applicants are scored on their own skill stack, cities and batch; the admin sees the config profile.
  const profile = user.role === "admin" ? base : profileFor(base, user);
  // The 1-hour preview is browse-only: apply links never leave the server, and neither does
  // where a job came from (source name, source id, or a site named in the description).
  const readOnly = !user.access.full;
  const now = new Date();
  const jobs = (await listJobsFor(user.id)).map((j) => {
    if (user.role === "admin") return j;
    const s = scoreJob(j, profile, now);
    const preview = readOnly
      ? { url: "", source: "", sourceId: "", description: hideSites(j.description) }
      : {};
    return { ...j, ...preview, score: s.score, scoreReasons: s.reasons, matchedSkills: s.matchedSkills };
  });

  return NextResponse.json({
    jobs,
    thresholds: base.thresholds,
    profile: {
      name: user.fullName || (user.role === "admin" ? base.name : user.username),
      graduationYear: profile.graduation.year,
      weeklyGoal: base.weeklyGoal,
    },
    runs: await recentRuns(5),
    readOnly,
  });
}
