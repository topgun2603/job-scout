import type { Config } from "../config";
import { log } from "../log";
import type { Job, Source } from "../types";
import { fetchJson, sleep } from "./common";

export interface AdzunaResult {
  id: string;
  title: string;
  description?: string;
  created?: string;
  redirect_url: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  salary_min?: number;
  salary_max?: number;
}

const lakh = (n: number) => Math.round((n / 1e5) * 10) / 10;

export function fromAdzuna(r: AdzunaResult): Job {
  const loc = r.location?.display_name ?? r.location?.area?.at(-1) ?? "";
  const salary =
    r.salary_min && r.salary_max
      ? `${lakh(r.salary_min)}-${lakh(r.salary_max)} Lacs PA`
      : r.salary_max
        ? `${lakh(r.salary_max)} Lacs PA`
        : undefined;
  return {
    source: "adzuna",
    sourceId: String(r.id),
    title: r.title.replace(/<\/?strong>/g, ""),
    company: r.company?.display_name ?? "Unknown",
    location: loc ? [loc] : [],
    remote: /remote|work from home/i.test(`${loc} ${r.title}`),
    country: "IN",
    salary,
    skills: [],
    description: r.description?.replace(/<\/?strong>/g, ""),
    postedAt: r.created,
    url: r.redirect_url,
    flags: [],
  };
}

/** Adzuna India. Free key: https://developer.adzuna.com (ADZUNA_APP_ID / ADZUNA_APP_KEY in .env). */
export const adzuna: Source = {
  name: "adzuna",
  async fetchJobs(cfg: Config) {
    const a = cfg.searches.adzuna;
    const id = process.env.ADZUNA_APP_ID;
    const key = process.env.ADZUNA_APP_KEY;
    if (!a.enabled) return [];
    if (!id || !key) {
      log.info("adzuna: skipped (set ADZUNA_APP_ID and ADZUNA_APP_KEY in .env to enable)");
      return [];
    }
    const jobs: Job[] = [];
    for (const what of a.queries) {
      const params = new URLSearchParams({
        app_id: id,
        app_key: key,
        what,
        results_per_page: "50",
        max_days_old: String(a.maxDaysOld),
        sort_by: "date",
        "content-type": "application/json",
      });
      const data = await fetchJson<{ results: AdzunaResult[] }>(
        `https://api.adzuna.com/v1/api/jobs/in/search/1?${params}`,
        {},
        `adzuna "${what}"`,
      );
      const found = (data?.results ?? []).map(fromAdzuna);
      if (data) log.info(`adzuna "${what}": ${found.length}`);
      jobs.push(...found);
      await sleep(1000);
    }
    return jobs;
  },
};
