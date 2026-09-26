import { loadConfig, type Config } from "../config";
import { finishRun, jobsToEvaluate, saveEvaluations, startRun, upsertJobs, type Evaluation } from "../db";
import { log } from "../log";
import type { Job, Source } from "../types";
import { dedupeBatch, fingerprint } from "./dedupe";
import { applyFilters } from "./filters";
import { normalizeJob } from "./normalize";
import { scoreJob } from "./score";

/** Filter + score every job that has not been acted on yet, so config edits apply retroactively. */
export async function evaluateAll(cfg: Config, now = new Date()) {
  const evals: Evaluation[] = (await jobsToEvaluate()).map((job) => {
    const { drop, flags } = applyFilters(job, cfg, now);
    const s = scoreJob(job, cfg.profile, now);
    return {
      id: job.id,
      status: drop ? "filtered" : "new",
      filterReason: drop,
      flags,
      score: s.score,
      reasons: s.reasons,
      matchedSkills: s.matchedSkills,
    };
  });
  await saveEvaluations(evals);
  const kept = evals.filter((e) => e.status === "new").length;
  return { evaluated: evals.length, kept, filtered: evals.length - kept };
}

export interface ScoutOptions {
  rescoreOnly?: boolean;
  sources: Source[];
}

export async function runScout({ rescoreOnly, sources }: ScoutOptions) {
  const cfg = loadConfig();
  const runId = await startRun();
  let fetched = 0;
  let inserted = 0;
  try {
    if (!rescoreOnly) {
      const all: Job[] = [];
      for (const source of sources) {
        try {
          const found = await source.fetchJobs(cfg);
          log.info(`${source.name}: ${found.length} raw postings`);
          all.push(...found);
        } catch (e) {
          // One broken source should not sink the run.
          log.error(`${source.name} failed: ${(e as Error).message}`);
        }
      }
      fetched = all.length;
      const unique = dedupeBatch(all.map(normalizeJob)).map((j) => ({ ...j, fingerprint: fingerprint(j) }));
      const up = await upsertJobs(unique);
      inserted = up.inserted;
      log.info(`dedupe: ${unique.length} unique, ${up.inserted} new, ${up.known} seen before, ${up.duplicates} cross-listed`);
    }
    const ev = await evaluateAll(cfg);
    log.info(`filters: ${ev.kept} kept, ${ev.filtered} filtered out (of ${ev.evaluated} open jobs)`);
    await finishRun(runId, { status: "ok", fetched, inserted, message: `${inserted} new, ${ev.kept} open` });
    return { fetched, inserted, ...ev };
  } catch (e) {
    await finishRun(runId, { status: "error", fetched, inserted, message: (e as Error).message });
    throw e;
  }
}
