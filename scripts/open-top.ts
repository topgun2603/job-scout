/**
 *   npm run open-top -- 10    open the top N new (unflagged, Maybe or better) apply links
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { loadConfig } from "@/lib/config";
import { topNewJobs } from "@/lib/db";

const n = Math.max(1, Math.min(25, Number(process.argv[2] ?? 10) || 10));
const jobs = await topNewJobs(n, loadConfig().profile.thresholds.maybe);

function openUrl(url: string) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]] // cmd's `start` mangles "&" in URLs
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd, args as string[], { detached: true, stdio: "ignore" }).unref();
}

if (!jobs.length) console.log("Nothing new above the Maybe threshold. Run `npm run scout` first.");
for (const j of jobs) {
  console.log(`${String(j.score).padStart(3)}  ${j.title} @ ${j.company}`);
  openUrl(j.url);
  await new Promise((r) => setTimeout(r, 400));
}
process.exit(0);
