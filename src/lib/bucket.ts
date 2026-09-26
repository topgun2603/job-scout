// Client-safe helpers shared by the dashboard (no node imports here).
import type { Bucket, JobRow } from "./types";

export interface Thresholds {
  strong: number;
  maybe: number;
}

export const isScamFlag = (f: string) => f.startsWith("possible-scam");

export function bucketOf(job: Pick<JobRow, "score" | "flags">, t: Thresholds): Bucket {
  if (job.flags.some(isScamFlag)) return "careful";
  if (job.score >= t.strong) return "strong";
  if (job.score >= t.maybe) return "maybe";
  return "low";
}

/** Calendar days, same rule as the freshness score (score.ts daysSincePosted). */
export function postedLabel(iso: string | undefined, now = new Date()): string {
  if (!iso) return "date unknown";
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function expLabel(min?: number, max?: number): string | undefined {
  if (min === undefined && max === undefined) return;
  if (min === max || max === undefined) return `${min ?? 0} yrs`;
  return `${min ?? 0}-${max} yrs`;
}
