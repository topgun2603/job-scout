"use client";

import { motion } from "framer-motion";
import { Copy, KeyRound, Power, ScanSearch, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  generatePassword,
  useApplicant,
  useDeleteApplicant,
  useDetectSkills,
  useRemoveResume,
  useUpdateApplicant,
  useUploadResume,
  type Applicant,
  type Detected,
} from "@/hooks/use-admin";
import { AccessCard } from "./access-card";
import { draftFrom, ProfileForm } from "./profile-form";
import { ResumesSection } from "./resumes-section";

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

function DetectedSkills({ user, detected, onDone }: { user: Applicant; detected: Detected; onDone: () => void }) {
  const update = useUpdateApplicant(user.id);
  const newCore = detected.core.filter((s) => !user.coreSkills.includes(s));
  const newBonus = detected.bonus.filter((s) => !user.bonusSkills.includes(s) && !user.coreSkills.includes(s));
  if (!newCore.length && !newBonus.length) {
    return <p className="mt-3 text-xs text-muted-foreground">Every skill in the resume is already on the profile.</p>;
  }
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
      <p className="text-xs font-medium">Found in the resume:</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {newCore.map((s) => (
          <span key={s} className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
            {s}
          </span>
        ))}
        {newBonus.map((s) => (
          <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {s}
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={() =>
            update.mutate(
              { coreSkills: [...user.coreSkills, ...newCore], bonusSkills: [...user.bonusSkills, ...newBonus] },
              {
                onSuccess: () => {
                  toast.success(`Added ${newCore.length + newBonus.length} skills`);
                  onDone();
                },
              },
            )
          }
        >
          <Wand2 /> Add to profile
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Dismiss
        </Button>
      </div>
    </motion.div>
  );
}

function PasswordReset({ user }: { user: Applicant }) {
  const update = useUpdateApplicant(user.id);
  const [pw, setPw] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate(
          { password: pw },
          {
            onSuccess: () => {
              navigator.clipboard?.writeText(pw).catch(() => {});
              toast.success("Password changed", { description: "Copied to clipboard. They were signed out everywhere." });
              setPw("");
            },
          },
        );
      }}
    >
      <Input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (8+ chars)" className="min-w-40 flex-1 font-mono" />
      <Button type="button" variant="outline" size="icon" onClick={() => setPw(generatePassword())} aria-label="Generate password">
        <Wand2 />
      </Button>
      <Button type="submit" variant="secondary" disabled={pw.length < 8 || update.isPending}>
        <KeyRound /> Set
      </Button>
    </form>
  );
}

export function ApplicantDetail({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const q = useApplicant(id);
  const update = useUpdateApplicant(id);
  const del = useDeleteApplicant();
  const [detected, setDetected] = useState<Detected | null>(null);

  const user = q.data?.user;
  const initial = useMemo(() => (user ? draftFrom(user) : null), [user]);

  if (q.isLoading || !user || !initial) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  return (
    <motion.div key={id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.7_0.2_330)] font-display text-lg font-bold text-white">
          {user.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-2xl font-extrabold tracking-tight">{user.fullName}</h2>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(user.username).catch(() => {});
              toast("Username copied");
            }}
            className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            @{user.username} <Copy className="size-3" />
          </button>
          {user.disabled && <span className="ml-2 rounded-full bg-careful/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-careful">disabled</span>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <AccessCard user={user} log={q.data!.log} />
          <Section title="Profile & skill stack">
            <ProfileForm initial={initial} saving={update.isPending} onSave={(input) => update.mutateAsync(input)} />
          </Section>
          <Section title="Account">
            <div className="space-y-4">
              <PasswordReset user={user} />
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update.mutate({ disabled: !user.disabled }, { onSuccess: () => toast(user.disabled ? "Account enabled" : "Account disabled") })
                  }
                >
                  <Power /> {user.disabled ? "Enable account" : "Disable account"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-careful hover:text-careful"
                  onClick={() => {
                    if (!confirm(`Delete ${user.fullName}? Their resumes and history are removed too.`)) return;
                    del.mutate(user.id, {
                      onSuccess: () => {
                        toast(`Deleted ${user.fullName}`);
                        onDeleted();
                      },
                    });
                  }}
                >
                  <Trash2 /> Delete applicant
                </Button>
              </div>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <ResumesSection user={user} onDetected={setDetected} />
          {detected && <DetectedSkills user={user} detected={detected} onDone={() => setDetected(null)} />}
        </div>
      </div>
    </motion.div>
  );
}
