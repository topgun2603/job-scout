import { loadConfig } from "@/lib/config";
import type { Job } from "@/lib/types";

// Tests run against the real config files, so they also guard the YAML.
export const cfg = loadConfig();
export const NOW = new Date("2026-09-26T10:00:00+05:30");

export function job(overrides: Partial<Job> = {}): Job {
  return {
    source: "naukri",
    sourceId: "1",
    title: "React Developer",
    company: "Acme Labs",
    location: ["Chennai"],
    remote: false,
    country: "IN",
    expMin: 0,
    expMax: 1,
    skills: [],
    description: "",
    postedAt: NOW.toISOString(),
    url: "https://example.com/job/1",
    flags: [],
    ...overrides,
  };
}
