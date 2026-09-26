/**
 * Naukri source: a real browser, no login, one tab, low volume.
 *
 * Discovery (scripts/discover-naukri.ts, 2026-09-26) showed the search page loads its
 * listings from GET https://www.naukri.com/jobapi/v3/search?... with the jobs in
 * `jobDetails[]`. We listen for that response; if it never arrives we parse the
 * rendered cards (.srp-jobtuple-wrapper) instead.
 */
import { chromium, type Page, type Response } from "playwright";
import type { Config } from "../config";
import { log } from "../log";
import type { Job, Source } from "../types";

// Politeness limits. Enforced here regardless of what config asks for.
export const HARD_MAX_SEARCHES = 10;
export const MIN_DELAY_MS = 4_000;
export const MAX_DELAY_MS = 10_000;
const API_PATH = "/jobapi/v3/search";

export class BlockedError extends Error {}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function searchUrl(keyword: string, city: string | undefined, experience: number, jobAgeDays: number): string {
  const path = `${slug(keyword)}-jobs${city ? `-in-${slug(city)}` : ""}`;
  return `https://www.naukri.com/${path}?experience=${experience}&jobAge=${jobAgeDays}`;
}

export function politeDelay(random = Math.random): number {
  return Math.round(MIN_DELAY_MS + random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

// ---------- JSON parsing ----------

interface NaukriPlaceholder {
  type?: string;
  label?: string;
}
export interface NaukriJob {
  jobId?: string;
  title?: string;
  companyName?: string;
  placeholders?: NaukriPlaceholder[];
  tagsAndSkills?: string;
  jobDescription?: string;
  jdURL?: string;
  createdDate?: number;
  footerPlaceholderLabel?: string;
  minimumExperience?: string;
  maximumExperience?: string;
  experienceText?: string;
}

const num = (v: unknown) => {
  const n = Number(v);
  return v === undefined || v === null || v === "" || Number.isNaN(n) ? undefined : n;
};

/** "1 Day Ago", "Few Hours Ago", "Just Now", "Today" -> ISO date. */
export function relativeToIso(label: string | undefined, now = new Date()): string | undefined {
  if (!label) return;
  const l = label.toLowerCase();
  if (/just now|hour|today|few|minute/.test(l)) return now.toISOString();
  const m = l.match(/(\d+)\+?\s*days?\s*ago/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 86_400_000).toISOString();
}

function expRange(text: string | undefined): { min?: number; max?: number } {
  const m = text?.match(/(\d+)\s*(?:-\s*(\d+))?\s*yrs?/i);
  return m ? { min: num(m[1]), max: num(m[2] ?? m[1]) } : {};
}

export function fromNaukriJson(raw: NaukriJob, now = new Date()): Job | undefined {
  if (!raw.jobId || !raw.title) return;
  const ph = (type: string) => raw.placeholders?.find((p) => p.type === type)?.label?.trim();
  const salary = ph("salary");
  const location = ph("location") ?? "";
  const fallbackExp = expRange(raw.experienceText ?? ph("experience"));
  const url = raw.jdURL?.startsWith("http") ? raw.jdURL : `https://www.naukri.com${raw.jdURL ?? `/job-listings-${raw.jobId}`}`;
  return {
    source: "naukri",
    sourceId: String(raw.jobId),
    title: raw.title,
    company: raw.companyName ?? "Unknown",
    location: location ? location.split(",") : [],
    remote: /remote|work from home/i.test(location),
    country: "IN",
    expMin: num(raw.minimumExperience) ?? fallbackExp.min,
    expMax: num(raw.maximumExperience) ?? fallbackExp.max,
    salary: salary && !/not disclosed/i.test(salary) ? salary : undefined,
    skills: (raw.tagsAndSkills ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    description: raw.jobDescription,
    postedAt: raw.createdDate ? new Date(raw.createdDate).toISOString() : relativeToIso(raw.footerPlaceholderLabel, now),
    url,
    flags: [],
  };
}

// ---------- DOM fallback ----------

async function parseDom(page: Page): Promise<Job[]> {
  const cards = await page.$$eval(".srp-jobtuple-wrapper", (els) =>
    els.map((el) => {
      const text = (sel: string) => el.querySelector(sel)?.textContent?.trim() ?? "";
      const a = el.querySelector<HTMLAnchorElement>("a.title");
      return {
        id: el.getAttribute("data-job-id") ?? "",
        title: a?.textContent?.trim() ?? "",
        href: a?.href ?? "",
        company: text(".comp-name"),
        exp: text(".exp-wrap"),
        salary: text(".sal-wrap"),
        location: text(".loc-wrap"),
        description: text(".job-desc"),
        skills: [...el.querySelectorAll(".tags-gt li")].map((li) => li.textContent?.trim() ?? ""),
        posted: text(".job-post-day"),
      };
    }),
  );
  const now = new Date();
  return cards
    .filter((c) => c.id && c.title)
    .map((c) => {
      const exp = expRange(c.exp);
      return {
        source: "naukri",
        sourceId: c.id,
        title: c.title,
        company: c.company || "Unknown",
        location: c.location ? c.location.split(",") : [],
        remote: /remote|work from home/i.test(c.location),
        country: "IN",
        expMin: exp.min,
        expMax: exp.max,
        salary: c.salary && !/not disclosed/i.test(c.salary) ? c.salary : undefined,
        skills: c.skills,
        description: c.description,
        postedAt: relativeToIso(c.posted, now),
        url: c.href,
        flags: [],
      } satisfies Job;
    });
}

async function looksBlocked(page: Page, res: Response | null): Promise<string | undefined> {
  const status = res?.status();
  if (status === 403 || status === 429) return `HTTP ${status}`;
  const captcha = page.locator(".bot-guard-captcha .wrap, iframe[src*='recaptcha'], iframe[src*='captcha']");
  if (await captcha.first().isVisible().catch(() => false)) return "captcha shown";
  if (/access denied/i.test(await page.title())) return "access denied page";
}

// ---------- Source ----------

export const naukri: Source = {
  name: "naukri",
  async fetchJobs(cfg: Config): Promise<Job[]> {
    const n = cfg.searches.naukri;
    if (!n.enabled) return [];
    const searches = n.searches
      .filter((s) => !s.internship || cfg.profile.includeInternships)
      .slice(0, Math.min(n.maxSearches, HARD_MAX_SEARCHES));

    const browser = await chromium.launch({ headless: n.headless });
    const context = await browser.newContext({ locale: "en-IN", viewport: { width: 1280, height: 900 } });
    const page = await context.newPage(); // one tab, reused sequentially
    const jobs: Job[] = [];

    try {
      for (const [i, s] of searches.entries()) {
        if (i > 0) await page.waitForTimeout(politeDelay());
        const url = searchUrl(s.keyword, s.city, n.experience, n.jobAgeDays);
        const label = `"${s.keyword}"${s.city ? ` in ${s.city}` : ""}`;

        const apiResponse = page
          .waitForResponse((r) => r.url().includes(API_PATH) && r.request().method() === "GET", { timeout: 25_000 })
          .catch(() => undefined);
        const doc = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });

        const blocked = await looksBlocked(page, doc);
        if (blocked) throw new BlockedError(`Naukri blocked the session (${blocked}) on ${label}; stopping.`);

        const res = await apiResponse;
        let found: Job[] = [];
        if (res?.ok()) {
          const body = (await res.json().catch(() => undefined)) as { jobDetails?: NaukriJob[] } | undefined;
          found = (body?.jobDetails ?? []).map((j) => fromNaukriJson(j)).filter((j): j is Job => !!j);
        } else if (res && [403, 429].includes(res.status())) {
          throw new BlockedError(`Naukri API returned ${res.status()} on ${label}; stopping.`);
        }
        if (!found.length) {
          await page.waitForSelector(".srp-jobtuple-wrapper", { timeout: 8_000 }).catch(() => undefined);
          found = await parseDom(page);
          if (found.length) log.warn(`naukri ${label}: API response missing, used DOM fallback`);
        }
        log.info(`naukri ${label}: ${found.length} jobs`);
        jobs.push(...found);
      }
    } catch (e) {
      if (e instanceof BlockedError) log.error(e.message);
      else throw e;
    } finally {
      await browser.close();
    }
    return jobs;
  },
};
