// Access plans. Client-safe (no node imports) so the admin UI and the server share one definition.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** `resumes`: how many of the applicant's resume versions the pass shows. */
export const PLANS = {
  "1h": { label: "1 hour", short: "1h", ms: HOUR, resumes: 1 },
  "1d": { label: "1 day", short: "1d", ms: DAY, resumes: 1 },
  "7d": { label: "7 days", short: "7d", ms: 7 * DAY, resumes: 1 },
  "15d": { label: "15 days", short: "15d", ms: 15 * DAY, resumes: 1 },
  "1m": { label: "1 month", short: "1m", ms: 30 * DAY, resumes: 3 },
} as const;

/** MNC roles the 1-hour preview shows in full (the best-fit ones); the rest arrive as blurred placeholders. */
export const MNC_PREVIEW = 3;

/** Most resume versions an applicant can have on file. */
export const MAX_RESUMES = 3;

export type PlanId = keyof typeof PLANS;
export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/**
 * Plans at least this long are full passes: resume view + download, apply links, Applied / Skip.
 * Shorter passes (1 hour) are browse-only previews.
 */
export const RESUME_UNLOCK_MS = DAY;

export interface AccessRecord {
  plan?: PlanId;
  expiresAt?: string;
}

export interface AccessState {
  active: boolean;
  plan?: PlanId;
  expiresAt?: string;
  msLeft: number;
  /** Full pass: apply links, Applied / Skip, resume download. False on the 1-hour preview. */
  full: boolean;
  resumeUnlocked: boolean;
  /** Resume versions visible to the applicant (the first N on file). Expired passes keep a preview of #1. */
  resumeLimit: number;
}

export function accessState(rec: AccessRecord, now = Date.now()): AccessState {
  const exp = rec.expiresAt ? new Date(rec.expiresAt).getTime() : 0;
  const active = !!rec.plan && exp > now;
  const full = active && PLANS[rec.plan!].ms >= RESUME_UNLOCK_MS;
  return {
    active,
    plan: rec.plan,
    expiresAt: rec.expiresAt,
    msLeft: active ? exp - now : 0,
    full,
    resumeUnlocked: full,
    resumeLimit: active ? PLANS[rec.plan!].resumes : 1,
  };
}

/**
 * Granting while access is still running extends it: the new expiry is the later of
 * (current expiry) and (now + plan), and the plan level never drops below what is active.
 * So a 1-hour top-up never cuts a 15-day pass short or re-blurs an unlocked resume.
 */
export function grant(current: AccessRecord, plan: PlanId, now = Date.now()): Required<AccessRecord> {
  const cur = accessState(current, now);
  const fresh = now + PLANS[plan].ms;
  if (!cur.active) return { plan, expiresAt: new Date(fresh).toISOString() };
  const exp = Math.max(new Date(cur.expiresAt!).getTime(), fresh);
  const level = PLANS[cur.plan!].ms >= PLANS[plan].ms ? cur.plan! : plan;
  return { plan: level, expiresAt: new Date(exp).toISOString() };
}

export function formatLeft(ms: number): string {
  if (ms <= 0) return "expired";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m left`;
  return `${Math.floor(h / 24)}d ${h % 24}h left`;
}
