import type { Job } from "../types";
import { stripHtml } from "./text";

const PERSONAL_DOMAINS = /@(gmail|yahoo|outlook|hotmail|rediffmail|ymail|live|icloud)\.[a-z.]+/i;

/**
 * Remove recruiter contact details before anything is stored (spec: job data only).
 * The mail provider is kept so the scam filter can still see "@gmail.com".
 */
export function redactContacts(text: string): string {
  return text
    .replace(/[\w.+-]+(@[\w-]+\.[\w.]+)/g, (_m, domain: string) =>
      PERSONAL_DOMAINS.test(domain) ? `[email ${domain.toLowerCase()}]` : "[email]",
    )
    .replace(/(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, "[phone]");
}

const BATCH_CONTEXT = /(batch|pass[\s-]?outs?|passed[\s-]?out|passing[\s-]?out|year of passing|yop|graduates? of|graduated in)/gi;

/** Years named as eligible batches, e.g. "2024/2025 pass-outs" -> "2024, 2025". */
export function extractBatch(text: string): string | undefined {
  const years = new Set<number>();
  for (const m of text.matchAll(BATCH_CONTEXT)) {
    const at = m.index ?? 0;
    const window = text.slice(Math.max(0, at - 50), at + m[0].length + 50);
    for (const r of window.matchAll(/\b(20[1-3]\d)\s*(?:-|to|–)\s*(20[1-3]\d)\b/g)) {
      const a = Number(r[1]);
      const b = Number(r[2]);
      if (b >= a && b - a <= 6) for (let y = a; y <= b; y++) years.add(y);
    }
    for (const y of window.matchAll(/\b(20[1-3]\d)\b/g)) years.add(Number(y[1]));
  }
  return years.size ? [...years].sort().join(", ") : undefined;
}

export function batchYears(batch: string | undefined): number[] {
  return batch ? batch.split(/[,\s]+/).filter(Boolean).map(Number) : [];
}

export const FRESHERS_OK =
  /\bfreshers?\s+(?:can|may|are|also|welcome|eligible|apply|with)\b|\b(?:open to|welcome|including)\s+freshers?\b|\bfreshers?\s*(?:\/|or|&)\s*(?:experienced|\d)|\bfreshers?\s+(?:and|&)\s+experienced\b/i;

export function freshersCanApply(text: string): boolean {
  return FRESHERS_OK.test(text) || /\bfreshers?\b/i.test(text.slice(0, 120));
}

/** Upper end of a salary string in lakhs per annum, if it can be read. */
export function salaryMaxLpa(salary: string | undefined): number | undefined {
  if (!salary) return;
  const s = salary.toLowerCase().replace(/,/g, "");
  const nums = [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (!nums.length) return;
  const max = Math.max(...nums);
  if (/lac|lakh|lpa|\bl\b/.test(s)) return max;
  if (/month|\bpm\b|p\.m/.test(s)) return (max * 12) / 1e5;
  if (/\bk\b/.test(s)) return (max * 1000 * 12) / 1e5; // "25k" is almost always monthly here
  if (max >= 10000) return max / 1e5; // plain rupee figure per annum
}

/** "Hybrid - Chennai(Pallikaranai)" -> "Chennai (Pallikaranai)" */
export function cleanLocation(loc: string): string {
  return loc
    .replace(/^(hybrid|remote|wfh)\s*-\s*/i, "")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRemoteText(text: string): boolean {
  return /\b(remote|work from home|wfh|anywhere in india)\b/i.test(text);
}

/** Shared tidy-up applied to every source's output. */
export function normalizeJob(job: Job): Job {
  const description = job.description ? redactContacts(stripHtml(job.description)).slice(0, 4000) : undefined;
  const locations = [...new Set(job.location.flatMap((l) => l.split(/,|\//)).map(cleanLocation).filter(Boolean))];
  const text = `${job.title}\n${description ?? ""}`;
  return {
    ...job,
    title: job.title.replace(/\s+/g, " ").trim(),
    company: job.company.replace(/\s+/g, " ").trim(),
    location: locations,
    remote: job.remote || locations.some(isRemoteText),
    skills: [...new Set(job.skills.map((s) => s.trim()).filter(Boolean))],
    description,
    batch: job.batch ?? extractBatch(text),
    flags: [...new Set(job.flags)],
  };
}
