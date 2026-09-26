"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, Pencil, ScanSearch, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ResumePages, ResumeTabs, resumeTitle, useResumeList } from "@/components/resume/resume-viewer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDetectSkills, useRelabelResume, useRemoveResume, useUploadResume, type Applicant, type Detected } from "@/hooks/use-admin";
import { MAX_RESUMES, PLANS } from "@/lib/access";
import { cn } from "@/lib/utils";
import { ResumeDrop } from "./resume-drop";

function Slots({ used }: { used: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${used} of ${MAX_RESUMES} resumes`}>
      {Array.from({ length: MAX_RESUMES }, (_, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ scale: i < used ? 1 : 0.8 }}
          className={cn("h-2 w-5 rounded-full", i < used ? "bg-primary" : "bg-muted")}
        />
      ))}
      <span className="ml-1 text-xs tabular-nums text-muted-foreground">
        {used}/{MAX_RESUMES}
      </span>
    </span>
  );
}

/** Admin: up to 3 resume versions per applicant; the pass decides how many they see. */
export function ResumesSection({ user, onDetected }: { user: Applicant; onDetected: (d: Detected) => void }) {
  const list = useResumeList(user.id);
  const upload = useUploadResume();
  const remove = useRemoveResume(user.id);
  const relabel = useRelabelResume(user.id);
  const detect = useDetectSkills(user.id);
  const [tab, setTab] = useState(0);
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const resumes = list.data?.resumes ?? [];
  const i = Math.min(tab, Math.max(0, resumes.length - 1));
  const r = resumes[i];
  const first = user.fullName.split(" ")[0];
  const sees = user.access.active ? user.access.resumeLimit : 1;

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold">Resumes</h3>
        <Slots used={resumes.length} />
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {first} sees {sees === 1 ? "the first resume" : `all ${sees}`}
        {user.access.resumeUnlocked ? " in full, with download" : " half-blurred, no download"}. The {PLANS["1m"].label} pass shows all{" "}
        {PLANS["1m"].resumes}.
      </p>

      {resumes.length < MAX_RESUMES && (
        <div className="mb-4 space-y-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder='Label, e.g. "Frontend" or "MERN" (optional)' maxLength={40} />
          <ResumeDrop
            compact={resumes.length > 0}
            busy={upload.isPending}
            onFile={(file) =>
              upload.mutate(
                { id: user.id, file, label },
                {
                  onSuccess: (res) => {
                    toast.success("Resume added", { description: `${res.user.resumes.length} of ${MAX_RESUMES} slots used` });
                    setLabel("");
                    setTab(res.user.resumes.length - 1);
                    onDetected(res.detected);
                  },
                  onError: (e) => toast.error("Upload failed", { description: e.message }),
                },
              )
            }
          />
        </div>
      )}

      {r && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {resumes.length > 1 ? (
              <ResumeTabs
                items={resumes.map((x, n) => ({ key: x.id, title: resumeTitle(x, n), locked: n >= sees }))}
                active={i}
                onChange={(n) => {
                  setTab(n);
                  setEditing(null);
                }}
              />
            ) : (
              <span className="text-sm font-medium">{resumeTitle(r, 0)}</span>
            )}
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" aria-label="Rename" onClick={() => setEditing(r.label ?? "")}>
                <Pencil />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={detect.isPending}
                onClick={() => detect.mutate(r.id, { onSuccess: onDetected })}
              >
                <ScanSearch /> {detect.isPending ? "Reading…" : "Detect skills"}
              </Button>
              <Button size="icon-sm" variant="ghost" asChild aria-label="Download">
                <a href={`/api/resume/${user.id}/${r.id}/download`}>
                  <Download />
                </a>
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Remove resume"
                onClick={() =>
                  confirm(`Remove "${resumeTitle(r, i)}"?`) &&
                  remove.mutate(r.id, {
                    onSuccess: () => {
                      toast("Resume removed");
                      setTab(0);
                    },
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>
          </div>

          <AnimatePresence>
            {editing !== null && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3 flex gap-2 overflow-hidden"
                onSubmit={(e) => {
                  e.preventDefault();
                  relabel.mutate({ rid: r.id, label: editing || null }, { onSuccess: () => setEditing(null) });
                }}
              >
                <Input value={editing} onChange={(e) => setEditing(e.target.value)} maxLength={40} autoFocus placeholder="Label" />
                <Button type="submit" size="icon" aria-label="Save label">
                  <Check />
                </Button>
              </motion.form>
            )}
          </AnimatePresence>

          <p className="mb-2 text-xs text-muted-foreground">
            {r.name} · {r.pages} page{r.pages > 1 ? "s" : ""}
            {i >= sees && <b className="ml-1 text-maybe"> · hidden from {first} until the {PLANS["1m"].label} pass</b>}
          </p>
          <div className="max-h-[70vh] overflow-y-auto rounded-xl">
            <ResumePages userId={user.id} resume={r} access={list.data!.access} />
          </div>
        </>
      )}
    </Card>
  );
}
