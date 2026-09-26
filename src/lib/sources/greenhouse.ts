import type { Config } from "../config";
import { log } from "../log";
import type { Job, Source } from "../types";
import { decodeEntities, entryLevelTitle, fetchJson, indiaEligible, sleep } from "./common";

export interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  offices?: { name?: string; location?: string | null }[];
  company_name?: string;
  content?: string;
  first_published?: string;
  updated_at?: string;
}

export function fromGreenhouse(g: GreenhouseJob, slug: string, name?: string): Job {
  const locs = [g.location?.name, ...(g.offices ?? []).map((o) => o.location ?? o.name)].filter((l): l is string => !!l);
  const unique = [...new Set(locs)];
  return {
    source: "greenhouse",
    sourceId: `${slug}:${g.id}`,
    title: g.title,
    company: name ?? g.company_name ?? slug,
    location: unique.flatMap((l) => l.split(";")),
    remote: unique.some((l) => /remote/i.test(l)),
    skills: [],
    description: g.content ? decodeEntities(g.content) : undefined,
    postedAt: g.first_published ?? g.updated_at,
    url: g.absolute_url,
    flags: [],
  };
}

export const greenhouse: Source = {
  name: "greenhouse",
  async fetchJobs(cfg: Config) {
    const jobs: Job[] = [];
    for (const { slug, name } of cfg.companies.greenhouse) {
      const data = await fetchJson<{ jobs: GreenhouseJob[] }>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
        {},
        `greenhouse/${slug}`,
      );
      const kept = (data?.jobs ?? [])
        .map((g) => fromGreenhouse(g, slug, name))
        .filter((j) => indiaEligible(j.location.join(", ")) && entryLevelTitle(j.title, cfg.profile));
      if (data) log.info(`greenhouse/${slug}: ${kept.length} of ${data.jobs.length}`);
      jobs.push(...kept);
      await sleep(600);
    }
    return jobs;
  },
};
