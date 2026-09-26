"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ban, FileLock2, FileCheck2, History, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useGrant, useRevoke, type Applicant } from "@/hooks/use-admin";
import { msUntil, useNow } from "@/hooks/use-now";
import { formatLeft, PLAN_IDS, PLANS, RESUME_UNLOCK_MS, type PlanId } from "@/lib/access";
import type { AccessLogEntry } from "@/lib/users";
import { cn } from "@/lib/utils";

const PLAN_STYLE: Record<PlanId, string> = {
  "1h": "from-slate-400 to-slate-500",
  "1d": "from-sky-400 to-blue-500",
  "7d": "from-violet-400 to-primary",
  "15d": "from-fuchsia-400 to-pink-500",
  "1m": "from-amber-400 to-orange-500",
};

function Ring({ pct, children }: { pct: number; children: React.ReactNode }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-20 shrink-0 place-items-center">
      <svg viewBox="0 0 72 72" className="absolute inset-0 -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <motion.circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-strong"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      {children}
    </div>
  );
}

export function AccessCard({ user, log }: { user: Applicant; log: AccessLogEntry[] }) {
  const grant = useGrant(user.id);
  const revoke = useRevoke(user.id);
  const now = useNow(1000);
  const left = now ? msUntil(user.access.expiresAt, now) : user.access.msLeft;
  const active = user.access.active && left > 0;
  const planMs = user.access.plan ? PLANS[user.access.plan].ms : 1;
  const unlocked = active && planMs >= RESUME_UNLOCK_MS;

  const give = (plan: PlanId) =>
    grant.mutate(plan, {
      onSuccess: (r) =>
        toast.success(`${PLANS[plan].label} granted to ${user.fullName}`, {
          description: `Access until ${new Date(r.user.access.expiresAt!).toLocaleString("en-IN")}${
            PLANS[plan].resumes > 1
              ? ` · all ${PLANS[plan].resumes} resumes unlocked`
              : PLANS[plan].ms >= RESUME_UNLOCK_MS
                ? " · full access"
                : " · browse-only preview"
          }`,
        }),
    });

  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <Ring pct={active ? Math.min(1, left / planMs) : 0}>
          <Timer className={cn("size-6", active ? "text-strong" : "text-muted-foreground")} />
        </Ring>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Access</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={active ? "on" : "off"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className={cn("font-display text-2xl font-extrabold tabular-nums", active ? "text-strong" : "text-careful")}
            >
              {active ? formatLeft(left) : log[0]?.action === "revoke" ? "Revoked" : user.access.expiresAt ? "Expired" : "Not granted"}
            </motion.p>
          </AnimatePresence>
          <p className="text-xs text-muted-foreground">
            {active && user.access.plan
              ? `${PLANS[user.access.plan].label} pass · until ${new Date(user.access.expiresAt!).toLocaleString("en-IN")}`
              : "Pick a pass below to start"}
          </p>
          <p className={cn("mt-1 inline-flex items-center gap-1 text-xs font-medium", unlocked ? "text-strong" : "text-muted-foreground")}>
            {unlocked ? <FileCheck2 className="size-3.5" /> : <FileLock2 className="size-3.5" />}
            {unlocked
              ? `Full access · ${user.access.resumeLimit} resume${user.access.resumeLimit > 1 ? "s" : ""} with download`
              : "Preview: browse jobs only, resume half-blurred"}
          </p>
        </div>
      </div>

      <p className="mb-2 mt-5 text-xs font-medium text-muted-foreground">
        Grant or extend <span className="font-normal">(extends from the current expiry · 1h = browse-only preview · 1 month = 3 resumes)</span>
      </p>
      <div className="grid grid-cols-5 gap-2">
        {PLAN_IDS.map((p, i) => (
          <motion.button
            key={p}
            type="button"
            onClick={() => give(p)}
            disabled={grant.isPending}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.93 }}
            className={cn(
              "cursor-pointer rounded-xl bg-gradient-to-br px-1 py-2.5 text-center text-white shadow-sm disabled:opacity-60",
              PLAN_STYLE[p],
            )}
          >
            <span className="block font-display text-lg font-extrabold leading-none">{PLANS[p].short}</span>
            <span className="text-[10px] opacity-90">
              {PLANS[p].resumes > 1 ? `${PLANS[p].resumes} resumes` : PLANS[p].ms >= RESUME_UNLOCK_MS ? "full" : "preview"}
            </span>
          </motion.button>
        ))}
      </div>

      {active && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 text-careful hover:text-careful"
          onClick={() => {
            if (confirm(`Revoke ${user.fullName}'s access now?`)) revoke.mutate(undefined, { onSuccess: () => toast("Access revoked") });
          }}
        >
          <Ban /> Revoke access now
        </Button>
      )}

      {log.length > 0 && (
        <details className="group mt-4">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <History className="size-3.5" /> History ({log.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {log.map((l) => (
              <li key={l.id} className="flex justify-between gap-2 border-b border-dashed py-1 last:border-0">
                <span>
                  {l.action === "grant" ? (
                    <>
                      Granted <b>{l.plan && PLANS[l.plan].label}</b>
                    </>
                  ) : (
                    <b className="text-careful">Revoked</b>
                  )}
                </span>
                <span className="text-muted-foreground">{new Date(l.at).toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
