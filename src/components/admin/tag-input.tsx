"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/** Chips input: Enter or comma adds, Backspace on empty removes the last chip, suggestions via datalist. */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  tone = "primary",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  tone?: "primary" | "muted";
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const has = (s: string) => value.some((v) => v.toLowerCase() === s.toLowerCase());

  const add = (raw: string) => {
    const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const next = [...value];
    for (const it of items) {
      // Snap to the catalogue's spelling ("reactjs" -> keep, "react" -> "React")
      const canonical = suggestions.find((s) => s.toLowerCase() === it.toLowerCase()) ?? it;
      if (!next.some((v) => v.toLowerCase() === canonical.toLowerCase())) next.push(canonical);
    }
    onChange(next);
    setDraft("");
  };

  const quick = suggestions.filter((s) => !has(s)).slice(0, 8);

  return (
    <div className="space-y-2">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-2xl border border-input bg-card px-2 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40">
        <AnimatePresence initial={false}>
          {value.map((v) => (
            <motion.span
              key={v}
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium",
                tone === "primary" ? "bg-primary/12 text-primary" : "bg-muted text-foreground",
              )}
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                className="rounded-full p-0.5 hover:bg-foreground/10"
                aria-label={`Remove ${v}`}
              >
                <X className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          list={listId}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            // Picking from the datalist fires a change with the full value
            if (suggestions.some((s) => s === v)) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <datalist id={listId}>
          {suggestions.filter((s) => !has(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {quick.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {quick.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Plus className="size-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
