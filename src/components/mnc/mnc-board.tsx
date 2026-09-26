"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Briefcase, Building2, ExternalLink, Lock, MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CountUp } from "@/components/dashboard/count-up";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMncs } from "@/hooks/use-mncs";
import { MNC_PREVIEW, PLANS } from "@/lib/access";
import type { LockedMncRole, MncCompany, MncItem, MncRole } from "@/lib/mnc";
import { cn } from "@/lib/utils";

const locked = (r: MncItem): r is LockedMncRole => "locked" in r;

const fitTone = (fit: number) =>
  fit >= 4 ? "bg-strong/15 text-strong" : fit === 3 ? "bg-maybe/20 text-foreground" : "bg-muted text-muted-foreground";

function Fit({ fit }: { fit: number }) {
  return (
    <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl font-display text-lg font-extrabold tabular-nums", fitTone(fit))}>
      {fit}
      <span className="-mt-2 text-[10px] font-medium opacity-70">/ 5</span>
    </span>
  );
}

function RoleCard({ role, readOnly, i }: { role: MncRole; readOnly: boolean; i: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
      <Card className="flex gap-4 p-4 sm:p-5">
        <Fit fit={role.fit} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold leading-snug tracking-tight sm:text-lg">{role.title}</h3>
          <p className="text-sm font-medium text-muted-foreground">{role.company}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {role.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {role.location}
              </span>
            )}
            {role.experience && (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="size-3.5" />
                {role.experience}
              </span>
            )}
          </div>
          {role.why && <p className="mt-2 text-sm">{role.why}</p>}
          <div className="mt-3 flex justify-end border-t pt-3">
            {readOnly || !role.url ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <Lock className="size-3.5" /> {readOnly ? "Apply unlocks with a 1-day pass" : "No direct link"}
              </span>
            ) : (
              <Button size="sm" asChild>
                <a href={role.url} target="_blank" rel="noopener noreferrer">
                  Apply <ArrowUpRight />
                </a>
              </Button>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/** Placeholder bars, not text: the server never sent the real role. */
function LockedCard({ role }: { role: LockedMncRole }) {
  return (
    <Card aria-hidden className="flex select-none gap-4 p-4 blur-[3px] sm:p-5">
      <Fit fit={role.fit} />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-4 w-3/5 rounded bg-foreground/15" />
        <div className="h-3 w-1/4 rounded bg-foreground/10" />
        <div className="flex gap-3 pt-1">
          <div className="h-3 w-24 rounded bg-foreground/10" />
          <div className="h-3 w-20 rounded bg-foreground/10" />
        </div>
        <div className="h-3 w-4/5 rounded bg-foreground/8" />
      </div>
    </Card>
  );
}

const STATUS: Record<MncCompany["status"], { label: string; variant: "strong" | "muted" | "careful" }> = {
  ok: { label: "roles found", variant: "strong" },
  "no-match": { label: "no match", variant: "muted" },
  blocked: { label: "blocked", variant: "careful" },
  error: { label: "site down", variant: "careful" },
};

function Companies({ companies }: { companies: MncCompany[] }) {
  return (
    <Card className="mt-10 overflow-hidden">
      <div className="border-b p-4">
        <h2 className="font-display text-lg font-bold">Companies checked</h2>
        <p className="text-sm text-muted-foreground">Blocked sites need a manual look; the note says why each one had no match.</p>
      </div>
      <ul className="divide-y">
        {companies.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 p-4 text-sm">
            <span className="min-w-40 font-medium">{c.name}</span>
            <Badge variant={STATUS[c.status].variant}>{c.status === "ok" ? `${c.roles} roles` : STATUS[c.status].label}</Badge>
            {c.careersUrl && (
              <a href={c.careersUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
                careers page <ExternalLink className="size-3" />
              </a>
            )}
            {c.note && <p className="basis-full text-xs text-muted-foreground">{c.note}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function MncBoard({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, error } = useMncs();
  const [q, setQ] = useState("");
  const [minFit, setMinFit] = useState(1);

  const roles = data?.roles ?? [];
  const open = roles.filter((r): r is MncRole => !locked(r));
  const hidden = roles.filter(locked);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return open.filter(
      (r) => r.fit >= minFit && (!needle || `${r.title} ${r.company} ${r.location ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [open, q, minFit]);

  const companies = data?.companies ?? [];
  const tiles = isAdmin
    ? [
        { label: "Roles matched", value: roles.length, tone: "text-primary" },
        { label: "Strong fit (4–5)", value: roles.filter((r) => r.fit >= 4).length, tone: "text-strong" },
        { label: "Companies with roles", value: companies.filter((c) => c.status === "ok").length, tone: "text-maybe" },
        { label: "Blocked / down", value: companies.filter((c) => c.status === "blocked" || c.status === "error").length, tone: "text-careful" },
      ]
    : [];

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-8 sm:px-6">
      {isAdmin && <p className="text-sm text-muted-foreground">Admin</p>}
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">MNC jobs</h1>
      {/* Applicants get no line about where or when these roles were found. */}
      {isAdmin && (
      <p className="mt-1 text-sm text-muted-foreground">
        Found on the companies&apos; own careers pages
        {data?.checkedAt &&` · checked ${new Date(data.checkedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}.
        {` A ${PLANS["1h"].label} pass sees the top ${MNC_PREVIEW} without links; the rest are blurred. A ${PLANS["1d"].label} pass or longer sees everything.`}
      </p>
      )}

      {tiles.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border bg-card p-4 shadow-sm">
              <CountUp value={t.value} className={cn("block font-display text-3xl font-extrabold tabular-nums", t.tone)} />
              <span className="text-sm text-muted-foreground">{t.label}</span>
            </div>
          ))}
        </div>
      )}

      {!data?.readOnly && roles.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search role, company, city" className="pl-9" />
          </div>
          <div className="flex rounded-full border bg-card p-0.5 text-xs font-medium">
            {[1, 3, 4].map((f) => (
              <button
                key={f}
                onClick={() => setMinFit(f)}
                className={cn("rounded-full px-3 py-1.5", minFit === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {f === 1 ? "All" : `Fit ${f}+`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />)}
        {error && <Card className="p-6 text-sm text-careful">{error.message}</Card>}
        {shown.map((r, i) => (
          <RoleCard key={r.id} role={r} readOnly={!!data?.readOnly} i={i} />
        ))}
        {!isLoading && !error && !roles.length && (
          <Card className="p-10 text-center">
            <Building2 className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {isAdmin ? "No probe imported yet. Run npm run import-mncs -- <results.json>." : "No MNC roles yet. Check back soon."}
            </p>
          </Card>
        )}
        {!isLoading && roles.length > 0 && !shown.length && !hidden.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches that filter.</p>
        )}

        {hidden.length > 0 && (
          <div className="relative">
            <div className="space-y-3">
              {hidden.slice(0, 6).map((r) => (
                <LockedCard key={r.id} role={r} />
              ))}
            </div>
            <div className="absolute inset-0 flex items-start justify-center bg-gradient-to-b from-transparent via-background/60 to-background pt-10">
              <div className="max-w-sm rounded-2xl border bg-card/95 p-5 text-center shadow-xl backdrop-blur">
                <Lock className="mx-auto size-6 text-primary" />
                <p className="mt-2 font-display text-lg font-bold">{hidden.length} more MNC roles</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hidden.filter((r) => r.fit >= 4).length} of them are a strong fit. Ask your admin for a {PLANS["1d"].label} pass or longer to see them all and apply.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {isAdmin && companies.length > 0 && <Companies companies={companies} />}
    </main>
  );
}
