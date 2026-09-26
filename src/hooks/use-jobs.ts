"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Thresholds } from "@/lib/bucket";
import type { JobRow, JobStatus, RunRow } from "@/lib/types";

export interface JobsPayload {
  jobs: JobRow[];
  thresholds: Thresholds;
  profile: { name: string; graduationYear: number; weeklyGoal: number };
  runs: RunRow[];
  /** 1-hour preview pass: browse only, no apply links or Applied / Skip. */
  readOnly?: boolean;
}

interface ScoutStatus {
  running: boolean;
  log: string[];
  runs: RunRow[];
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

export const JOBS_KEY = ["jobs"] as const;

export function useJobs() {
  return useQuery({ queryKey: JOBS_KEY, queryFn: () => http<JobsPayload>("/api/jobs") });
}

export function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: Exclude<JobStatus, "filtered"> }) =>
      http<{ ok: true }>(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    // Optimistic: the card animates away immediately, rolls back if the server says no.
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: JOBS_KEY });
      const prev = qc.getQueryData<JobsPayload>(JOBS_KEY);
      qc.setQueryData<JobsPayload>(JOBS_KEY, (d) =>
        d && {
          ...d,
          jobs: d.jobs.map((j) => (j.id === id ? { ...j, status, statusChangedAt: new Date().toISOString() } : j)),
        },
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(JOBS_KEY, ctx.prev);
      toast.error(`Could not update: ${e.message}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: JOBS_KEY }),
  });
}

export function useRescore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => http<{ evaluated: number; kept: number; filtered: number }>("/api/rescore", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`Rescored ${r.evaluated} jobs`, { description: `${r.kept} on the shortlist, ${r.filtered} filtered out` });
      qc.invalidateQueries({ queryKey: JOBS_KEY });
    },
    onError: (e) => toast.error("Rescore failed", { description: e.message }),
  });
}

/** Starts a scout run and polls it; refreshes jobs and celebrates when it ends. */
export function useScout(enabled = true) {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["scout"],
    queryFn: () => http<ScoutStatus>("/api/scout"),
    enabled,
    refetchInterval: (q) => (q.state.data?.running ? 1500 : false),
  });
  const start = useMutation({
    mutationFn: () => http("/api/scout", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scout"] }),
    onError: (e) => toast.error("Could not start scouting", { description: e.message }),
  });

  const wasRunning = useRef(false);
  const running = !!status.data?.running;
  useEffect(() => {
    if (wasRunning.current && !running) {
      const last = status.data?.runs[0];
      qc.invalidateQueries({ queryKey: JOBS_KEY });
      if (last?.status === "ok") {
        toast.success(last.inserted ? `${last.inserted} new jobs found!` : "No new jobs this time", {
          description: last.message,
        });
      } else if (last) {
        toast.error("Scout run failed", { description: last.message });
      }
    }
    wasRunning.current = running;
  }, [running, status.data, qc]);

  return { running: running || start.isPending, log: status.data?.log ?? [], start: () => start.mutate() };
}
