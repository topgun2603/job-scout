import { describe, expect, it } from "vitest";
import { fromAdzuna } from "@/lib/sources/adzuna";
import { fromAshby } from "@/lib/sources/ashby";
import { entryLevelTitle, indiaEligible } from "@/lib/sources/common";
import { fromGreenhouse } from "@/lib/sources/greenhouse";
import { fromJooble } from "@/lib/sources/jooble";
import { fromLever } from "@/lib/sources/lever";
import { fromNaukriJson, relativeToIso, searchUrl } from "@/lib/sources/naukri";
import { fromSmartRecruiters } from "@/lib/sources/smartrecruiters";
import { dedupeBatch, fingerprint } from "@/lib/pipeline/dedupe";
import { normalizeJob } from "@/lib/pipeline/normalize";
import { cfg, job } from "./helpers";

describe("ATS title prefilter (spec 5.2)", () => {
  const ok = (t: string) => entryLevelTitle(t, cfg.profile);
  it.each([
    "Frontend Engineer",
    "Junior React Developer",
    "Associate Software Development Engineer (SDE)",
    "Software Engineer I",
    "SDE-1 (Frontend)",
    "Graduate Engineer Trainee - Web",
    "Software Engineer, New Grad",
  ])("keeps %s", (t) => expect(ok(t)).toBe(true));

  it.each([
    "Senior Frontend Engineer",
    "Staff Software Engineer",
    "Software Engineer II",
    "SDE 2",
    "Operations Associate, Sanctions", // entry word but not a tech role
    "Talent Acquisition Intern",
    "Backend Engineer", // no entry-level word, not frontend
  ])("drops %s", (t) => expect(ok(t)).toBe(false));
});

describe("India eligibility", () => {
  it.each([
    ["Bengaluru-VTP, India", true],
    ["Remote - India", true],
    ["Remote, APAC", true],
    ["Remote - US", false],
    ["San Francisco, CA", false],
    ["Chennai", true],
  ] as const)("%s -> %s", (loc, want) => expect(indiaEligible(loc)).toBe(want));

  it("trusts an explicit country code", () => {
    expect(indiaEligible("Remote", "IN")).toBe(true);
    expect(indiaEligible("Bengaluru", "US")).toBe(false);
  });
});

describe("source parsers", () => {
  it("greenhouse: decodes escaped HTML and keeps the apply link", () => {
    const j = fromGreenhouse(
      {
        id: 42,
        title: "Frontend Engineer",
        absolute_url: "https://boards.greenhouse.io/acme/jobs/42",
        location: { name: "Bengaluru, India" },
        content: "&lt;p&gt;Build React apps&lt;/p&gt;",
        first_published: "2026-09-20T10:00:00Z",
      },
      "acme",
      "Acme",
    );
    expect(j).toMatchObject({ source: "greenhouse", sourceId: "acme:42", company: "Acme", postedAt: "2026-09-20T10:00:00Z" });
    expect(normalizeJob(j).description).toBe("Build React apps");
  });

  it("lever: uses the direct /apply URL and country", () => {
    const j = fromLever(
      {
        id: "abc",
        text: "sde i - frontend",
        hostedUrl: "https://jobs.lever.co/acme/abc",
        applyUrl: "https://jobs.lever.co/acme/abc/apply",
        createdAt: Date.UTC(2026, 8, 25),
        country: "IN",
        categories: { location: "bengaluru" },
        descriptionPlain: "React and TypeScript",
      },
      "acme",
    );
    expect(j).toMatchObject({ title: "Sde I - Frontend", company: "Acme", country: "IN", url: "https://jobs.lever.co/acme/abc/apply" });
    expect(j.location).toEqual(["Bengaluru"]);
  });

  it("ashby: adds the country to the location", () => {
    const j = fromAshby(
      {
        id: "x",
        title: "Frontend Engineer",
        location: "Bengaluru",
        jobUrl: "https://jobs.ashbyhq.com/acme/x",
        applyUrl: "https://jobs.ashbyhq.com/acme/x/application",
        address: { postalAddress: { addressCountry: "India" } },
      },
      "acme",
    );
    expect(j.location).toEqual(["Bengaluru", "India"]);
    expect(j.url).toMatch(/application$/);
  });

  it("smartrecruiters: builds a posting URL when details are missing", () => {
    const j = fromSmartRecruiters(
      { id: "7", name: " Engineer, Frontend React ", location: { country: "in", fullLocation: "Pune, , India" } },
      "Acme1",
      "Acme",
    );
    expect(j).toMatchObject({ title: "Engineer, Frontend React", country: "IN", url: "https://jobs.smartrecruiters.com/Acme1/7" });
    expect(j.location).toEqual(["Pune, India"]);
  });

  it("adzuna: strips highlight tags and converts salary to lakhs", () => {
    const j = fromAdzuna({
      id: "9",
      title: "<strong>React</strong> Developer Fresher",
      redirect_url: "https://www.adzuna.in/land/ad/9",
      company: { display_name: "Acme" },
      location: { display_name: "Chennai, Tamil Nadu" },
      salary_min: 300000,
      salary_max: 450000,
    });
    expect(j).toMatchObject({ title: "React Developer Fresher", salary: "3-4.5 Lacs PA", location: ["Chennai, Tamil Nadu"] });
  });

  it("jooble: cleans the title", () => {
    const j = fromJooble({ id: 5, title: "<b>React</b>&nbsp;Developer", link: "https://jooble.org/desc/5", company: "Acme" });
    expect(j.title).toBe("React Developer");
  });

  it("naukri: maps the jobapi/v3 shape", () => {
    const j = fromNaukriJson({
      jobId: "123",
      title: "React Developer",
      companyName: "Tvm Infotech",
      placeholders: [
        { type: "experience", label: "0-1 Yrs" },
        { type: "salary", label: "Not disclosed" },
        { type: "location", label: "Chennai(Pallikaranai), Remote" },
      ],
      tagsAndSkills: "React,CSS, HTML",
      jdURL: "/job-listings-react-developer-123",
      createdDate: Date.UTC(2026, 8, 25),
      minimumExperience: "0",
      maximumExperience: "1",
    });
    expect(j).toMatchObject({
      sourceId: "123",
      expMin: 0,
      expMax: 1,
      salary: undefined,
      remote: true,
      skills: ["React", "CSS", "HTML"],
      url: "https://www.naukri.com/job-listings-react-developer-123",
    });
  });

  it("naukri: search URLs and relative dates", () => {
    expect(searchUrl("React Developer", "Chennai", 0, 7)).toBe("https://www.naukri.com/react-developer-jobs-in-chennai?experience=0&jobAge=7");
    const now = new Date("2026-09-26T10:00:00Z");
    expect(relativeToIso("3 Days Ago", now)).toBe("2026-09-23T10:00:00.000Z");
    expect(relativeToIso("Just Now", now)).toBe(now.toISOString());
  });
});

describe("cross-source dedupe", () => {
  it("treats the same role at the same company as one job, ignoring suffixes and punctuation", () => {
    const a = job({ source: "naukri", sourceId: "1", title: "React Developer - Fresher", company: "Acme Technologies Pvt. Ltd." });
    const b = job({ source: "lever", sourceId: "acme:x", title: "React Developer (Fresher)", company: "ACME" });
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(dedupeBatch([a, b])).toHaveLength(1);
  });
});
