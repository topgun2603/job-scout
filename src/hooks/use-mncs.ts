"use client";

import { useQuery } from "@tanstack/react-query";
import type { MncCompany, MncItem } from "@/lib/mnc";

export interface MncPayload {
  roles: MncItem[];
  /** Admins only: every company checked, including blocked and no-match ones. */
  companies?: MncCompany[];
  checkedAt?: string;
  /** 1-hour preview: no apply links, and roles past the first few are locked. */
  readOnly: boolean;
}

export function useMncs() {
  return useQuery({
    queryKey: ["mncs"],
    queryFn: async () => {
      const res = await fetch("/api/mncs");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
      return body as MncPayload;
    },
  });
}
