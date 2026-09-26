import type { Config } from "../config";
import { log } from "../log";
import type { Job, Source } from "../types";
import { entryLevelTitle, fetchJson, indiaEligible, sleep } from "./common";

export interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  isListed?: boolean;
  publishedAt?: string;
  jobUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  address?: { postalAddress?: { addressCountry?: string } };
  compensation?: { scrapeableCompensationSalarySummary?: string | null };
}

export function fromAshby(a: AshbyJob, slug: string, name?: string): Job {
  const locs = [a.location, ...(a.secondaryLocations ?? []).map((s) => s.location)].filter((l): l is string => !!l);
  const country = a.address?.postalAddress?.addressCountry;
  return {
    source: "ashby",
    sourceId: `${slug}:${a.id}`,
    title: a.title,
    company: name ?? slug.charAt(0).toUpperCase() + slug.slice(1),
    location: country && !locs.some((l) => l.includes(country)) ? [...locs, country] : locs,
    remote: !!a.isRemote,
    salary: a.compensation?.scrapeableCompensationSalarySummary ?? undefined,
    skills: [],
    description: a.descriptionPlain,
    postedAt: a.publishedAt,
    url: a.applyUrl ?? a.jobUrl,
    flags: [],
  };
}

export const ashby: Source = {
  name: "ashby",
  async fetchJobs(cfg: Config) {
    const jobs: Job[] = [];
    for (const { slug, name } of cfg.companies.ashby) {
      const data = await fetchJson<{ jobs: AshbyJob[] }>(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
        {},
        `ashby/${slug}`,
      );
      const kept = (data?.jobs ?? [])
        .filter((a) => a.isListed !== false)
        .map((a) => fromAshby(a, slug, name))
        .filter((j) => indiaEligible(j.location.join(", ")) && entryLevelTitle(j.title, cfg.profile));
      if (data) log.info(`ashby/${slug}: ${kept.length} of ${data.jobs.length}`);
      jobs.push(...kept);
      await sleep(600);
    }
    return jobs;
  },
};
