"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, Check, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bucketOf, expLabel, postedLabel, type Thresholds } from "@/lib/bucket";
import type { JobRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const col = createColumnHelper<JobRow>();

const scoreColor = { strong: "bg-strong", maybe: "bg-maybe", careful: "bg-careful", low: "bg-low" } as const;

export function JobTable({
  jobs,
  thresholds,
  readOnly,
  onApply,
  onSkip,
  onRestore,
  onOpen,
}: {
  jobs: JobRow[];
  thresholds: Thresholds;
  readOnly?: boolean;
  onApply: (j: JobRow) => void;
  onSkip: (j: JobRow) => void;
  onRestore: (j: JobRow) => void;
  onOpen: (j: JobRow) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      col.accessor("score", {
        header: "Score",
        cell: (c) => {
          const b = bucketOf(c.row.original, thresholds);
          return (
            <div className="flex items-center gap-2">
              <span className={cn("size-2.5 rounded-full", scoreColor[b])} />
              <span className="font-display font-bold tabular-nums">{c.getValue()}</span>
            </div>
          );
        },
      }),
      col.accessor("title", {
        header: "Role",
        cell: (c) => (
          <div className="min-w-56">
            {readOnly ? (
              <span className="font-medium">{c.getValue()}</span>
            ) : (
              <button onClick={() => onOpen(c.row.original)} className="text-left font-medium hover:text-primary hover:underline">
                {c.getValue()}
              </button>
            )}
            <div className="text-xs text-muted-foreground">{c.row.original.company}</div>
          </div>
        ),
      }),
      col.accessor((j) => j.location.join(", "), {
        id: "location",
        header: "Location",
        cell: (c) => <span className="line-clamp-1 max-w-44 text-muted-foreground">{c.getValue() || "—"}</span>,
      }),
      col.accessor((j) => j.expMin ?? 99, {
        id: "exp",
        header: "Exp",
        cell: (c) => <span className="whitespace-nowrap">{expLabel(c.row.original.expMin, c.row.original.expMax) ?? "—"}</span>,
      }),
      col.accessor((j) => j.matchedSkills.length, {
        id: "skills",
        header: "Skills hit",
        cell: (c) => (
          <span className="line-clamp-1 max-w-48 text-xs text-muted-foreground" title={c.row.original.matchedSkills.join(", ")}>
            <b className="text-foreground">{c.getValue()}</b> {c.row.original.matchedSkills.slice(0, 3).join(", ")}
          </span>
        ),
      }),
      col.accessor((j) => (j.postedAt ? new Date(j.postedAt).getTime() : 0), {
        id: "posted",
        header: "Posted",
        cell: (c) => <span className="whitespace-nowrap text-muted-foreground">{postedLabel(c.row.original.postedAt)}</span>,
      }),
      col.display({
        id: "actions",
        header: "",
        cell: (c) => {
          const j = c.row.original;
          return (
            <div className="flex justify-end gap-1">
              {j.status === "new" ? (
                <>
                  <Button variant="ghost" size="icon-sm" onClick={() => onSkip(j)} aria-label="Skip">
                    <X />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => onApply(j)} aria-label="Mark applied" className="text-strong">
                    <Check />
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="icon-sm" onClick={() => onRestore(j)} aria-label="Back to shortlist">
                  <Undo2 />
                </Button>
              )}
              <Button variant="outline" size="icon-sm" onClick={() => onOpen(j)} aria-label="Open posting">
                <ArrowUpRight />
              </Button>
            </div>
          );
        },
      }),
    ],
    [thresholds, readOnly, onApply, onSkip, onRestore, onOpen],
  );
  const visibleColumns = useMemo(() => (readOnly ? columns.filter((c) => c.id !== "actions") : columns), [columns, readOnly]);

  const table = useReactTable({
    data: jobs,
    columns: visibleColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (j) => String(j.id),
  });

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => (
                <TableHead key={h.id}>
                  {h.column.getCanSort() ? (
                    <button onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 uppercase hover:text-foreground">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {{ asc: <ArrowUp className="size-3" />, desc: <ArrowDown className="size-3" /> }[h.column.getIsSorted() as string] ?? (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    flexRender(h.column.columnDef.header, h.getContext())
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((r) => (
            <TableRow key={r.id}>
              {r.getVisibleCells().map((c) => (
                <TableCell key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
