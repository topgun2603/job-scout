"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileText, Search, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CountUp } from "@/components/dashboard/count-up";
import { useApplicants, type Applicant } from "@/hooks/use-admin";
import { msUntil, useNow } from "@/hooks/use-now";
import { formatLeft, PLANS } from "@/lib/access";
import { cn } from "@/lib/utils";
import { ApplicantDetail } from "./applicant-detail";
import { CreateApplicant } from "./create-applicant";

type Filter = "all" | "active" | "expired" | "none";

function status(u: Applicant, now: number): Exclude<Filter, "all"> {
  if (!u.access.expiresAt) return "none";
  return msUntil(u.access.expiresAt, now || Date.now()) > 0 ? "active" : "expired";
}

function Row({ u, selected, onClick, now }: { u: Applicant; selected: boolean; onClick: () => void; now: number }) {
  const s = status(u, now);
  const left = msUntil(u.access.expiresAt, now);
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onClick={onClick}
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left transition-colors",
        selected ? "text-foreground" : "hover:bg-accent/50",
      )}
    >
      {selected && <motion.span layoutId="applicant-sel" className="absolute inset-0 rounded-xl bg-accent ring-1 ring-primary/40" />}
      <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/80 to-[oklch(0.7_0.2_330)] text-sm font-bold text-white">
        {u.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{u.fullName}</span>
          {u.resumes.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground" aria-label={`${u.resumes.length} resumes`}>
              <FileText className="size-3.5" />
              {u.resumes.length > 1 && u.resumes.length}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          @{u.username} · {u.coreSkills.slice(0, 3).join(", ") || "no skills yet"}
        </span>
      </span>
      <span
        className={cn(
          "relative shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
          u.disabled
            ? "bg-muted text-muted-foreground"
            : s === "active"
              ? "bg-strong/15 text-strong"
              : s === "expired"
                ? "bg-careful/15 text-careful"
                : "bg-muted text-muted-foreground",
        )}
      >
        {u.disabled ? "disabled" : s === "active" ? (now ? formatLeft(left).replace(" left", "") : PLANS[u.access.plan!].short) : s === "expired" ? "expired" : "no pass"}
      </span>
    </motion.button>
  );
}

export function AdminPanel() {
  const { data: users = [], isLoading } = useApplicants();
  const now = useNow(30_000);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { all: users.length, active: 0, expired: 0, none: 0 };
    for (const u of users) c[status(u, now)]++;
    return c;
  }, [users, now]);

  const shown = users.filter((u) => {
    const text = `${u.fullName} ${u.username} ${u.coreSkills.join(" ")} ${u.bonusSkills.join(" ")}`.toLowerCase();
    return (filter === "all" || status(u, now) === filter) && (!q || text.includes(q.toLowerCase()));
  });

  const current = creating ? null : (selected ?? shown[0]?.id ?? null);

  const tiles: { key: Filter; label: string; tone: string }[] = [
    { key: "all", label: "Applicants", tone: "text-primary" },
    { key: "active", label: "Active passes", tone: "text-strong" },
    { key: "expired", label: "Expired", tone: "text-careful" },
    { key: "none", label: "No pass yet", tone: "text-muted-foreground" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Admin</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Applicants</h1>
        </div>
        <Button size="lg" onClick={() => setCreating(true)}>
          <UserPlus /> New applicant
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <motion.button
            key={t.key}
            onClick={() => setFilter(t.key)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileTap={{ scale: 0.97 }}
            className="relative cursor-pointer rounded-xl border bg-card p-4 text-left shadow-sm"
          >
            {filter === t.key && <motion.span layoutId="admin-tile" className="absolute inset-0 rounded-xl ring-2 ring-primary" />}
            <CountUp value={counts[t.key]} className={cn("block font-display text-3xl font-extrabold tabular-nums", t.tone)} />
            <span className="text-sm text-muted-foreground">{t.label}</span>
          </motion.button>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="p-2 lg:sticky lg:top-[70px]">
          <div className="relative p-1">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, username, skill" className="pl-9" />
          </div>
          <div className="mt-1 max-h-[65vh] space-y-0.5 overflow-y-auto p-1">
            {isLoading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
            <AnimatePresence initial={false}>
              {shown.map((u) => (
                <Row
                  key={u.id}
                  u={u}
                  now={now}
                  selected={u.id === current}
                  onClick={() => {
                    setCreating(false);
                    setSelected(u.id);
                  }}
                />
              ))}
            </AnimatePresence>
            {!isLoading && !shown.length && (
              <div className="px-3 py-10 text-center">
                <Users className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">{users.length ? "Nobody matches." : "No applicants yet."}</p>
              </div>
            )}
          </div>
        </Card>

        <div>
          {creating ? (
            <CreateApplicant
              onCancel={() => setCreating(false)}
              onCreated={(id) => {
                setCreating(false);
                setSelected(id);
              }}
            />
          ) : current ? (
            <ApplicantDetail key={current} id={current} onDeleted={() => setSelected(null)} />
          ) : (
            !isLoading && (
              <Card className="grid place-items-center p-16 text-center">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 2.5 }} className="text-5xl">
                  👋
                </motion.div>
                <p className="mt-4 font-display text-xl font-bold">Add your first applicant</p>
                <p className="text-sm text-muted-foreground">Create a login, upload their resume and grant a pass.</p>
                <Button className="mt-5" onClick={() => setCreating(true)}>
                  <UserPlus /> New applicant
                </Button>
              </Card>
            )
          )}
        </div>
      </div>
    </main>
  );
}
