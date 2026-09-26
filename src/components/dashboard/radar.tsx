"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** The scout's radar: sweeps slowly at rest, fast with pinging blips while a run is going. */
export function Radar({ active, className }: { active: boolean; className?: string }) {
  const blips = [
    { x: 30, y: 22, d: 0.2 },
    { x: 44, y: 38, d: 0.9 },
    { x: 20, y: 40, d: 1.5 },
  ];
  return (
    <div className={cn("relative size-14 shrink-0 overflow-hidden rounded-full bg-primary/10 ring-1 ring-primary/25", className)}>
      <svg viewBox="0 0 56 56" className="absolute inset-0 size-full text-primary">
        {[26, 18, 10].map((r) => (
          <circle key={r} cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeOpacity={0.22} />
        ))}
        <line x1="28" y1="2" x2="28" y2="54" stroke="currentColor" strokeOpacity={0.12} />
        <line x1="2" y1="28" x2="54" y2="28" stroke="currentColor" strokeOpacity={0.12} />
      </svg>
      <motion.div
        className="absolute inset-0"
        style={{ background: "conic-gradient(from 0deg, transparent 0deg, color-mix(in oklch, var(--primary) 55%, transparent) 50deg, transparent 60deg)" }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, ease: "linear", duration: active ? 1.2 : 6 }}
      />
      {blips.map((b, i) => (
        <motion.span
          key={i}
          className="absolute size-1.5 rounded-full bg-lime shadow-[0_0_8px_var(--lime)]"
          style={{ left: b.x, top: b.y }}
          animate={active ? { scale: [0, 1.6, 1], opacity: [0, 1, 0] } : { scale: 1, opacity: 0.8 }}
          transition={active ? { repeat: Infinity, duration: 1.2, delay: b.d } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}
