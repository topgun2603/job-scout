"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PlanId } from "@/lib/access";
import type { AccessLogEntry, PublicUser } from "@/lib/users";

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(url, { ...init, headers: isForm ? init?.headers : { "content-type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

export type Applicant = PublicUser;
export interface ProfileInput {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  graduationYear?: number | null;
  locations?: string[];
  coreSkills?: string[];
  bonusSkills?: string[];
  notes?: string | null;
  password?: string;
  disabled?: boolean;
}
export interface Detected {
  core: string[];
  bonus: string[];
}

const USERS = ["admin", "users"] as const;
const userKey = (id: number) => ["admin", "user", id] as const;

export function useApplicants() {
  return useQuery({ queryKey: USERS, queryFn: () => http<{ users: Applicant[] }>("/api/admin/users").then((r) => r.users) });
}

export function useApplicant(id: number | null) {
  return useQuery({
    queryKey: userKey(id ?? 0),
    queryFn: () => http<{ user: Applicant; log: AccessLogEntry[] }>(`/api/admin/users/${id}`),
    enabled: id !== null,
  });
}

export function useSkillCatalogue() {
  return useQuery({
    queryKey: ["admin", "skills"],
    queryFn: () => http<{ all: string[]; core: string[]; cities: string[] }>("/api/admin/skills"),
    staleTime: Infinity,
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return (id?: number) => {
    qc.invalidateQueries({ queryKey: USERS });
    if (id) {
      qc.invalidateQueries({ queryKey: userKey(id) });
      qc.invalidateQueries({ queryKey: ["resume", id] });
    }
  };
}

const fail = (title: string) => (e: Error) => toast.error(title, { description: e.message });

export function useCreateApplicant() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: ProfileInput & { username: string; password: string; fullName: string }) =>
      http<Applicant>("/api/admin/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => refresh(),
  });
}

/** For flows where the id is only known mid-way (create, then patch). */
export function patchApplicant(id: number, body: ProfileInput) {
  return http<Applicant>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function useUpdateApplicant(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: ProfileInput) => http<Applicant>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => refresh(id),
    onError: fail("Could not save"),
  });
}

export function useDeleteApplicant() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: number) => http(`/api/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => refresh(),
    onError: fail("Could not delete"),
  });
}

export function useGrant(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (plan: PlanId) => http<{ user: Applicant }>(`/api/admin/users/${id}/access`, { method: "POST", body: JSON.stringify({ plan }) }),
    onSuccess: () => refresh(id),
    onError: fail("Could not grant access"),
  });
}

export function useRevoke(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: () => http<{ user: Applicant }>(`/api/admin/users/${id}/access`, { method: "DELETE" }),
    onSuccess: () => refresh(id),
    onError: fail("Could not revoke"),
  });
}

export function useUploadResume() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, file, label }: { id: number; file: File; label?: string }) => {
      const form = new FormData();
      form.append("resume", file);
      if (label) form.append("label", label);
      return http<{ user: Applicant; detected: Detected }>(`/api/admin/users/${id}/resumes`, { method: "POST", body: form });
    },
    onSuccess: (_r, v) => refresh(v.id),
  });
}

export function useRemoveResume(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (rid: number) => http(`/api/admin/users/${id}/resumes/${rid}`, { method: "DELETE" }),
    onSuccess: () => refresh(id),
    onError: fail("Could not remove resume"),
  });
}

export function useRelabelResume(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ rid, label }: { rid: number; label: string | null }) =>
      http(`/api/admin/users/${id}/resumes/${rid}`, { method: "PATCH", body: JSON.stringify({ label }) }),
    onSuccess: () => refresh(id),
    onError: fail("Could not rename resume"),
  });
}

export function useDetectSkills(id: number) {
  return useMutation({
    mutationFn: (rid: number) => http<{ detected: Detected }>(`/api/admin/users/${id}/resumes/${rid}`).then((r) => r.detected),
    onError: fail("Could not read resume"),
  });
}

/** Readable random password (no 0/O/1/l). */
export function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function usernameFrom(fullName: string): string {
  return fullName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(".")
    .slice(0, 24);
}
