"use client";

import { motion } from "framer-motion";
import { FileUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MAX = 5 * 1024 * 1024;

/** Drag-and-drop or click-to-pick PDF. Validates type and size before anything is uploaded. */
export function ResumeDrop({
  onFile,
  busy,
  current,
  compact,
}: {
  onFile: (f: File) => void;
  busy?: boolean;
  current?: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");

  const take = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return setError("Only PDF files are supported.");
    if (f.size > MAX) return setError("The PDF must be 5 MB or smaller.");
    setError("");
    onFile(f);
  };

  return (
    <div>
      <motion.button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files[0]);
        }}
        animate={{ scale: over ? 1.02 : 1 }}
        disabled={busy}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-center transition-colors",
          compact ? "p-4" : "p-8",
          over ? "border-primary bg-primary/8" : "border-border hover:border-primary/60 hover:bg-accent/40",
        )}
      >
        {busy ? (
          <Loader2 className="size-7 animate-spin text-primary" />
        ) : (
          <motion.span animate={over ? { y: -4 } : { y: 0 }} className="grid size-11 place-items-center rounded-full bg-primary/12 text-primary">
            <FileUp className="size-5" />
          </motion.span>
        )}
        <span className="text-sm font-medium">
          {busy ? "Uploading & reading skills…" : current ? "Drop a new PDF to replace" : "Drop the resume PDF here"}
        </span>
        <span className="text-xs text-muted-foreground">{current ? `Current: ${current}` : "or click to browse · PDF up to 5 MB"}</span>
      </motion.button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-2 text-xs font-medium text-careful">{error}</p>}
    </div>
  );
}
