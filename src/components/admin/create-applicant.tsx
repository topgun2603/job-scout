"use client";

import { motion } from "framer-motion";
import { Check, Copy, UserPlus, Wand2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { generatePassword, patchApplicant, useCreateApplicant, useUploadResume, usernameFrom, type Applicant } from "@/hooks/use-admin";
import { emptyDraft, Field, ProfileFields, toInput, type ProfileDraft } from "./profile-form";
import { ResumeDrop } from "./resume-drop";

function Credentials({ user, password, onClose }: { user: Applicant; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Job Scout login\nUsername: ${user.username}\nPassword: ${password}`;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <Card className="relative overflow-hidden p-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 14 }}
          className="mx-auto grid size-14 place-items-center rounded-full bg-strong text-white"
        >
          <Check className="size-7" />
        </motion.div>
        <h3 className="mt-4 font-display text-xl font-bold">{user.fullName} is set up</h3>
        <p className="text-sm text-muted-foreground">Share these credentials. The password is not shown again.</p>
        <div className="mx-auto mt-4 max-w-xs rounded-2xl bg-muted p-4 text-left font-mono text-sm">
          <div>
            <span className="text-muted-foreground">username</span> {user.username}
          </div>
          <div>
            <span className="text-muted-foreground">password</span> {password}
          </div>
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(text).then(() => setCopied(true));
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy both"}
          </Button>
          <Button onClick={onClose}>Open profile</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Next: grant a pass so they can sign in and see jobs.</p>
      </Card>
    </motion.div>
  );
}

export function CreateApplicant({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: number) => void }) {
  const create = useCreateApplicant();
  const upload = useUploadResume();
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [username, setUsername] = useState("");
  const [touchedUser, setTouchedUser] = useState(false);
  const [password, setPassword] = useState(() => generatePassword());
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState<Applicant | null>(null);
  const [patching, setPatching] = useState(false);
  const qc = useQueryClient();

  const setDraftAndUser = (d: ProfileDraft) => {
    setDraft(d);
    if (!touchedUser) setUsername(usernameFrom(d.fullName));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const input = toInput(draft);
      const user = await create.mutateAsync({ ...input, fullName: input.fullName ?? "", username, password });
      let final = user;
      if (file) {
        try {
          const r = await upload.mutateAsync({ id: user.id, file });
          final = r.user;
          // "Based on the resume": if no skills were typed in, take them from the PDF.
          if (!user.coreSkills.length && !user.bonusSkills.length && (r.detected.core.length || r.detected.bonus.length)) {
            setPatching(true);
            final = await patchApplicant(user.id, { coreSkills: r.detected.core, bonusSkills: r.detected.bonus }).finally(() => setPatching(false));
            qc.invalidateQueries({ queryKey: ["admin"] });
            toast.success(`Read ${r.detected.core.length + r.detected.bonus.length} skills from the resume`);
          }
        } catch (err) {
          toast.error("Applicant created, but the resume upload failed", { description: (err as Error).message });
        }
      }
      setDone(final);
    } catch (err) {
      toast.error("Could not create applicant", { description: (err as Error).message });
    }
  };

  if (done) return <Credentials user={done} password={password} onClose={() => onCreated(done.id)} />;

  const busy = create.isPending || upload.isPending || patching;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">New applicant</h2>
          <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Cancel">
            <X />
          </Button>
        </div>
        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <ProfileFields draft={draft} set={setDraftAndUser} />
          </div>
          <div className="space-y-4">
            <Field label="Username">
              <Input
                value={username}
                onChange={(e) => {
                  setTouchedUser(true);
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""));
                }}
                className="font-mono"
                required
                minLength={3}
              />
            </Field>
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="block text-sm font-medium">
                Password
              </label>
              <div className="flex gap-2">
                <Input
                  id="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono"
                  required
                  minLength={8}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setPassword(generatePassword())} aria-label="Generate password">
                  <Wand2 />
                </Button>
              </div>
            </div>
            <Field label="Resume" hint="(optional, PDF)">
              <ResumeDrop compact onFile={setFile} current={file?.name} />
            </Field>
            {file && !draft.coreSkills.length && !draft.bonusSkills.length && (
              <p className="text-xs text-muted-foreground">No skills typed in, so they will be read from the resume.</p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              <UserPlus /> {busy ? "Creating…" : "Create applicant"}
            </Button>
          </div>
        </form>
      </Card>
    </motion.div>
  );
}
