import type { Config } from "../config";
import { log } from "../log";
import type { Job, Source } from "../types";
import { entryLevelTitle, fetchJson, sleep } from "./common";

const API = "https://api.smartrecruiters.com/v1/companies";
const MAX_PAGES = 6; // 600 postings per company is plenty
const MAX_DETAILS = 15; // description fetches per company, only for postings that pass the title filter

export interface SmartRecruitersPosting {
  id: string;
  name: string;
  releasedDate?: string;
  company?: { identifier?: string; name?: string };
  location?: { city?: string; country?: string; remote?: boolean; fullLocation?: string };
  experienceLevel?: { id?: string };
}

interface Detail {
  postingUrl?: string;
  applyUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string } | undefined> };
}

export function fromSmartRecruiters(p: SmartRecruitersPosting, slug: string, name?: string, detail?: Detail): Job {
  const loc = p.location?.fullLocation?.replace(/,\s*,/g, ",") ?? [p.location?.city, "India"].filter(Boolean).join(", ");
  const sections = detail?.jobAd?.sections ?? {};
  const description = ["jobDescription", "qualifications", "additionalInformation"]
    .map((k) => sections[k]?.text)
    .filter(Boolean)
    .join("\n");
  return {
    source: "smartrecruiters",
    sourceId: `${slug}:${p.id}`,
    title: p.name.trim(),
    company: name ?? p.company?.name ?? slug,
    location: loc ? [loc] : [],
    remote: !!p.location?.remote,
    country: p.location?.country?.toUpperCase(),
    skills: [],
    description: description || undefined,
    postedAt: p.releasedDate,
    url: detail?.applyUrl ?? detail?.postingUrl ?? `https://jobs.smartrecruiters.com/${slug}/${p.id}`,
    flags: [],
  };
}

export const smartrecruiters: Source = {
  name: "smartrecruiters",
  async fetchJobs(cfg: Config) {
    const jobs: Job[] = [];
    for (const { slug, name } of cfg.companies.smartrecruiters) {
      const postings: SmartRecruitersPosting[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await fetchJson<{ totalFound: number; content: SmartRecruitersPosting[] }>(
          `${API}/${encodeURIComponent(slug)}/postings?country=in&limit=100&offset=${page * 100}`,
          {},
          `smartrecruiters/${slug}`,
        );
        postings.push(...(data?.content ?? []));
        if (!data || postings.length >= data.totalFound || !data.content.length) break;
        await sleep(500);
      }

      const candidates = postings.filter((p) => entryLevelTitle(p.name, cfg.profile)).slice(0, MAX_DETAILS);
      for (const p of candidates) {
        const detail = await fetchJson<Detail>(`${API}/${encodeURIComponent(slug)}/postings/${p.id}`, {}, `smartrecruiters/${slug}/${p.id}`);
        jobs.push(fromSmartRecruiters(p, slug, name, detail));
        await sleep(400);
      }
      log.info(`smartrecruiters/${slug}: ${candidates.length} of ${postings.length}`);
      await sleep(600);
    }
    return jobs;
  },
};
