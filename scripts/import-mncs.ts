/**
 *   npm run import-mncs -- <results.json> [checked-at ISO date]
 * Loads an MNC careers-page probe (array of { company, careersUrl, status, note, roles[] })
 * into the database, replacing the previous one. The admin sees it under MNCs.
 */
import "dotenv/config";
import fs from "node:fs";
import { importMnc } from "@/lib/mnc";

const [file, checkedAt] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) {
  console.error("Usage: npm run import-mncs -- <results.json> [checked-at ISO date]");
  process.exit(1);
}

const r = await importMnc(JSON.parse(fs.readFileSync(file, "utf8")), checkedAt ? new Date(checkedAt).toISOString() : undefined);
console.log(`Imported ${r.roles} roles from ${r.companies} companies.`);
process.exit(0);
