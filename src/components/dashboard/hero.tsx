"use client";

import { motion } from "framer-motion";
import { Flame, Moon, RefreshCcw, Sparkles, Sun, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { JobRow, RunRow } from "@/lib/types";
import { Radar } from "./radar";

const RANKS = [
  { min: 30, name: "Unstoppable", emoji: "🚀" },
  { min: 15, name: "Go-getter", emoji: "⚡" },
  { min: 5, name: "Hustler", emoji: "💪" },
  { min: 0, name: "Rookie", emoji: "🌱" },
];

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Consecutive days (ending today or yesterday) with at least one application. */
export function applyStreak(applied: JobRow[], now = new Date()): number {
  const days = new Set(applied.filter((j) => j.statusChangedAt).map((j) => dayKey(new Date(j.statusChangedAt!))));
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage blocked; theme just won't persist */
    }
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
      <motion.span key={String(dark)} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}>
        {dark ? <Sun /> : <Moon />}
      </motion.span>
    </Button>
  );
}

function sinceLabel(iso?: string) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export function Hero({
  name,
  weeklyGoal,
  jobs,
  lastRun,
  scouting,
  scoutLog,
  onScout,
  onRescore,
  rescoring,
  isAdmin,
  readOnly,
}: {
  name: string;
  weeklyGoal: number;
  jobs: JobRow[];
  lastRun?: RunRow;
  scouting: boolean;
  scoutLog: string[];
  onScout: () => void;
  onRescore: () => void;
  rescoring: boolean;
  isAdmin: boolean;
  readOnly?: boolean;
}) {
  const applied = jobs.filter((j) => j.status === "applied");
  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeek = applied.filter((j) => j.statusChangedAt && new Date(j.statusChangedAt).getTime() > weekAgo).length;
  const pct = Math.min(100, Math.round((thisWeek / weeklyGoal) * 100));
  const streak = applyStreak(applied);
  const rank = RANKS.find((r) => applied.length >= r.min)!;
  const lastLine = scoutLog.at(-1)?.replace(/^\d\d:\d\d:\d\d [·!x] /, "");

  return (
    <header className="relative">
      <div className="pointer-events-none absolute -top-24 left-1/4 -z-10 h-72 w-72 rounded-full bg-[var(--blob-1)] blur-3xl" />
      <div className="pointer-events-none absolute -top-10 right-10 -z-10 h-56 w-56 rounded-full bg-[var(--blob-2)] blur-3xl" />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Radar active={scouting} />
          <div>
            <p className="text-sm text-muted-foreground">{greeting(name)} 👋</p>
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Job Scout{" "}
              <span className="bg-gradient-to-r from-primary to-[oklch(0.7_0.2_330)] bg-clip-text text-transparent">Freshers</span>
            </h1>
          </div>
        </div>

        {isAdmin && (
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={onRescore} disabled={rescoring} aria-label="Rescore with current config">
                <RefreshCcw className={rescoring ? "animate-spin" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Re-apply config/*.yaml to stored jobs</TooltipContent>
          </Tooltip>
          <Button size="lg" onClick={onScout} disabled={scouting} className="relative overflow-hidden">
            {scouting && (
              <motion.span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
              />
            )}
            <Sparkles />
            {scouting ? "Scouting…" : "Scout now"}
          </Button>
        </div>
        )}
      </div>

      <div className="mt-2 min-h-5 text-xs text-muted-foreground">
        {scouting ? (
          <motion.span key={lastLine} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="font-mono">
            {lastLine ?? "Warming up the browser…"}
          </motion.span>
        ) : (
          <span>
            Last scouted {sinceLabel(lastRun?.finishedAt ?? lastRun?.startedAt)}
            {lastRun?.message ? ` · ${lastRun.message}` : ""}
          </span>
        )}
      </div>

      {!readOnly && (
      <Card className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 p-4 sm:p-5">
        <div className="min-w-56 flex-1">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="font-medium">Weekly goal</span>
            <span className="tabular-nums text-muted-foreground">
              <b className="text-foreground">{thisWeek}</b> / {weeklyGoal} applications
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary via-[oklch(0.7_0.2_330)] to-lime"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          {pct >= 100 && <p className="mt-1.5 text-xs font-medium text-strong">Goal smashed this week 🎉</p>}
        </div>
        <div className="flex items-center gap-2">
          <motion.span
            animate={streak ? { scale: [1, 1.18, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1.6 }}
            className={streak ? "text-[oklch(0.7_0.2_45)]" : "text-muted-foreground"}
          >
            <Flame className="size-6" />
          </motion.span>
          <div className="leading-tight">
            <div className="font-display text-xl font-bold tabular-nums">{streak}-day</div>
            <div className="text-xs text-muted-foreground">apply streak</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Trophy className="size-6 text-maybe" />
          <div className="leading-tight">
            <div className="font-display text-xl font-bold">
              {rank.emoji} {rank.name}
            </div>
            <div className="text-xs text-muted-foreground">{applied.length} applied all-time</div>
          </div>
        </div>
      </Card>
      )}
    </header>
  );
}
