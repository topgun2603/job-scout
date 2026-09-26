import { describe, expect, it } from "vitest";
import { MNC_PREVIEW } from "@/lib/access";
import { gateMncRoles, type MncRole } from "@/lib/mnc";

const roles: MncRole[] = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  company: `Co ${i}`,
  title: `Engineer ${i}`,
  location: "Chennai",
  url: `https://example.com/${i}`,
  fit: 5 - Math.floor(i / 2),
}));

describe("MNC gating", () => {
  it("a full pass sees every role with its link, but not the admin's note", () => {
    const out = gateMncRoles(roles.map((r) => ({ ...r, why: "matches his stack" })), { full: true }) as MncRole[];
    expect(out).toEqual(roles);
    expect(out.every((r) => !("why" in r))).toBe(true);
  });

  it("the 1-hour preview shows the top roles without links", () => {
    const out = gateMncRoles(roles, { full: false });
    const open = out.slice(0, MNC_PREVIEW) as MncRole[];
    expect(open.map((r) => r.title)).toEqual(roles.slice(0, MNC_PREVIEW).map((r) => r.title));
    expect(open.every((r) => r.url === undefined)).toBe(true);
  });

  it("every other role leaves the server as a bare placeholder", () => {
    const rest = gateMncRoles(roles, { full: false }).slice(MNC_PREVIEW);
    expect(rest).toHaveLength(roles.length - MNC_PREVIEW);
    for (const r of rest) expect(Object.keys(r).sort()).toEqual(["fit", "id", "locked"]);
  });
});
