"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Download, FileText, FileX2, Lock, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PLANS, type AccessState } from "@/lib/access";
import type { ResumeView } from "@/lib/resume-access";
import { cn } from "@/lib/utils";

export interface ResumeListPayload {
  resumes: ResumeView[];
  access: AccessState;
}

export function useResumeList(userId: number) {
  return useQuery({
    queryKey: ["resume", userId],
    queryFn: async () => {
      const res = await fetch(`/api/resume/${userId}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not load resumes");
      return (await res.json()) as ResumeListPayload;
    },
  });
}

export const resumeTitle = (r: { label?: string; name: string }, i: number) => r.label || `Resume ${i + 1}`;

const block = (e: React.SyntheticEvent) => e.preventDefault();

/** The pages of one resume. Locked viewers get server-blurred images plus an unlock card. */
export function ResumePages({ userId, resume, access }: { userId: number; resume: ResumeView; access: AccessState }) {
  const v = encodeURIComponent(resume.uploadedAt);
  const lockKey = resume.unlocked ? "u" : "l"; // new URL when the lock state flips, so the browser refetches
  return (
    <div className="space-y-4">
      {Array.from({ length: resume.pages }, (_, i) => (
        <motion.div
          key={`${resume.id}-${i}-${lockKey}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="relative overflow-hidden rounded-xl border bg-white shadow-sm select-none"
          onContextMenu={resume.unlocked ? undefined : block}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered, auth-gated PNG */}
          <img
            src={`/api/resume/${userId}/${resume.id}/page/${i + 1}?v=${v}&k=${lockKey}`}
            alt={`${resume.name}, page ${i + 1}`}
            className="block w-full"
            draggable={false}
            onDragStart={block}
          />
          {!resume.unlocked && (
            <div className={`absolute inset-x-0 bottom-0 grid place-items-center p-4 ${i === 0 ? "top-1/2" : "top-0"}`}>
              {i === 0 && <UnlockCard access={access} />}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/** Placeholder for a resume the current pass does not include (#2 and #3 without the 1-month pass). */
export function NotIncludedCard({ index }: { index: number }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <Card className="relative grid aspect-[1/1.2] place-items-center overflow-hidden p-8 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_14px,color-mix(in_oklch,var(--primary)_6%,transparent)_14px_28px)]" />
        <div className="relative">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 2.4 }}
            className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg"
          >
            <Crown className="size-7" />
          </motion.div>
          <p className="mt-4 font-display text-xl font-bold">Resume {index + 1} is ready for you</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            The <b className="text-foreground">{PLANS["1m"].label} pass</b> includes {PLANS["1m"].resumes} tailored resumes. Ask your
            admin to upgrade.
          </p>
        </div>
      </Card>
    </motion.div>
  );
}

function UnlockCard({ access }: { access: AccessState }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3, type: "spring", stiffness: 300, damping: 24 }}
      className="max-w-sm rounded-2xl border bg-card/95 p-5 text-center text-card-foreground shadow-xl backdrop-blur"
    >
      <motion.div
        animate={{ rotate: [0, -8, 8, -4, 0] }}
        transition={{ repeat: Infinity, repeatDelay: 2.5, duration: 0.6 }}
        className="mx-auto grid size-12 place-items-center rounded-full bg-primary/12 text-primary"
      >
        <Lock className="size-6" />
      </motion.div>
      <p className="mt-3 font-display text-lg font-bold">Unlock the full resume</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Full view and download open with a <b className="text-foreground">1-day pass or longer</b>.
        {access.active && access.plan ? ` You're on the ${PLANS[access.plan].label} pass.` : " Your access has ended."}
      </p>
      <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
        <Sparkles className="size-3.5" /> Ask your admin to upgrade
      </p>
    </motion.div>
  );
}

export function ResumeTabs({
  items,
  active,
  onChange,
  className,
}: {
  items: { key: number; title: string; locked?: boolean }[];
  active: number;
  onChange: (i: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1 rounded-full border bg-card p-0.5", className)} role="tablist">
      {items.map((it, i) => (
        <button
          key={it.key}
          role="tab"
          aria-selected={active === i}
          onClick={() => onChange(i)}
          className={cn(
            "relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            active === i ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {active === i && <motion.span layoutId="resume-tab" className="absolute inset-0 rounded-full bg-primary" />}
          <span className="relative inline-flex items-center gap-1.5">
            {it.locked ? <Crown className="size-3.5" /> : <FileText className="size-3.5" />}
            {it.title}
          </span>
        </button>
      ))}
    </div>
  );
}

/** The applicant's own resumes page. */
export function ResumeViewer({ userId }: { userId: number }) {
  const q = useResumeList(userId);
  const [tab, setTab] = useState(0);

  if (q.isLoading) return <div className="aspect-[1/1.41] w-full animate-pulse rounded-xl bg-muted" />;
  if (q.error) return <p className="text-sm text-careful">{q.error.message}</p>;
  const { resumes, access } = q.data!;
  if (!resumes.length) {
    return (
      <Card className="grid place-items-center p-10 text-center">
        <FileX2 className="size-10 text-muted-foreground" />
        <p className="mt-3 font-display text-lg font-bold">No resume uploaded yet</p>
        <p className="text-sm text-muted-foreground">Your admin will upload it for you.</p>
      </Card>
    );
  }

  const i = Math.min(tab, resumes.length - 1);
  const r = resumes[i]!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {resumes.length > 1 ? (
          <ResumeTabs
            items={resumes.map((x, n) => ({ key: x.id, title: resumeTitle(x, n), locked: !x.included }))}
            active={i}
            onChange={setTab}
          />
        ) : (
          <div>
            <p className="font-display text-lg font-bold">{resumeTitle(r, 0)}</p>
            <p className="text-xs text-muted-foreground">
              {r.pages} page{r.pages > 1 ? "s" : ""} · updated {new Date(r.uploadedAt).toLocaleDateString("en-IN")}
            </p>
          </div>
        )}
        {r.included &&
          (r.unlocked ? (
            <Button asChild variant="success">
              <a href={`/api/resume/${userId}/${r.id}/download`}>
                <Download /> Download PDF
              </a>
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Lock className="size-3.5" /> Download locked
            </span>
          ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={r.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
          {r.included ? <ResumePages userId={userId} resume={r} access={access} /> : <NotIncludedCard index={i} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
