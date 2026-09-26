import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

const skill = z.union([
  z.string().transform((name) => ({ name, aliases: [] as string[] })),
  z.object({ name: z.string(), aliases: z.array(z.string()).default([]) }),
]);

const words = z.array(z.string()).default([]);

export const profileSchema = z.object({
  name: z.string().default(""),
  weeklyGoal: z.number().int().positive().default(10),
  graduation: z.object({ year: z.number().int(), degree: z.string().default("") }),
  experience: z.object({
    maxMinYears: z.number().default(1),
    maxMaxYears: z.number().default(3),
    allowTwoIfFreshersOk: z.boolean().default(true),
  }),
  includeInternships: z.boolean().default(false),
  maxAgeDays: z.number().int().positive().default(21),
  skills: z.object({ core: z.array(skill), bonus: z.array(skill).default([]) }),
  locations: z.object({ preferred: words, acceptRemote: z.boolean().default(true) }),
  title: z.object({ role: words, rolePartial: words, level: words }),
  exclude: z.object({
    seniority: words,
    hard: words,
    offTrack: words,
    frontendSignals: words,
    otherFrameworks: words,
    mustMention: words,
  }),
  scam: z.object({ salaryCeilingLpa: z.number().default(12) }),
  scoring: z.object({
    title: z.object({ role: z.number(), rolePartial: z.number(), level: z.number(), max: z.number() }),
    coreSkill: z.object({ each: z.number(), max: z.number() }),
    bonusSkill: z.object({ each: z.number(), max: z.number() }),
    experience: z.object({ min0: z.number(), min1: z.number(), freshersOk: z.number() }),
    location: z.object({ preferred: z.number(), remote: z.number(), otherIndia: z.number() }),
    freshness: z.object({ today: z.number(), within2Days: z.number(), within5Days: z.number() }),
    batchMismatch: z.number(),
  }),
  thresholds: z.object({ strong: z.number(), maybe: z.number() }),
});

export const searchesSchema = z.object({
  naukri: z.object({
    enabled: z.boolean().default(true),
    headless: z.boolean().default(true),
    experience: z.number().int().min(0).default(0),
    jobAgeDays: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(15)]).default(7),
    maxSearches: z.number().int().positive().default(10),
    searches: z.array(
      z.object({ keyword: z.string(), city: z.string().optional(), internship: z.boolean().default(false) }),
    ),
  }),
  adzuna: z
    .object({
      enabled: z.boolean().default(true),
      queries: z.array(z.string()).default(["react fresher", "junior frontend"]),
      maxDaysOld: z.number().int().positive().default(7),
    })
    .prefault({}),
  jooble: z
    .object({
      enabled: z.boolean().default(true),
      queries: z.array(z.string()).default(["react fresher", "junior frontend developer"]),
      location: z.string().default("India"),
    })
    .prefault({}),
});

export const scamSchema = z.object({ fees: words, personalContact: words, vagueRole: words });

const board = z.union([
  z.string().transform((slug) => ({ slug, name: undefined as string | undefined })),
  z.object({ slug: z.string(), name: z.string().optional() }),
]);
const boards = z.array(board).nullish().transform((v) => v ?? []);
export const companiesSchema = z.object({ greenhouse: boards, lever: boards, ashby: boards, smartrecruiters: boards });

export type Profile = z.infer<typeof profileSchema>;
export type Searches = z.infer<typeof searchesSchema>;
export type ScamKeywords = z.infer<typeof scamSchema>;
export type Companies = z.infer<typeof companiesSchema>;

export interface Config {
  profile: Profile;
  searches: Searches;
  scam: ScamKeywords;
  companies: Companies;
}

export const CONFIG_DIR = path.resolve(process.cwd(), "config");

function readYaml<T>(file: string, schema: z.ZodType<T>): T {
  const full = path.join(CONFIG_DIR, file);
  const parsed = schema.safeParse(YAML.parse(fs.readFileSync(full, "utf8")) ?? {});
  if (!parsed.success) {
    throw new Error(`Invalid config/${file}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function loadConfig(): Config {
  return {
    profile: readYaml("profile.yaml", profileSchema),
    searches: readYaml("searches.yaml", searchesSchema),
    scam: readYaml("scam-keywords.yaml", scamSchema),
    companies: readYaml("companies.yaml", companiesSchema),
  };
}
