/**
 *   npm run scout                            fetch from every source, dedupe, filter, score
 *   npm run scout -- --only=greenhouse,lever run just these sources
 *   npm run scout -- --rescore               re-apply filters and scoring to stored jobs only (no network)
 */
import "dotenv/config";
import { runScout } from "@/lib/pipeline/run";
import { sources } from "@/lib/sources";
import { log } from "@/lib/log";

const rescoreOnly = process.argv.includes("--rescore");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").map((s) => s.trim());
const selected = only ? sources.filter((s) => only.includes(s.name)) : sources;

if (only && selected.length !== only.length) {
  log.error(`Unknown source in --only. Available: ${sources.map((s) => s.name).join(", ")}`);
  process.exit(1);
}

try {
  const r = await runScout({ rescoreOnly, sources: selected });
  log.info(`done: ${r.inserted} new jobs, ${r.kept} on the shortlist. Open the dashboard: npm run dev`);
} catch (e) {
  log.error((e as Error).stack ?? String(e));
  process.exitCode = 1;
}
// Firestore keeps its connection open; end the process once the run is done.
process.exit(process.exitCode ?? 0);
