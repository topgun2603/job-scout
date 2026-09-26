import { describe, expect, it } from "vitest";
import { extractBatch, normalizeJob } from "@/lib/pipeline/normalize";
import { daysSincePosted, scoreJob } from "@/lib/pipeline/score";
import { cfg, job, NOW } from "./helpers";

const score = (overrides: Parameters<typeof job>[0]) => scoreJob(job(overrides), cfg.profile, NOW);
const reason = (r: string[], prefix: string) => r.find((x) => x.includes(prefix));

describe("scoring", () => {
  it("gives an ideal fresher React posting a strong score", () => {
    const s = score({
      title: "Junior React Developer",
      skills: ["React.js", "JavaScript", "HTML5", "CSS3", "Git", "REST API", "TypeScript", "Redux", "Tailwind CSS"],
    });
    // title 25 + core 25 + bonus 6 + exp 15 + location 10 + fresh 15
    expect(s.score).toBe(96);
    expect(s.matchedSkills).toEqual(["React", "JavaScript", "HTML", "CSS", "Git", "REST", "TypeScript", "Redux", "Tailwind"]);
    expect(reason(s.reasons, "title")).toBe("+25 title: react + junior");
  });

  it("caps core skills at 25 and bonus at 10", () => {
    const s = score({
      skills: ["React", "JavaScript", "HTML", "CSS", "Git", "REST", "TypeScript", "Redux", "Next.js", "Node.js", "Jest", "Firebase"],
    });
    expect(reason(s.reasons, "skills")).toMatch(/^\+25 /);
    expect(reason(s.reasons, "bonus")).toMatch(/^\+10 /);
  });

  it("matches skills as whole words", () => {
    const s = score({ title: "Web Developer", skills: ["GitHub Actions"], description: "Knowledge of Java" });
    expect(s.matchedSkills).toEqual(["Git"]); // github is an alias for Git; "java" is not JavaScript
  });

  it("gives partial title credit for generic dev titles", () => {
    expect(reason(score({ title: "MERN Stack Developer" }).reasons, "title")).toBe("+8 title: mern");
    expect(reason(score({ title: "Associate Software Engineer" }).reasons, "title")).toBe("+18 title: software engineer + associate");
  });

  it("scores experience fit", () => {
    expect(reason(score({ expMin: 0 }).reasons, "exp")).toBe("+15 exp: 0 yrs min");
    expect(reason(score({ expMin: 1 }).reasons, "exp")).toBe("+10 exp: 1 yr min");
    expect(reason(score({ expMin: 2, description: "Freshers can apply" }).reasons, "exp")).toBe("+10 exp: freshers can apply");
    expect(reason(score({ expMin: 2 }).reasons, "exp")).toBeUndefined();
  });

  it("scores location fit, including city aliases and remote", () => {
    expect(reason(score({ location: ["Bangalore"] }).reasons, "location")).toBe("+10 location: Bengaluru");
    expect(reason(score({ location: ["Chennai (Pallikaranai)"] }).reasons, "location")).toBe("+10 location: Chennai");
    expect(reason(score({ location: ["Remote"], remote: true }).reasons, "location")).toBe("+10 location: remote India");
    expect(reason(score({ location: ["Jaipur"] }).reasons, "location")).toBe("+4 location: Jaipur");
    expect(reason(score({ location: ["Austin, TX"], country: undefined }).reasons, "location")).toBeUndefined();
  });

  it("scores freshness", () => {
    const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
    expect(reason(score({ postedAt: at(0) }).reasons, "fresh")).toBe("+15 fresh: posted today");
    expect(reason(score({ postedAt: at(2) }).reasons, "fresh")).toBe("+10 fresh: 2d old");
    expect(reason(score({ postedAt: at(5) }).reasons, "fresh")).toBe("+5 fresh: 5d old");
    expect(reason(score({ postedAt: at(9) }).reasons, "fresh")).toBeUndefined();
    expect(daysSincePosted(undefined, NOW)).toBeUndefined();
  });

  it("penalises batches that exclude the graduation year", () => {
    const miss = score({ batch: "2023, 2024" });
    expect(reason(miss.reasons, "batch")).toBe("-30 batch: 2023, 2024 only (you: 2025)");
    expect(reason(score({ batch: "2025, 2026" }).reasons, "batch")).toBeUndefined();
    expect(miss.score).toBe(score({}).score - 30);
  });

  it("never goes below 0 or above 100", () => {
    const s = score({ title: "Operations", skills: [], location: ["Austin"], country: undefined, expMin: 3, postedAt: undefined, batch: "2019" });
    expect(s.score).toBe(0);
  });
});

describe("batch extraction", () => {
  it.each([
    ["Only 2024 & 2025 pass-outs are eligible", "2024, 2025"],
    ["Batch: 2023-2025", "2023, 2024, 2025"],
    ["Year of passing 2026", "2026"],
    ["Graduates of 2025 or 2026 batch", "2025, 2026"],
    ["Company founded in 2012, great culture", undefined],
  ])("%s -> %s", (text, expected) => {
    expect(extractBatch(text)).toBe(expected);
  });

  it("is filled in by normalize", () => {
    expect(normalizeJob(job({ description: "<p>Open to <b>2025 batch</b> freshers</p>" })).batch).toBe("2025");
  });
});
