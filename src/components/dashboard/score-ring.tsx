"use client";

import { motion } from "framer-motion";
import type { Bucket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CountUp } from "./count-up";

const color: Record<Bucket, string> = {
  strong: "var(--strong)",
  maybe: "var(--maybe)",
  careful: "var(--careful)",
  low: "var(--low)",
};

export function ScoreRing({ score, bucket, size = 60, className }: { score: number; bucket: Bucket; size?: number; className?: string }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted" />
        <motion.circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color[bucket]}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - score / 100) }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        />
      </svg>
      <CountUp value={score} className="font-display text-lg font-bold tabular-nums" />
    </div>
  );
}
