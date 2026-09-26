import type { Config } from "../config";
import { log } from "../log";
import type { Job, Source } from "../types";
import { entryLevelTitle, fetchJson, indiaEligible, sleep } from "./common";

export interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  country?: string;
  workplaceType?: string;
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: { text?: string; content?: string }[];
  categories?: { location?: string; allLocations?: string[]; commitment?: string; team?: string };
}

const titleCase = (s: string) => (s === s.toLowerCase() ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : s);

export function fromLever(p: LeverPosting, slug: string, name?: string): Job {
  const locs = [...new Set([p.categories?.location, ...(p.categories?.allLocations ?? [])].filter((l): l is string => !!l))];
  const lists = (p.lists ?? []).map((l) => `${l.text ?? ""}\n${l.content ?? ""}`).join("\n");
  return {
    source: "lever",
    sourceId: `${slug}:${p.id}`,
    title: titleCase(p.text),
    company: name ?? titleCase(slug),
    location: locs.map(titleCase),
    remote: p.workplaceType === "remote" || locs.some((l) => /remote/i.test(l)),
    country: p.country,
    skills: [],
    description: [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n"),
    postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
    url: p.applyUrl ?? p.hostedUrl,
    flags: [],
  };
}

export const lever: Source = {
  name: "lever",
  async fetchJobs(cfg: Config) {
    const jobs: Job[] = [];
    for (const { slug, name } of cfg.companies.lever) {
      const data = await fetchJson<LeverPosting[]>(
        `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
        {},
        `lever/${slug}`,
      );
      const kept = (data ?? [])
        .map((p) => fromLever(p, slug, name))
        .filter((j) => indiaEligible(j.location.join(", "), j.country) && entryLevelTitle(j.title, cfg.profile));
      if (data) log.info(`lever/${slug}: ${kept.length} of ${data.length}`);
      jobs.push(...kept);
      await sleep(600);
    }
    return jobs;
  },
};
