import { z } from "zod";
import { MNC_PREVIEW, type AccessState } from "./access";
import { getDb } from "./db";

// Results of probing the MNCs' own careers pages (see scripts/import-mncs.ts).

export type MncStatus = "ok" | "no-match" | "blocked" | "error";

export interface MncCompany {
  id: number;
  name: string;
  careersUrl?: string;
  status: MncStatus;
  note?: string;
  checkedAt: string;
  roles: number;
}

export interface MncRole {
  id: number;
  company: string;
  title: string;
  location?: string;
  experience?: string;
  posted?: string;
  url?: string;
  fit: number;
  why?: string;
}

/** A role beyond the preview allowance: only its rank and fit leave the server. */
export interface LockedMncRole {
  id: number;
  locked: true;
  fit: number;
}

export type MncItem = MncRole | LockedMncRole;

// ---- import ----

const str = z.string().trim().optional().nullable().transform((v) => v || undefined);
const fileSchema = z.array(
  z.object({
    company: z.string().trim().min(1),
    careersUrl: str,
    status: z.enum(["ok", "no-match", "blocked", "error"]),
    note: str,
    roles: z
      .array(
        z.object({
          title: z.string().trim().min(1),
          location: str,
          experience: str,
          posted: str,
          url: str,
          fit: z.coerce.number().int().min(1).max(5),
          why: str,
        }),
      )
      .default([]),
  }),
);

export type MncFile = z.input<typeof fileSchema>;

/** Replaces the stored probe with this one. Throws on a malformed file. */
export function importMnc(data: unknown, checkedAt = new Date().toISOString()): { companies: number; roles: number } {
  const companies = fileSchema.parse(data);
  const d = getDb();
  const addCompany = d.prepare(
    "INSERT INTO mnc_companies (name, careers_url, status, note, checked_at) VALUES (?, ?, ?, ?, ?)",
  );
  const addRole = d.prepare(
    `INSERT INTO mnc_roles (company_id, title, location, experience, posted, url, fit, why)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let roles = 0;
  d.transaction(() => {
    d.exec("DELETE FROM mnc_roles; DELETE FROM mnc_companies;");
    for (const c of companies) {
      const id = addCompany.run(c.company, c.careersUrl ?? null, c.status, c.note ?? null, checkedAt).lastInsertRowid;
      for (const r of c.roles) {
        addRole.run(id, r.title, r.location ?? null, r.experience ?? null, r.posted ?? null, r.url ?? null, r.fit, r.why ?? null);
        roles++;
      }
    }
  })();
  return { companies: companies.length, roles };
}

// ---- read ----

type Raw = Record<string, unknown>;
const opt = <T>(v: unknown) => (v === null || v === undefined ? undefined : (v as T));

export function listMncCompanies(): MncCompany[] {
  const rows = getDb()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM mnc_roles r WHERE r.company_id = c.id) AS roles
       FROM mnc_companies c ORDER BY roles DESC, c.name`,
    )
    .all() as Raw[];
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    careersUrl: opt(r.careers_url),
    status: r.status as MncStatus,
    note: opt(r.note),
    checkedAt: r.checked_at as string,
    roles: r.roles as number,
  }));
}

/** Best fit first; ties keep the order the probe reported them in. */
export function listMncRoles(): MncRole[] {
  const rows = getDb()
    .prepare(
      `SELECT r.*, c.name AS company FROM mnc_roles r JOIN mnc_companies c ON c.id = r.company_id
       ORDER BY r.fit DESC, r.id`,
    )
    .all() as Raw[];
  return rows.map((r) => ({
    id: r.id as number,
    company: r.company as string,
    title: r.title as string,
    location: opt(r.location),
    experience: opt(r.experience),
    posted: opt(r.posted),
    url: opt(r.url),
    fit: r.fit as number,
    why: opt(r.why),
  }));
}

/**
 * What an applicant's pass reveals. `why` is the admin's note on the resume the probe was matched
 * against, so applicants never get it. A full pass sees every role with its link. The 1-hour preview
 * sees the top MNC_PREVIEW roles without links, i.e. nothing that says where the job was found, and
 * every other role is reduced to a placeholder here, so the blur on the page cannot be undone.
 */
export function gateMncRoles(roles: MncRole[], access: Pick<AccessState, "full">): MncItem[] {
  const shared = roles.map(({ why: _why, ...r }) => r);
  if (access.full) return shared;
  return shared.map((r, i) => (i < MNC_PREVIEW ? { ...r, url: undefined } : { id: r.id, locked: true, fit: r.fit }));
}
