import fs from "node:fs";
import * as mupdf from "mupdf";
import sharp from "sharp";
import type { Profile } from "./config";
import { hasTerm } from "./pipeline/text";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const SCALE = 1.6;
const BLUR_SIGMA = 24;

export type BlurMode = "none" | "bottom" | "full";

function open(bytes: Buffer) {
  return mupdf.Document.openDocument(bytes, "application/pdf");
}

/** Validates an upload and returns its page count and text, or throws a user-facing message. */
export function inspectPdf(bytes: Buffer): { pages: number; text: string } {
  if (bytes.length > MAX_RESUME_BYTES) throw new Error("Resume must be 5 MB or smaller.");
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("Only PDF resumes are supported.");
  let doc: mupdf.Document;
  try {
    doc = open(bytes);
  } catch {
    throw new Error("That PDF could not be read.");
  }
  const pages = doc.countPages();
  if (pages < 1) throw new Error("That PDF has no pages.");
  let text = "";
  for (let i = 0; i < Math.min(pages, 5); i++) text += doc.loadPage(i).toStructuredText("preserve-whitespace").asText() + "\n";
  return { pages, text };
}

export function resumeText(file: string): string {
  return inspectPdf(fs.readFileSync(file)).text;
}

// Small cache: rendering is the slow part and previews are requested repeatedly.
const cache = new Map<string, Buffer>();
const CACHE_MAX = 40;

/**
 * Renders one page to PNG. Blurring happens here, on the server, so a locked viewer never
 * receives the readable pixels (or the PDF) at all.
 */
export async function renderPage(file: string, index: number, blur: BlurMode): Promise<Buffer> {
  const key = `${file}|${index}|${blur}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const doc = open(fs.readFileSync(file));
  if (index < 0 || index >= doc.countPages()) throw new RangeError("page out of range");
  const pix = doc.loadPage(index).toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = Buffer.from(pix.asPNG());

  let out = png;
  if (blur === "full") {
    out = await sharp(png).blur(BLUR_SIGMA).png().toBuffer();
  } else if (blur === "bottom") {
    const { width = 0, height = 0 } = await sharp(png).metadata();
    const half = Math.floor(height / 2);
    const bottom = await sharp(png).extract({ left: 0, top: half, width, height: height - half }).blur(BLUR_SIGMA).toBuffer();
    out = await sharp(png).composite([{ input: bottom, top: half, left: 0 }]).png().toBuffer();
  }

  cache.set(key, out);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return out;
}

export function forgetRenders(file: string) {
  for (const k of cache.keys()) if (k.startsWith(`${file}|`)) cache.delete(k);
}

// ---------- skills ----------

/** Beyond the profile's core + bonus skills, so non-React stacks are recognised too. */
const EXTRA_SKILLS: { name: string; aliases?: string[] }[] = [
  { name: "Angular", aliases: ["angularjs"] },
  { name: "Vue", aliases: ["vue.js", "vuejs"] },
  { name: "Svelte" },
  { name: "React Native" },
  { name: "Bootstrap" },
  { name: "jQuery" },
  { name: "Material UI", aliases: ["mui"] },
  { name: "GraphQL" },
  { name: "MongoDB", aliases: ["mongo"] },
  { name: "SQL", aliases: ["mysql", "postgresql", "postgres"] },
  { name: "Python" },
  { name: "Java" },
  { name: "Spring Boot" },
  { name: "C++" },
  { name: "Django" },
  { name: "Flask" },
  { name: "AWS" },
  { name: "Docker" },
  { name: "Figma" },
  { name: "Vite" },
  { name: "Webpack" },
  { name: "Cypress" },
  { name: "Playwright" },
  { name: "Flutter" },
];

export function skillCatalogue(profile: Profile) {
  return [...profile.skills.core, ...profile.skills.bonus, ...EXTRA_SKILLS.map((s) => ({ name: s.name, aliases: s.aliases ?? [] }))];
}

/** Skills named in the resume text, split into the profile's core list and everything else. */
export function detectSkills(text: string, profile: Profile): { core: string[]; bonus: string[] } {
  const found = skillCatalogue(profile).filter((s) =>
    [s.name, ...s.aliases].some((t) => (t === "C++" ? text.includes("C++") : hasTerm(text, t))),
  );
  const coreNames = new Set(profile.skills.core.map((s) => s.name));
  return {
    core: found.filter((s) => coreNames.has(s.name)).map((s) => s.name),
    bonus: found.filter((s) => !coreNames.has(s.name)).map((s) => s.name),
  };
}

/** The shared profile, re-pointed at one applicant's skills, cities and graduation year for scoring. */
export function profileFor(
  base: Profile,
  u: { coreSkills: string[]; bonusSkills: string[]; locations: string[]; graduationYear?: number },
): Profile {
  const catalogue = new Map(skillCatalogue(base).map((s) => [s.name.toLowerCase(), s]));
  const spec = (name: string) => catalogue.get(name.toLowerCase()) ?? { name, aliases: [] };
  return {
    ...base,
    graduation: { ...base.graduation, year: u.graduationYear ?? base.graduation.year },
    skills: {
      core: u.coreSkills.length ? u.coreSkills.map(spec) : base.skills.core,
      bonus: u.coreSkills.length || u.bonusSkills.length ? u.bonusSkills.map(spec) : base.skills.bonus,
    },
    locations: { ...base.locations, preferred: u.locations.length ? u.locations : base.locations.preferred },
  };
}
