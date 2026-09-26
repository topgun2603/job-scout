import { describe, expect, it } from "vitest";
import { applyFilters, dropReason, isFlagged, scamFlags } from "@/lib/pipeline/filters";
import { normalizeJob } from "@/lib/pipeline/normalize";
import { cfg, job, NOW } from "./helpers";

const drop = (overrides: Parameters<typeof job>[0]) => dropReason(job(overrides), cfg.profile, NOW);

describe("seniority filter", () => {
  it.each([
    "Senior React Developer",
    "Sr. Frontend Engineer",
    "Sr Frontend Engineer",
    "Frontend Lead",
    "Engineering Manager - Web",
    "Solution Architect – Java Full Stack (React/Angular)",
    "Associate Principal Engineer, Frontend React",
    "Staff Frontend Engineer",
  ])("drops %s", (title) => {
    expect(drop({ title })).toMatch(/senior title/);
  });

  it.each([
    "React Developer",
    "Junior React Developer",
    "Associate Software Engineer (Frontend)",
    "React, MEAN/MERN & Node.js Developers - Freshers(Chennai)",
    "Leadership Trainee - Frontend", // "lead" must be a whole word
  ])("keeps %s", (title) => {
    expect(drop({ title })).toBeUndefined();
  });

  it("drops 3+ years in the title", () => {
    expect(drop({ title: "React Developer 3+ years" })).toMatch(/3\+/);
  });

  it("drops minimum experience of 2+ years", () => {
    expect(drop({ expMin: 2, expMax: 5 })).toBe("needs 2+ yrs");
    expect(drop({ expMin: 4, expMax: 6 })).toBe("needs 4+ yrs");
  });

  it("keeps a 2-year minimum when freshers can apply", () => {
    expect(drop({ expMin: 2, expMax: 3, description: "Freshers can also apply if strong in React." })).toBeUndefined();
  });

  it("keeps 0-1 and 1-3 year postings", () => {
    expect(drop({ expMin: 0, expMax: 1 })).toBeUndefined();
    expect(drop({ expMin: 1, expMax: 3 })).toBeUndefined();
  });

  it("drops 1-5 but keeps 0-5 (a zero minimum explicitly accepts freshers)", () => {
    expect(drop({ expMin: 1, expMax: 5 })).toMatch(/up to 5/);
    expect(drop({ expMin: 0, expMax: 5 })).toBeUndefined();
  });

  it("drops sales / BPO roles even when they mention React", () => {
    expect(drop({ title: "Inside Sales Executive" })).toMatch(/not a dev role/);
    expect(drop({ title: "Telecaller (React team)" })).toMatch(/not a dev role/);
  });

  it("drops backend-only and testing-only titles", () => {
    expect(drop({ title: "Java Backend Developer" })).toMatch(/off-track/);
    expect(drop({ title: "Manual Testing Fresher" })).toMatch(/off-track/);
    expect(drop({ title: "Python Developer" })).toMatch(/off-track/);
  });

  it("keeps mixed titles that carry a frontend signal", () => {
    expect(drop({ title: "Full Stack Developer (Java + React)" })).toBeUndefined();
    expect(drop({ title: "JavaScript Developer" })).toBeUndefined(); // "java" must not match "javascript"
  });

  it("drops other-framework roles unless React is also named", () => {
    expect(drop({ title: "Jr. Frontend Developer (Angular)" })).toBe("angular role, not React");
    expect(drop({ title: "Vue.js Developer" })).toMatch(/not React/);
    expect(drop({ title: "Frontend Developer (React / Angular)" })).toBeUndefined();
  });

  it("drops postings that never mention React or frontend work", () => {
    expect(drop({ title: "Associate Software Engineer", skills: ["C++", "SQL"], description: "Embedded systems." })).toBe(
      "no React / frontend mention",
    );
    expect(drop({ title: "Associate Software Engineer", skills: ["ReactJS", "SQL"] })).toBeUndefined();
  });

  it("drops non-dev 'junior' roles and mid-level titles", () => {
    expect(drop({ title: "Fresher / Experienced Junior Accounts" })).toMatch(/not a dev role/);
    expect(drop({ title: "Walk-in || Junior Human Resources Executive" })).toMatch(/not a dev role/);
    expect(drop({ title: "Full Stack Developer (Mid-Level)" })).toMatch(/senior title/);
  });

  it("drops internships while the toggle is off", () => {
    expect(drop({ title: "Intern React Developer" })).toMatch(/internship/);
  });

  it("drops unpaid internships even with the toggle on", () => {
    const profile = { ...cfg.profile, includeInternships: true };
    expect(dropReason(job({ title: "React Internship", salary: "Unpaid" }), profile, NOW)).toBe("unpaid internship");
    expect(dropReason(job({ title: "React Internship", salary: "10,000/month" }), profile, NOW)).toBeUndefined();
  });

  it("drops stale postings", () => {
    expect(drop({ postedAt: "2026-08-01T00:00:00Z" })).toMatch(/stale/);
  });
});

describe("scam filter", () => {
  const flags = (overrides: Parameters<typeof job>[0]) => scamFlags(job(overrides), cfg.profile, cfg.scam);

  it.each([
    "A refundable registration fee of Rs 2000 is required.",
    "Training fee applicable, 100% job guarantee after course.",
    "Candidates must pay a security deposit of 15000.",
    "Certification fee will be deducted from first salary.",
  ])("flags fee language: %s", (description) => {
    const f = flags({ description });
    expect(f.length).toBeGreaterThan(0);
    expect(f[0]).toMatch(/^possible-scam: mentions/);
  });

  it("flags personal WhatsApp contact with no company website", () => {
    expect(flags({ description: "Interested candidates WhatsApp your CV to 98765 43210" })).toContainEqual(
      expect.stringMatching(/personal WhatsApp/),
    );
  });

  it("flags a gmail address even after contact redaction", () => {
    const j = normalizeJob(job({ description: "Send resume to hr.jobs2026@gmail.com" }));
    expect(j.description).not.toContain("hr.jobs2026");
    expect(scamFlags(j, cfg.profile, cfg.scam)).toContainEqual(expect.stringMatching(/personal email/));
  });

  it("does not flag personal contact when a company website is given", () => {
    expect(flags({ description: "Apply at https://careers.acme.io or WhatsApp us" })).toEqual([]);
  });

  it("flags an unrealistic salary combined with a vague role", () => {
    expect(flags({ salary: "18-25 Lacs PA", skills: [], description: "Earn up to 25 LPA. Freshers!" })).toContainEqual(
      expect.stringMatching(/25 LPA/),
    );
  });

  it("does not flag a high salary for a detailed role", () => {
    expect(
      flags({ salary: "15-18 Lacs PA", skills: ["React", "TypeScript", "Redux"], description: "Build our design system in React." }),
    ).toEqual([]);
  });

  it("leaves genuine postings alone", () => {
    expect(flags({ description: "Build UI components in React and TypeScript. Good knowledge of REST APIs." })).toEqual([]);
  });

  it("flags but never drops", () => {
    const out = applyFilters(job({ description: "Registration fee Rs 999" }), cfg, NOW);
    expect(out.drop).toBeUndefined();
    expect(isFlagged(out.flags)).toBe(true);
  });
});
