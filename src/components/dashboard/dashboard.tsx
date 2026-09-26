"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ArrowUpRight, Ban, CircleCheckBig, Keyboard, LayoutGrid, Lock, Rows3, Search, ShieldAlert, Sparkles, Star, ThumbsUp, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useJobs, useRescore, useScout, useSetStatus } from "@/hooks/use-jobs";
import { bucketOf } from "@/lib/bucket";
import type { JobRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CountUp } from "./count-up";
import { Hero } from "./hero";
import { JobCard, type Exit } from "./job-card";
import { JobTable } from "./job-table";

type View = "strong" | "maybe" | "careful" | "low" | "applied" | "skipped" | "filtered";

const TILES = [
  { key: "strong", label: "Strong match", hint: "65+", icon: Star, tone: "text-strong", glow: "bg-strong/12" },
  { key: "maybe", label: "Maybe", hint: "45–64", icon: ThumbsUp, tone: "text-maybe", glow: "bg-maybe/15" },
  { key: "careful", label: "Check carefully", hint: "flagged", icon: ShieldAlert, tone: "text-careful", glow: "bg-careful/12" },
  { key: "low", label: "Long shots", hint: "< 45", icon: Sparkles, tone: "text-low", glow: "bg-muted" },
] as const;

const TRACKER = [
  { key: "applied", label: "Applied", icon: CircleCheckBig },
  { key: "skipped", label: "Skipped", icon: X },
  { key: "filtered", label: "Filtered out", icon: Ban },
] as const;

const EMPTY: Record<View, { emoji: string; title: string; body: string }> = {
  strong: { emoji: "🔭", title: "No strong matches right now", body: "New jobs arrive with every scout run. Peek at the Maybe pile meanwhile." },
  maybe: { emoji: "🌤️", title: "Nothing in Maybe", body: "Either you're all caught up or the scout needs another run." },
  careful: { emoji: "🛡️", title: "No suspicious postings", body: "Nothing asked for fees or personal WhatsApp contact. Nice." },
  low: { emoji: "🎯", title: "No long shots", body: "Everything left scored at least Maybe." },
  applied: { emoji: "🚀", title: "No applications yet", body: "Mark a job as Applied and it lands here. Your streak starts today!" },
  skipped: { emoji: "🧹", title: "Nothing skipped", body: "Skipped jobs wait here in case you change your mind." },
  filtered: { emoji: "🧪", title: "Nothing filtered out", body: "Senior, off-track and stale postings show up here with the reason." },
};

async function celebrate(e?: React.MouseEvent) {
  const confetti = (await import("canvas-confetti")).default;
  const origin = e ? { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight } : { x: 0.5, y: 0.6 };
  confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin, colors: ["#7c5cff", "#b8f35a", "#22c55e", "#ff7ab6", "#ffd166"] });
}

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export function Dashboard({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, error } = useJobs();
  const setStatus = useSetStatus();
  const rescore = useRescore();
  const scout = useScout(isAdmin);

  const [view, setView] = useState<View | null>(null);
  const [layout, setLayout] = useState<"cards" | "table">("cards");
  const [sort, setSort] = useState<"best" | "newest">("best");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [exit, setExit] = useState<Exit>("restored");
  const [showKeys, setShowKeys] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => setLayout(readPref("layout", "cards")), []);

  const jobs = useMemo(() => data?.jobs ?? [], [data]);
  const readOnly = !!data?.readOnly;
  const thresholds = data?.thresholds ?? { strong: 65, maybe: 45 };
  const latestOk = data?.runs.find((r) => r.status === "ok" && r.inserted > 0);
  const isNew = useCallback((j: JobRow) => !!latestOk && j.firstSeen >= latestOk.startedAt, [latestOk]);

  const groups = useMemo(() => {
    const g: Record<View, JobRow[]> = { strong: [], maybe: [], careful: [], low: [], applied: [], skipped: [], filtered: [] };
    for (const j of jobs) {
      if (j.status === "new") g[bucketOf(j, thresholds)].push(j);
      else g[j.status].push(j);
    }
    return g;
  }, [jobs, thresholds]);

  const active: View = view ?? (groups.strong.length ? "strong" : groups.maybe.length ? "maybe" : "strong");

  // Source chips: counts per source within the current section.
  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of groups[active]) m.set(j.source, (m.get(j.source) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [groups, active]);
  const activeSource = source && sourceCounts.some(([s]) => s === source) ? source : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = groups[active].filter(
      (j) =>
        (!activeSource || j.source === activeSource) &&
        (!q ||
          [j.title, j.company, j.location.join(" "), j.skills.join(" "), j.filterReason ?? ""].some((s) =>
            s.toLowerCase().includes(q),
          )),
    );
    const time = (j: JobRow) => (j.postedAt ? new Date(j.postedAt).getTime() : 0);
    return list.sort((a, b) => (sort === "best" ? b.score - a.score || time(b) - time(a) : time(b) - time(a) || b.score - a.score));
  }, [groups, active, query, sort, activeSource]);

  const change = useCallback(
    (job: JobRow, status: "new" | "applied" | "skipped", e?: React.MouseEvent) => {
      setExit(status === "applied" ? "applied" : status === "skipped" ? "skipped" : "restored");
      const prev = job.status === "filtered" ? "new" : job.status;
      setStatus.mutate({ id: job.id, status });
      if (status === "applied") celebrate(e);
      if (status !== "new") {
        toast(status === "applied" ? `Applied: ${job.title}` : `Skipped ${job.company}`, {
          description: status === "applied" ? "Nice! One step closer. 🎯" : undefined,
          action: { label: "Undo", onClick: () => setStatus.mutate({ id: job.id, status: prev }) },
        });
      }
    },
    [setStatus],
  );

  const apply = useCallback((j: JobRow, e?: React.MouseEvent) => change(j, "applied", e), [change]);
  const skip = useCallback((j: JobRow) => change(j, "skipped"), [change]);
  const restore = useCallback((j: JobRow) => change(j, "new"), [change]);
  const openJob = useCallback(
    (j: JobRow) => {
      window.open(j.url, "_blank", "noopener,noreferrer");
      if (j.status === "new") {
        toast(`Applying at ${j.company}?`, {
          description: "Come back and mark it once you've sent it.",
          action: { label: "Mark applied", onClick: () => apply(j) },
          duration: 8000,
        });
      }
    },
    [apply],
  );

  useEffect(() => setSelected(0), [active, query, sort, activeSource]);

  // Keyboard: j/k move, o open, a applied, s skip, u restore, / search, v view, ? help
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName);
      if (typing) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const job = visible[selected];
      const move = (d: number) => {
        const next = Math.max(0, Math.min(visible.length - 1, selected + d));
        setSelected(next);
        const id = visible[next]?.id;
        if (id !== undefined) cardRefs.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      const jobActions: Record<string, () => void> = readOnly
        ? {}
        : {
            o: () => job && openJob(job),
            Enter: () => job && openJob(job),
            a: () => job?.status === "new" && apply(job),
            s: () => job?.status === "new" && skip(job),
            u: () => job && job.status !== "new" && restore(job),
          };
      const actions: Record<string, () => void> = {
        j: () => move(1),
        ArrowDown: () => move(1),
        k: () => move(-1),
        ArrowUp: () => move(-1),
        ...jobActions,
        "/": () => searchRef.current?.focus(),
        v: () => {
          const next = layout === "cards" ? "table" : "cards";
          setLayout(next);
          writePref("layout", next);
        },
        "?": () => setShowKeys((s) => !s),
      };
      const fn = actions[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selected, layout, openJob, apply, skip, restore, readOnly]);

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-5xl">🙈</p>
        <h1 className="mt-4 font-display text-2xl font-bold">Could not load jobs</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </main>
    );
  }

  const todayCount = [...groups.strong, ...groups.maybe].filter(
    (j) => j.postedAt && new Date(j.postedAt).toDateString() === new Date().toDateString(),
  ).length;

  return (
    <main className="mx-auto max-w-6xl overflow-x-clip px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <Hero
        name={data?.profile.name ?? ""}
        weeklyGoal={data?.profile.weeklyGoal ?? 10}
        jobs={jobs}
        lastRun={data?.runs[0]}
        scouting={scout.running}
        scoutLog={scout.log}
        onScout={scout.start}
        isAdmin={isAdmin}
        readOnly={readOnly}
        onRescore={() => rescore.mutate()}
        rescoring={rescore.isPending}
      />

      {/* Bucket tiles double as the main tabs */}
      <LayoutGroup id="tiles">
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" role="tablist" aria-label="Shortlist sections">
          {TILES.map((t, i) => {
            const on = active === t.key;
            return (
              <motion.button
                key={t.key}
                role="tab"
                aria-selected={on}
                onClick={() => setView(t.key)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                whileTap={{ scale: 0.97 }}
                className="relative cursor-pointer rounded-xl border bg-card p-4 text-left shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {on && (
                  <motion.span
                    layoutId="tile-active"
                    className="absolute inset-0 rounded-xl ring-2 ring-primary"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <div className="flex items-center justify-between">
                  <span className={cn("grid size-8 place-items-center rounded-lg", t.glow, t.tone)}>
                    <t.icon className="size-4" />
                  </span>
                  <span className="text-[11px] text-muted-foreground">{t.hint}</span>
                </div>
                <CountUp value={groups[t.key].length} className="mt-3 block font-display text-3xl font-extrabold tabular-nums" />
                <span className="text-sm text-muted-foreground">{t.label}</span>
              </motion.button>
            );
          })}
        </div>
      </LayoutGroup>

      {/* Toolbar */}
      <div className="sticky top-[53px] z-20 -mx-4 mt-6 flex flex-wrap items-center gap-2 bg-background/80 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, company, skill, city…  ( / )"
            className="pl-10"
          />
        </div>

        <div className="flex items-center rounded-full border bg-card p-0.5 text-sm">
          {TRACKER.filter((t) => !readOnly || t.key === "filtered").map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={cn(
                "relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active === t.key ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active === t.key && (
                <motion.span layoutId="tracker-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              )}
              <t.icon className="relative size-3.5" />
              <span className="relative">
                {t.label} <span className="tabular-nums opacity-70">{groups[t.key].length}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center rounded-full border bg-card p-0.5">
          {(["best", "newest"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                sort === s ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "best" ? "Best match" : "Newest"}
            </button>
          ))}
        </div>

        <div className="flex items-center rounded-full border bg-card p-0.5">
          {(
            [
              ["cards", LayoutGrid],
              ["table", Rows3],
            ] as const
          ).map(([l, Icon]) => (
            <button
              key={l}
              aria-label={`${l} view`}
              onClick={() => {
                setLayout(l);
                writePref("layout", l);
              }}
              className={cn(
                "cursor-pointer rounded-full p-1.5 transition-colors",
                layout === l ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>

        <Button variant="ghost" size="icon-sm" onClick={() => setShowKeys((s) => !s)} aria-label="Keyboard shortcuts">
          <Keyboard />
        </Button>
      </div>

      <AnimatePresence>
        {showKeys && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="mb-4 flex flex-wrap gap-x-6 gap-y-2 p-4 text-xs text-muted-foreground">
              {[
                ["j / k", "move"],
                ...(readOnly
                  ? []
                  : [
                      ["o / Enter", "open posting"],
                      ["a", "mark applied"],
                      ["s", "skip"],
                      ["u", "back to shortlist"],
                    ]),
                ["/", "search"],
                ["v", "cards / table"],
                ["?", "this help"],
              ].map(([k, d]) => (
                <span key={k}>
                  <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-foreground">{k}</kbd> {d}
                </span>
              ))}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {sourceCounts.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 text-muted-foreground">Source</span>
          {[["all", groups[active].length] as const, ...sourceCounts].map(([s, n]) => {
            const on = s === "all" ? !activeSource : activeSource === s;
            return (
              <motion.button
                key={s}
                layout
                whileTap={{ scale: 0.94 }}
                onClick={() => setSource(s === "all" ? null : s)}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 font-mono transition-colors",
                  on ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {s} <span className="tabular-nums opacity-70">{n}</span>
              </motion.button>
            );
          })}
        </div>
      )}

      {readOnly && <PreviewBanner />}

      {todayCount > 0 && active !== "filtered" && (
        <p className="mb-3 text-sm text-muted-foreground">
          🔥 <b className="text-foreground">{todayCount}</b> shortlisted {todayCount === 1 ? "job was" : "jobs were"} posted today.{readOnly ? "" : " Fresher roles fill fast, apply early!"}
        </p>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState view={active} searching={!!query} onScout={isAdmin ? scout.start : undefined} scouting={scout.running} />
      ) : active === "filtered" ? (
        <FilteredList
          jobs={visible}
          isAdmin={isAdmin}
          onOpen={readOnly ? undefined : (j) => window.open(j.url, "_blank", "noopener,noreferrer")}
        />
      ) : layout === "table" ? (
        <JobTable jobs={visible} thresholds={thresholds} readOnly={readOnly} onApply={apply} onSkip={skip} onRestore={restore} onOpen={openJob} />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          <AnimatePresence mode="popLayout" custom={exit}>
            {visible.map((j, i) => (
              <JobCard
                key={j.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(j.id, el);
                  else cardRefs.current.delete(j.id);
                }}
                job={j}
                bucket={bucketOf(j, thresholds)}
                isNew={isNew(j)}
                selected={i === selected}
                onSelect={() => setSelected(i)}
                readOnly={readOnly}
                onApply={apply}
                onSkip={skip}
                onRestore={restore}
                onOpen={openJob}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <footer className="mt-16 text-center text-xs text-muted-foreground">
        Job Scout never logs in or applies for you. Always verify a company before sharing documents.
      </footer>
    </main>
  );
}

function PreviewBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/8 p-4"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Lock className="size-4" />
      </span>
      <div className="text-sm">
        <p className="font-medium">You're on the 1-hour preview pass</p>
        <p className="text-muted-foreground">
          Browse your matches and scores. Apply links, Applied / Skip tracking and resume download unlock with a{" "}
          <b className="text-foreground">1-day pass or longer</b>. Ask your admin to upgrade.
        </p>
      </div>
    </motion.div>
  );
}

function EmptyState({ view, searching, onScout, scouting }: { view: View; searching: boolean; onScout?: () => void; scouting: boolean }) {
  const e = searching ? { emoji: "🔍", title: "No matches for that search", body: "Try a skill, a city or a company name." } : EMPTY[view];
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-16 text-center">
      <motion.div
        className="text-6xl"
        animate={{ y: [0, -10, 0], rotate: [0, -6, 6, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
      >
        {e.emoji}
      </motion.div>
      <h2 className="mt-4 font-display text-xl font-bold">{e.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{e.body}</p>
      {!searching && onScout && (view === "strong" || view === "maybe") && (
        <Button className="mt-5" onClick={onScout} disabled={scouting}>
          <Sparkles /> {scouting ? "Scouting…" : "Scout now"}
        </Button>
      )}
    </motion.div>
  );
}

function FilteredList({ jobs, isAdmin, onOpen }: { jobs: JobRow[]; isAdmin: boolean; onOpen?: (j: JobRow) => void }) {
  return (
    <Card className="divide-y p-0">
      <p className="px-4 py-3 text-xs text-muted-foreground">
        Dropped by the seniority / relevance filter. {isAdmin ? <>Edit <code className="font-mono">config/profile.yaml</code> and hit Rescore <Undo2 className="inline size-3" /> to bring some back.</> : "These did not fit a fresher React profile."}
      </p>
      {jobs.map((j, i) => (
        <motion.div
          key={j.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: Math.min(i * 0.02, 0.4) }}
          className="flex flex-wrap items-center gap-3 px-4 py-2.5"
        >
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">{j.filterReason}</span>
          <span className="min-w-0 flex-1 truncate text-sm">
            <b className="font-medium">{j.title}</b> <span className="text-muted-foreground">· {j.company}</span>
          </span>
          {onOpen && (
            <Button variant="ghost" size="icon-sm" onClick={() => onOpen(j)} aria-label="Open posting">
              <ArrowUpRight />
            </Button>
          )}
        </motion.div>
      ))}
    </Card>
  );
}
