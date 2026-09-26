import type { Profile } from "../config";
import { log } from "../log";
import { findTerms } from "../pipeline/text";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET/POST JSON with a timeout. Returns undefined (and logs) instead of throwing, so one bad board never sinks a source. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, label = url): Promise<T | undefined> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { accept: "application/json", "user-agent": "job-scout-freshers (personal use)", ...init.headers },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      log.warn(`${label}: HTTP ${res.status}`);
      return;
    }
    return (await res.json()) as T;
  } catch (e) {
    log.warn(`${label}: ${(e as Error).message}`);
  }
}

const INDIA =
  /\b(india|bengaluru|bangalore|chennai|hyderabad|pune|mumbai|gurgaon|gurugram|noida|new delhi|delhi|kolkata|ahmedabad|coimbatore|kochi|jaipur|indore|chandigarh|mysuru|thiruvananthapuram|trivandrum)\b/i;
const REMOTE_ANYWHERE = /\b(anywhere|worldwide|global|apac|asia)\b/i;

/** ATS boards are global: keep India-based roles and remote roles open to India/APAC/anywhere. */
export function indiaEligible(locationText: string, country?: string): boolean {
  if (country) return country.toUpperCase() === "IN";
  if (INDIA.test(locationText)) return true;
  return /\bremote\b/i.test(locationText) && REMOTE_ANYWHERE.test(locationText);
}

const ENTRY_TERMS = [
  "new grad",
  "new graduate",
  "university",
  "campus",
  "early career",
  "entry level",
  "entry-level",
  "software engineer i",
  "software engineer 1",
  "engineer 1",
  "sde1",
  "sde-i",
  "apprentice",
];

const TECH_TERMS = [
  "engineer",
  "engineering",
  "developer",
  "development",
  "sde",
  "sde1",
  "software",
  "programmer",
  "web",
  "frontend",
  "front end",
  "front-end",
  "ui",
  "full stack",
  "fullstack",
  "react",
  "javascript",
];

/**
 * Spec 5.2: from company boards keep only entry-level or frontend titles with no senior keyword.
 * "Associate" / "Intern" alone also matches ops, HR and sales roles, so a tech word is required too.
 * Big boards list hundreds of roles, so this runs before anything is stored.
 */
export function entryLevelTitle(title: string, profile: Profile): boolean {
  if (findTerms(title, profile.exclude.seniority).length) return false;
  if (/\b(ii|iii|iv|2|3)\s*$|\b(engineer|sde)[\s-]*(ii|iii|2|3)\b/i.test(title)) return false;
  if (findTerms(title, profile.title.role).length) return true; // "Frontend Engineer" counts as-is
  const entry = findTerms(title, [...profile.title.level, ...ENTRY_TERMS]).length > 0;
  return entry && findTerms(title, TECH_TERMS).length > 0;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
