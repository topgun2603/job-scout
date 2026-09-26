import type { Config, Profile, ScamKeywords } from "../config";
import type { Job } from "../types";
import { findPhrases, findTerms } from "./text";
import { freshersCanApply, salaryMaxLpa } from "./normalize";

export const SCAM_PREFIX = "possible-scam";

const DAY = 86_400_000;

export function isInternship(job: Job): boolean {
  return /\bintern(ship)?s?\b/i.test(job.title);
}

function jobText(job: Job): string {
  return `${job.title}\n${job.description ?? ""}`;
}

/**
 * 7.1 seniority / relevance filter. Returns the drop reason, or undefined to keep.
 */
export function dropReason(job: Job, profile: Profile, now = new Date()): string | undefined {
  const { exclude, experience } = profile;
  const title = job.title;

  const senior = findTerms(title, exclude.seniority)[0];
  if (senior) return `senior title: "${senior}"`;

  if (/\b([3-9]|\d{2})\s*\+\s*(yrs?|years?)\b/i.test(title)) return "title asks for 3+ years";

  const hard = findTerms(title, exclude.hard)[0];
  if (hard) return `not a dev role: "${hard}"`;

  const offTrack = findTerms(title, exclude.offTrack)[0];
  if (offTrack && !findTerms(title, exclude.frontendSignals).length) return `off-track role: "${offTrack}"`;

  const framework = findTerms(title, exclude.otherFrameworks)[0];
  if (framework && !findTerms(title, ["react", "reactjs", "react.js", "mern", "next.js"]).length) {
    return `${framework} role, not React`;
  }

  const everything = `${jobText(job)}\n${job.skills.join(", ")}`;
  if (exclude.mustMention.length && !findTerms(everything, exclude.mustMention).length) {
    return "no React / frontend mention";
  }

  if (isInternship(job)) {
    if (!profile.includeInternships) return "internship (toggle is off)";
    if (/unpaid/i.test(job.salary ?? "")) return "unpaid internship";
  }

  if (job.expMin !== undefined && job.expMin > experience.maxMinYears) {
    const twoAllowed = job.expMin === 2 && experience.allowTwoIfFreshersOk && freshersCanApply(jobText(job));
    if (!twoAllowed) return `needs ${job.expMin}+ yrs`;
  }
  if (job.expMax !== undefined && job.expMax > experience.maxMaxYears && (job.expMin ?? 0) > 0) {
    return `experience range up to ${job.expMax} yrs`;
  }

  if (job.postedAt) {
    const age = (now.getTime() - new Date(job.postedAt).getTime()) / DAY;
    if (age > profile.maxAgeDays) return `stale: posted ${Math.floor(age)} days ago`;
  }
  return undefined;
}

function hasCompanyWebsite(text: string): boolean {
  const links = text.match(/\b(?:https?:\/\/|www\.)[^\s)]+/gi) ?? [];
  return links.some((l) => !/(gmail|yahoo|outlook|hotmail|wa\.me|whatsapp|forms\.gle|bit\.ly)/i.test(l));
}

/**
 * 7.2 scam filter. Never drops; returns warning flags for "Check carefully".
 */
export function scamFlags(job: Job, profile: Profile, scam: ScamKeywords): string[] {
  const text = `${jobText(job)}\n${job.salary ?? ""}`;
  const flags: string[] = [];

  const fees = findPhrases(text, scam.fees);
  if (fees.length) flags.push(`${SCAM_PREFIX}: mentions ${fees.slice(0, 2).join(", ")}`);

  const contact = findPhrases(text, scam.personalContact);
  if (contact.length && !hasCompanyWebsite(text)) {
    flags.push(`${SCAM_PREFIX}: contact only via personal ${contact.some((c) => /wa|whats/i.test(c)) ? "WhatsApp" : "email"}`);
  }

  const lpa = salaryMaxLpa(job.salary);
  const vague =
    findPhrases(text, scam.vagueRole).length > 0 || (job.skills.length < 2 && (job.description ?? "").length < 150);
  if (lpa !== undefined && lpa > profile.scam.salaryCeilingLpa && vague) {
    flags.push(`${SCAM_PREFIX}: ${lpa} LPA for a fresher with a vague role`);
  }
  return flags;
}

export interface FilterOutcome {
  drop?: string;
  flags: string[];
}

export function applyFilters(job: Job, cfg: Config, now = new Date()): FilterOutcome {
  const sourceFlags = job.flags.filter((f) => !f.startsWith(SCAM_PREFIX));
  return {
    drop: dropReason(job, cfg.profile, now),
    flags: [...sourceFlags, ...scamFlags(job, cfg.profile, cfg.scam)],
  };
}

export const isFlagged = (flags: string[]) => flags.some((f) => f.startsWith(SCAM_PREFIX));

