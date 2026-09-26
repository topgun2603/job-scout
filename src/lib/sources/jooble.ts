import type { Config } from "../config";
import { log } from "../log";
import type { Job, Source } from "../types";
import { fetchJson, sleep } from "./common";

export interface JoobleJob {
  id: number | string;
  title: string;
  location?: string;
  snippet?: string;
  salary?: string;
  company?: string;
  link: string;
  updated?: string;
  type?: string;
}

export function fromJooble(j: JoobleJob): Job {
  const title = j.title.replace(/<\/?b>|&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return {
    source: "jooble",
    sourceId: String(j.id),
    title,
    company: j.company?.trim() || "Unknown",
    location: j.location ? [j.location] : [],
    remote: /remote|work from home/i.test(`${j.location ?? ""} ${title}`),
    country: "IN",
    salary: j.salary || undefined,
    skills: [],
    description: j.snippet,
    postedAt: j.updated,
    url: j.link,
    flags: [],
  };
}

/** Jooble India. Free key: https://jooble.org/api/about (JOOBLE_API_KEY in .env). */
export const jooble: Source = {
  name: "jooble",
  async fetchJobs(cfg: Config) {
    const c = cfg.searches.jooble;
    const key = process.env.JOOBLE_API_KEY;
    if (!c.enabled) return [];
    if (!key) {
      log.info("jooble: skipped (set JOOBLE_API_KEY in .env to enable)");
      return [];
    }
    const jobs: Job[] = [];
    for (const keywords of c.queries) {
      const data = await fetchJson<{ jobs: JoobleJob[] }>(
        `https://in.jooble.org/api/${encodeURIComponent(key)}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords, location: c.location }) },
        `jooble "${keywords}"`,
      );
      const found = (data?.jobs ?? []).map(fromJooble);
      if (data) log.info(`jooble "${keywords}": ${found.length}`);
      jobs.push(...found);
      await sleep(1000);
    }
    return jobs;
  },
};
