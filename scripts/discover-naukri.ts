/**
 * Spec step 2: open one Naukri fresher React search in a headed browser,
 * log the JSON responses, and point out which one carries the job list.
 * No login, a single page load, nothing is clicked.
 *
 *   npm run discover:naukri
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const url = process.argv[2] ?? "https://www.naukri.com/react-developer-jobs?experience=0";
const outDir = path.resolve("data/discovery");
fs.mkdirSync(outDir, { recursive: true });

type Hit = { url: string; status: number; bytes: number; keys: string[]; jobArray?: string; sample?: unknown };

/** Find an array of objects that look like job postings, return its path. */
function findJobArray(obj: unknown, p = "$", depth = 0): { path: string; sample: unknown; length: number } | undefined {
  if (depth > 4 || obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    const first = obj[0];
    if (first && typeof first === "object") {
      const k = Object.keys(first).join(" ").toLowerCase();
      if (/title/.test(k) && /(company|jobid)/.test(k)) return { path: p, sample: first, length: obj.length };
    }
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const r = findJobArray(v, `${p}.${k}`, depth + 1);
    if (r) return r;
  }
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ locale: "en-IN", viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const hits: Hit[] = [];

page.on("response", async (res) => {
  const ct = res.headers()["content-type"] ?? "";
  if (!ct.includes("json")) return;
  try {
    const body = await res.text();
    const json = JSON.parse(body);
    const found = findJobArray(json);
    const hit: Hit = {
      url: res.url(),
      status: res.status(),
      bytes: body.length,
      keys: json && typeof json === "object" ? Object.keys(json).slice(0, 12) : [],
    };
    if (found) {
      hit.jobArray = `${found.path} (${found.length} items)`;
      hit.sample = found.sample;
      fs.writeFileSync(path.join(outDir, "job-list-response.json"), JSON.stringify(json, null, 2));
    }
    hits.push(hit);
  } catch {
    /* non-JSON body or response already disposed */
  }
});

console.log(`Opening ${url}`);
const nav = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
console.log(`Document status: ${nav?.status()}`);
await page.waitForTimeout(12_000); // let the listing XHRs finish
fs.writeFileSync(path.join(outDir, "page.html"), await page.content());
await page.screenshot({ path: path.join(outDir, "page.png"), fullPage: false });
console.log(`Page title: ${await page.title()}`);
await browser.close();

console.log(`\n${hits.length} JSON responses:`);
for (const h of hits) {
  console.log(`${h.jobArray ? ">>" : "  "} [${h.status}] ${h.bytes}B ${h.url.slice(0, 160)}`);
  console.log(`     keys: ${h.keys.join(", ")}`);
  if (h.jobArray) console.log(`     JOB LIST at ${h.jobArray}`);
}
const jobHit = hits.find((h) => h.jobArray);
if (jobHit) {
  console.log("\nSample job object:");
  console.log(JSON.stringify(jobHit.sample, null, 2).slice(0, 4000));
} else {
  console.log("\nNo JSON response looked like a job list. Check data/discovery/page.html for DOM fallback.");
}
fs.writeFileSync(path.join(outDir, "responses.json"), JSON.stringify(hits, null, 2));
