"use client";

import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSkillCatalogue, type ProfileInput } from "@/hooks/use-admin";
import { TagInput } from "./tag-input";

export interface ProfileDraft {
  fullName: string;
  email: string;
  phone: string;
  graduationYear: string;
  locations: string[];
  coreSkills: string[];
  bonusSkills: string[];
  notes: string;
}

export const emptyDraft: ProfileDraft = {
  fullName: "",
  email: "",
  phone: "",
  graduationYear: "",
  locations: [],
  coreSkills: [],
  bonusSkills: [],
  notes: "",
};

export function draftFrom(u: {
  fullName: string;
  email?: string;
  phone?: string;
  graduationYear?: number;
  locations: string[];
  coreSkills: string[];
  bonusSkills: string[];
  notes?: string;
}): ProfileDraft {
  return {
    fullName: u.fullName,
    email: u.email ?? "",
    phone: u.phone ?? "",
    graduationYear: u.graduationYear ? String(u.graduationYear) : "",
    locations: u.locations,
    coreSkills: u.coreSkills,
    bonusSkills: u.bonusSkills,
    notes: u.notes ?? "",
  };
}

export function toInput(d: ProfileDraft): ProfileInput {
  const year = Number(d.graduationYear);
  return {
    fullName: d.fullName.trim(),
    email: d.email.trim() || null,
    phone: d.phone.trim() || null,
    graduationYear: d.graduationYear && Number.isInteger(year) ? year : null,
    locations: d.locations,
    coreSkills: d.coreSkills,
    bonusSkills: d.bonusSkills,
    notes: d.notes.trim() || null,
  };
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">
        {label} {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const without = (all: string[] | undefined, taken: string[]) =>
  (all ?? []).filter((s) => !taken.some((t) => t.toLowerCase() === s.toLowerCase()));

/** The editable profile fields, shared by the create form and the detail view. */
export function ProfileFields({ draft, set }: { draft: ProfileDraft; set: (d: ProfileDraft) => void }) {
  const cat = useSkillCatalogue().data;
  const up = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => set({ ...draft, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <Input value={draft.fullName} onChange={(e) => up("fullName", e.target.value)} required />
        </Field>
        <Field label="Graduation year" hint="(batch filter)">
          <Input
            inputMode="numeric"
            value={draft.graduationYear}
            onChange={(e) => up("graduationYear", e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="2025"
          />
        </Field>
        <Field label="Email">
          <Input type="email" value={draft.email} onChange={(e) => up("email", e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={draft.phone} onChange={(e) => up("phone", e.target.value)} />
        </Field>
      </div>
      <Field label="Core skills" hint="(5 pts each in scoring)">
        <TagInput
          value={draft.coreSkills}
          onChange={(v) => up("coreSkills", v)}
          suggestions={without(cat?.all, draft.bonusSkills)}
          placeholder="React, JavaScript…"
        />
      </Field>
      <Field label="Bonus skills" hint="(2 pts each)">
        <TagInput
          value={draft.bonusSkills}
          onChange={(v) => up("bonusSkills", v)}
          // core-catalogue skills go last so the quick chips lead with typical bonus skills
          suggestions={without([...(cat?.all ?? []).filter((s) => !cat?.core.includes(s)), ...(cat?.core ?? [])], draft.coreSkills)}
          tone="muted"
          placeholder="TypeScript, Redux…"
        />
      </Field>
      <Field label="Preferred cities" hint="(empty = default list)">
        <TagInput value={draft.locations} onChange={(v) => up("locations", v)} suggestions={cat?.cities} tone="muted" placeholder="Chennai, Remote…" />
      </Field>
      <Field label="Notes" hint="(admin only)">
        <textarea
          value={draft.notes}
          onChange={(e) => up("notes", e.target.value)}
          rows={2}
          className="w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />
      </Field>
    </div>
  );
}

export function ProfileForm({
  initial,
  onSave,
  saving,
}: {
  initial: ProfileDraft;
  onSave: (i: ProfileInput) => Promise<unknown>;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!draft.fullName.trim()) return toast.error("Full name is required");
        await onSave(toInput(draft));
        toast.success("Profile saved", { description: "Their job matches are re-scored with these skills." });
      }}
      className="space-y-4"
    >
      <ProfileFields draft={draft} set={setDraft} />
      <div className="flex justify-end">
        <Button type="submit" disabled={!dirty || saving}>
          <Save /> {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
