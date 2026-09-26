import type { Profile } from "../config";
import type { Job, Scored } from "../types";
import { batchYears, freshersCanApply } from "./normalize";
import { findTerms, hasTerm } from "./text";

const DAY = 86_400_000;

const CITY_ALIASES: Record<string, string[]> = {
  bengaluru: ["bangalore"],
  gurugram: ["gurgaon"],
  mumbai: ["bombay", "navi mumbai"],
  kochi: ["cochin"],
  thiruvananthapuram: ["trivandrum"],
  puducherry: ["pondicherry"],
  "delhi ncr": ["delhi", "new delhi", "noida", "gurugram", "gurgaon"],
};

const INDIA_HINT =
  /\b(india|chennai|bengaluru|bangalore|hyderabad|coimbatore|pune|mumbai|delhi|noida|gurugram|gurgaon|kolkata|ahmedabad|jaipur|kochi|trivandrum|madurai|indore|chandigarh|mysuru|mysore|vizag|visakhapatnam|nagpur|bhubaneswar|lucknow)\b/i;

function cityTerms(city: string): string[] {
  return [city, ...(CITY_ALIASES[city.toLowerCase()] ?? [])];
}

type SkillSpec = Profile["skills"]["core"][number];

function matchSkills(text: string, skills: SkillSpec[]): string[] {
  return skills.filter((s) => [s.name, ...s.aliases].some((t) => hasTerm(text, t))).map((s) => s.name);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days between posting and now (0 = today). */
export function daysSincePosted(postedAt: string | undefined, now = new Date()): number | undefined {
  if (!postedAt) return;
  const t = new Date(postedAt);
  if (Number.isNaN(t.getTime())) return;
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(t)) / DAY));
}

export function scoreJob(job: Job, profile: Profile, now = new Date()): Scored {
  const w = profile.scoring;
  const reasons: string[] = [];
  let score = 0;
  const add = (pts: number, why: string) => {
    if (!pts) return;
    score += pts;
    reasons.push(`${pts > 0 ? "+" : ""}${pts} ${why}`);
  };

  // Title
  const role = findTerms(job.title, profile.title.role)[0];
  const partial = role ? undefined : findTerms(job.title, profile.title.rolePartial)[0];
  const level = findTerms(job.title, profile.title.level)[0];
  const titlePts = Math.min(w.title.max, (role ? w.title.role : partial ? w.title.rolePartial : 0) + (level ? w.title.level : 0));
  add(titlePts, `title: ${[role ?? partial, level].filter(Boolean).join(" + ")}`);

  // Skills: title, tags and description all count
  const text = `${job.title}\n${job.skills.join(", ")}\n${job.description ?? ""}`;
  const core = matchSkills(text, profile.skills.core);
  add(Math.min(w.coreSkill.max, core.length * w.coreSkill.each), `skills: ${core.join(", ")}`);
  const bonus = matchSkills(text, profile.skills.bonus);
  add(Math.min(w.bonusSkill.max, bonus.length * w.bonusSkill.each), `bonus: ${bonus.join(", ")}`);

  // Experience
  const freshersOk = freshersCanApply(`${job.title}\n${job.description ?? ""}`);
  if (job.expMin === 0) add(w.experience.min0, "exp: 0 yrs min");
  else if (job.expMin === 1) add(Math.max(w.experience.min1, freshersOk ? w.experience.freshersOk : 0), "exp: 1 yr min");
  else if (freshersOk) add(w.experience.freshersOk, "exp: freshers can apply");

  // Location
  const locText = job.location.join(", ");
  const city = profile.locations.preferred.find((c) => cityTerms(c).some((t) => hasTerm(locText, t)));
  if (city) add(w.location.preferred, `location: ${city}`);
  else if (job.remote && profile.locations.acceptRemote && (job.country === "IN" || !/\b(us|usa|uk|europe|emea)\b/i.test(locText)))
    add(w.location.remote, "location: remote India");
  else if (job.country === "IN" || INDIA_HINT.test(locText)) add(w.location.otherIndia, `location: ${job.location[0] ?? "India"}`);

  // Freshness
  const days = daysSincePosted(job.postedAt, now);
  if (days === 0) add(w.freshness.today, "fresh: posted today");
  else if (days !== undefined && days <= 2) add(w.freshness.within2Days, `fresh: ${days}d old`);
  else if (days !== undefined && days <= 5) add(w.freshness.within5Days, `fresh: ${days}d old`);

  // Batch restriction
  const years = batchYears(job.batch);
  if (years.length && !years.includes(profile.graduation.year)) {
    add(w.batchMismatch, `batch: ${job.batch} only (you: ${profile.graduation.year})`);
  }

  return { score: Math.max(0, Math.min(100, score)), reasons, matchedSkills: [...core, ...bonus] };
}
