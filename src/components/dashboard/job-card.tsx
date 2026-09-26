"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Briefcase, Check, ChevronDown, GraduationCap, IndianRupee, Lock, MapPin, ShieldAlert, Undo2, X } from "lucide-react";
import { forwardRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { expLabel, isScamFlag, postedLabel } from "@/lib/bucket";
import type { Bucket, JobRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScoreRing } from "./score-ring";

export type Exit = "applied" | "skipped" | "restored";

const exitMotion: Record<Exit, object> = {
  applied: { x: 260, rotate: 6, opacity: 0, scale: 0.9 },
  skipped: { x: -260, rotate: -6, opacity: 0, scale: 0.9 },
  restored: { y: -20, opacity: 0, scale: 0.95 },
};

function Reason({ text }: { text: string }) {
  const m = text.match(/^([+-]\d+)\s+(\w+):\s*(.*)$/);
  if (!m) return <li>{text}</li>;
  const [, pts, label, detail] = m;
  const neg = pts!.startsWith("-");
  return (
    <li className="flex items-start gap-2">
      <span
        className={cn(
          "mt-px w-10 shrink-0 rounded-full py-0.5 text-center font-mono text-[11px] font-semibold",
          neg ? "bg-careful/15 text-careful" : "bg-strong/15 text-strong",
        )}
      >
        {pts}
      </span>
      <span>
        <b className="font-medium capitalize">{label}</b> <span className="text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

export interface JobCardProps {
  job: JobRow;
  bucket: Bucket;
  isNew: boolean;
  selected: boolean;
  /** 1-hour preview: no apply link, no Applied / Skip. */
  readOnly?: boolean;
  onApply: (job: JobRow, e?: React.MouseEvent) => void;
  onSkip: (job: JobRow) => void;
  onRestore: (job: JobRow) => void;
  onOpen: (job: JobRow) => void;
  onSelect: () => void;
}

export const JobCard = forwardRef<HTMLDivElement, JobCardProps>(function JobCard(
  { job, bucket, isNew, selected, readOnly, onApply, onSkip, onRestore, onOpen, onSelect },
  ref,
) {
  const [open, setOpen] = useState(false);
  const matched = new Set(job.matchedSkills.map((s) => s.toLowerCase()));
  const tags = [...job.skills].sort((a, b) => Number(matched.has(b.toLowerCase())) - Number(matched.has(a.toLowerCase())));
  const posted = postedLabel(job.postedAt);
  const exp = expLabel(job.expMin, job.expMax);
  const scamFlags = job.flags.filter(isScamFlag);
  const actionable = job.status === "new";

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      variants={{ exit: (custom: Exit) => ({ ...exitMotion[custom ?? "restored"], transition: { duration: 0.35 } }) }}
      exit="exit"
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      onClick={onSelect}
    >
      <Card
        className={cn(
          "group relative overflow-hidden p-4 transition-shadow hover:shadow-lg hover:shadow-primary/5 sm:p-5",
          selected && "ring-2 ring-primary/60",
        )}
      >
        {bucket === "strong" && (
          <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-strong/10 blur-2xl" />
        )}
        <div className="flex gap-4">
          <ScoreRing score={job.score} bucket={bucket} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {isNew && <Badge variant="lime">NEW</Badge>}
              {posted === "today" && <Badge variant="careful">🔥 posted today</Badge>}
              {job.remote && <Badge variant="secondary">Remote</Badge>}
            </div>
            <h3 className="mt-1 font-display text-lg font-bold leading-snug tracking-tight">
              {readOnly ? (
                job.title
              ) : (
                <button onClick={() => onOpen(job)} className="text-left hover:text-primary hover:underline">
                  {job.title}
                </button>
              )}
            </h3>
            <p className="text-sm font-medium text-muted-foreground">{job.company}</p>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {job.location.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {job.location.slice(0, 3).join(", ")}
                  {job.location.length > 3 && ` +${job.location.length - 3}`}
                </span>
              )}
              {exp && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="size-3.5" />
                  {exp}
                </span>
              )}
              {job.salary && (
                <span className="inline-flex items-center gap-1">
                  <IndianRupee className="size-3.5" />
                  {job.salary}
                </span>
              )}
              {job.batch && (
                <span className="inline-flex items-center gap-1">
                  <GraduationCap className="size-3.5" />
                  batch {job.batch}
                </span>
              )}
            </div>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.slice(0, 9).map((s) => {
              const hit = matched.has(s.toLowerCase()) || job.matchedSkills.some((m) => s.toLowerCase().includes(m.toLowerCase()));
              return (
                <span
                  key={s}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                    hit ? "bg-primary/12 font-medium text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {hit && <Check className="size-3" />}
                  {s}
                </span>
              );
            })}
            {tags.length > 9 && <span className="px-1 text-xs text-muted-foreground">+{tags.length - 9}</span>}
          </div>
        )}

        {scamFlags.length > 0 && (
          <div className="mt-3 flex gap-2 rounded-lg border border-careful/30 bg-careful/8 p-2.5 text-xs">
            <ShieldAlert className="size-4 shrink-0 text-careful" />
            <p className="font-medium text-careful">{scamFlags.map((f) => f.replace(/^possible-scam:\s*/, "")).join(" · ")}</p>
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={open}
        >
          Why {job.score}?
          <motion.span animate={{ rotate: open ? 180 : 0 }}>
            <ChevronDown className="size-3.5" />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-1.5 overflow-hidden pt-2 text-xs"
            >
              {job.scoreReasons.map((r) => (
                <Reason key={r} text={r} />
              ))}
              {job.scoreReasons.length === 0 && <li className="text-muted-foreground">Nothing matched your profile.</li>}
            </motion.ul>
          )}
        </AnimatePresence>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {job.source && <span className="font-mono">{job.source} · </span>}posted {posted}
          </span>
          {readOnly ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Lock className="size-3.5" /> Apply unlocks with a 1-day pass
            </span>
          ) : (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {actionable ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => onSkip(job)}>
                  <X /> Skip
                </Button>
                <Button variant="success" size="sm" onClick={(e) => onApply(job, e)}>
                  <Check /> Applied
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => onRestore(job)}>
                <Undo2 /> Back to shortlist
              </Button>
            )}
            <Button size="sm" asChild>
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  onOpen(job);
                }}
              >
                Apply <ArrowUpRight />
              </a>
            </Button>
          </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
});
