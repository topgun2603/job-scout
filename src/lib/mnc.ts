import { z } from "zod";
import { MNC_PREVIEW, type AccessState } from "./access";
import { col, inBatches } from "./firebase";

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
export async function importMnc(data: unknown, checkedAt = new Date().toISOString()): Promise<{ companies: number; roles: number }> {
  const companies = fileSchema.parse(data);
  // Ids are assigned here (the probe is replaced wholesale), so no counter is needed.
  let roleId = 0;
  const companyDocs = companies.map((c, i) => ({
    id: i + 1,
    name: c.company,
    careersUrl: c.careersUrl ?? null,
    status: c.status,
    note: c.note ?? null,
    checkedAt,
    roles: c.roles.length,
  }));
  const roleDocs = companies.flatMap((c) =>
    c.roles.map((r) => ({
      id: ++roleId,
      company: c.company,
      title: r.title,
      location: r.location ?? null,
      experience: r.experience ?? null,
      posted: r.posted ?? null,
      url: r.url ?? null,
      fit: r.fit,
      why: r.why ?? null,
    })),
  );

  const [oldCompanies, oldRoles] = await Promise.all([col("mnc_companies").get(), col("mnc_roles").get()]);
  await inBatches([...oldCompanies.docs, ...oldRoles.docs], (b, d) => b.delete(d.ref));
  await inBatches(companyDocs, (b, c) => b.set(col("mnc_companies").doc(String(c.id)), c));
  await inBatches(roleDocs, (b, r) => b.set(col("mnc_roles").doc(String(r.id)), r));
  return { companies: companies.length, roles: roleDocs.length };
}

// ---- read ----

type Doc = Record<string, unknown>;
const opt = <T>(v: unknown) => (v === null || v === undefined ? undefined : (v as T));

export async function listMncCompanies(): Promise<MncCompany[]> {
  return (await col("mnc_companies").get()).docs
    .map((s) => s.data() as Doc)
    .map((d) => ({
      id: d.id as number,
      name: d.name as string,
      careersUrl: opt<string>(d.careersUrl),
      status: d.status as MncStatus,
      note: opt<string>(d.note),
      checkedAt: d.checkedAt as string,
      roles: d.roles as number,
    }))
    .sort((a, b) => b.roles - a.roles || a.name.localeCompare(b.name));
}

/** Best fit first; ties keep the order the probe reported them in. */
export async function listMncRoles(): Promise<MncRole[]> {
  return (await col("mnc_roles").get()).docs
    .map((s) => s.data() as Doc)
    .map((d) => ({
      id: d.id as number,
      company: d.company as string,
      title: d.title as string,
      location: opt<string>(d.location),
      experience: opt<string>(d.experience),
      posted: opt<string>(d.posted),
      url: opt<string>(d.url),
      fit: d.fit as number,
      why: opt<string>(d.why),
    }))
    .sort((a, b) => b.fit - a.fit || a.id - b.id);
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
