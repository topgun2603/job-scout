"use client";

import { useEffect, useState } from "react";

/** Current time, re-rendering every `ms`. Starts at 0 on the server render to avoid hydration mismatches. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function msUntil(iso: string | undefined, now: number): number {
  return iso && now ? Math.max(0, new Date(iso).getTime() - now) : 0;
}
