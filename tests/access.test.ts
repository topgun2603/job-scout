import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { accessState, formatLeft, grant, PLANS } from "@/lib/access";
import { scoreJob } from "@/lib/pipeline/score";
import { detectSkills, inspectPdf, profileFor } from "@/lib/resume";
import { hashPassword, verifyPassword } from "@/lib/users";
import { cfg, job, NOW } from "./helpers";

const T = NOW.getTime();
const H = 3_600_000;
const at = (ms: number) => new Date(T + ms).toISOString();

describe("access plans", () => {
  it("nothing granted means no access and a locked resume", () => {
    expect(accessState({}, T)).toMatchObject({ active: false, resumeUnlocked: false, msLeft: 0 });
  });

  it("a 1-hour pass gives jobs but keeps the resume half-blurred", () => {
    const s = accessState(grant({}, "1h", T), T);
    expect(s).toMatchObject({ active: true, plan: "1h", resumeUnlocked: false, msLeft: H });
  });

  it.each(["1d", "7d", "15d", "1m"] as const)("a %s pass unlocks the resume", (plan) => {
    const g = grant({}, plan, T);
    expect(g.expiresAt).toBe(at(PLANS[plan].ms));
    expect(accessState(g, T).resumeUnlocked).toBe(true);
  });

  it("expires exactly at the end", () => {
    const g = grant({}, "1d", T);
    expect(accessState(g, T + 24 * H - 1).active).toBe(true);
    expect(accessState(g, T + 24 * H).active).toBe(false);
    expect(accessState(g, T + 24 * H).resumeUnlocked).toBe(false);
  });

  it("a short top-up never cuts a longer pass short or re-locks the resume", () => {
    const long = grant({}, "15d", T);
    const topped = grant(long, "1h", T + H);
    expect(topped).toEqual(long);
  });

  it("upgrading a 1-hour pass to 1 day unlocks immediately", () => {
    const g = grant(grant({}, "1h", T), "1d", T + 10 * 60_000);
    expect(g.plan).toBe("1d");
    expect(accessState(g, T + 10 * 60_000).resumeUnlocked).toBe(true);
  });

  it("a new grant after expiry starts fresh from now", () => {
    const old = grant({}, "7d", T);
    const later = T + 30 * 24 * H;
    expect(grant(old, "1h", later)).toEqual({ plan: "1h", expiresAt: new Date(later + H).toISOString() });
  });

  it("the 1-hour pass is a browse-only preview; 1 day and up are full passes", () => {
    expect(accessState(grant({}, "1h", T), T).full).toBe(false);
    for (const p of ["1d", "7d", "15d", "1m"] as const) expect(accessState(grant({}, p, T), T).full).toBe(true);
  });

  it("only the 1-month pass includes 3 resumes", () => {
    expect(accessState(grant({}, "1m", T), T).resumeLimit).toBe(3);
    for (const p of ["1h", "1d", "7d", "15d"] as const) expect(accessState(grant({}, p, T), T).resumeLimit).toBe(1);
    expect(accessState({}, T).resumeLimit).toBe(1); // no pass: still a preview of resume #1
  });

  it("a 1-month pass stays at 3 resumes when topped up with a shorter pass", () => {
    const g = grant(grant({}, "1m", T), "7d", T + H);
    expect(accessState(g, T + H).resumeLimit).toBe(3);
  });

  it("formats time left", () => {
    expect(formatLeft(0)).toBe("expired");
    expect(formatLeft(25 * 60_000)).toBe("25m left");
    expect(formatLeft(5 * H + 5 * 60_000)).toBe("5h 5m left");
    expect(formatLeft(3 * 24 * H + 2 * H)).toBe("3d 2h left");
  });
});

describe("passwords", () => {
  it("round-trips and rejects wrong passwords", () => {
    const h = hashPassword("s3cret-pass");
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(verifyPassword("s3cret-pass", h)).toBe(true);
    expect(verifyPassword("s3cret-Pass", h)).toBe(false);
    expect(hashPassword("s3cret-pass")).not.toBe(h); // salted
  });

  it("rejects malformed hashes", () => {
    expect(verifyPassword("x", "plain-text")).toBe(false);
  });
});

describe("per-applicant scoring", () => {
  const vueDev = { coreSkills: ["Vue", "JavaScript"], bonusSkills: ["Tailwind"], locations: ["Kochi"], graduationYear: 2024 };

  it("scores against the applicant's own skills, cities and batch", () => {
    const p = profileFor(cfg.profile, vueDev);
    const s = scoreJob(job({ skills: ["Vue.js", "JavaScript", "Tailwind CSS"], location: ["Kochi"], batch: "2024" }), p, NOW);
    expect(s.matchedSkills).toEqual(["Vue", "JavaScript", "Tailwind"]); // alias vue.js from the catalogue
    expect(s.reasons).toContain("+10 location: Kochi");
    expect(s.reasons.some((r) => r.startsWith("-30"))).toBe(false);
  });

  it("falls back to the shared profile when the applicant has no skills yet", () => {
    const p = profileFor(cfg.profile, { coreSkills: [], bonusSkills: [], locations: [] });
    expect(p.skills).toEqual(cfg.profile.skills);
    expect(p.locations.preferred).toEqual(cfg.profile.locations.preferred);
  });
});

describe("resume files", () => {
  it("rejects non-PDF uploads", () => {
    expect(() => inspectPdf(Buffer.from("PK\u0003\u0004 not a pdf"))).toThrow(/Only PDF/);
  });

  it("reads the sample resume and detects its skills", () => {
    const file = "data/fixtures/sample-resume.pdf";
    if (!fs.existsSync(file)) return; // fixture is generated locally
    const { pages, text } = inspectPdf(fs.readFileSync(file));
    expect(pages).toBe(1);
    const d = detectSkills(text, cfg.profile);
    expect(d.core).toEqual(expect.arrayContaining(["React", "JavaScript", "HTML", "CSS", "Git", "REST"]));
    expect(d.bonus).toEqual(expect.arrayContaining(["TypeScript", "Redux", "Next.js", "Tailwind", "Node.js", "Firebase", "Jest"]));
  });
});
