import { createHash } from "node:crypto";
import type { Job } from "../types";

const COMPANY_NOISE = /\b(private|pvt|limited|ltd|llp|inc|technologies|technology|solutions|software|services|india)\b/g;

/** hash(lower(title)+lower(company)), with punctuation and company suffixes smoothed out. */
export function fingerprint(job: Pick<Job, "title" | "company">): string {
  const title = job.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const company = job.company.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(COMPANY_NOISE, "").replace(/\s+/g, " ").trim();
  return createHash("sha1").update(`${title}|${company}`).digest("hex").slice(0, 16);
}

/** Drop repeats inside one fetch (same posting found by two searches). */
export function dedupeBatch(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  return jobs.filter((j) => {
    const keys = [`${j.source}:${j.sourceId}`, fingerprint(j)];
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}
