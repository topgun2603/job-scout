import type { Config } from "./config";

export interface Job {
  source: string; // 'naukri' | 'greenhouse' | 'lever' | 'adzuna' ...
  sourceId: string;
  title: string;
  company: string;
  location: string[];
  remote: boolean;
  country?: string; // ISO code when the source guarantees it (Naukri = IN)
  expMin?: number;
  expMax?: number;
  salary?: string; // raw text
  skills: string[];
  description?: string;
  batch?: string; // e.g. "2025, 2026" if the posting mentions it
  postedAt?: string; // ISO date
  url: string;
  flags: string[]; // e.g. ["possible-scam: training fee"]
}

export interface Source {
  name: string;
  fetchJobs(cfg: Config): Promise<Job[]>;
}

export type JobStatus = "new" | "applied" | "skipped" | "filtered";

export interface Scored {
  score: number;
  reasons: string[];
  matchedSkills: string[];
}

/** A job as stored in SQLite and served to the dashboard. */
export interface JobRow extends Job {
  id: number;
  fingerprint: string;
  score: number;
  scoreReasons: string[];
  matchedSkills: string[];
  filterReason?: string;
  firstSeen: string;
  lastSeen: string;
  status: JobStatus;
  statusChangedAt?: string;
}

export type Bucket = "strong" | "maybe" | "careful" | "low";

export interface RunRow {
  id: number;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "ok" | "error";
  fetched: number;
  inserted: number;
  message?: string;
}
