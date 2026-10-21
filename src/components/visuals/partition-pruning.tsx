"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Segmented, Stat, VisualFrame, fmtCount } from "./scale-visual-parts";

const VISUAL = "partition-pruning";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROWS_PER_MONTH = 25_000_000; // 300M rows in the year
const CURRENT = 11; // index of the "current" month (Dec)

type QueryId = "week" | "march" | "quarter" | "user";

const QUERIES: Record<QueryId, { label: string; sql: string; touched: number[] | "all"; note: string }> = {
  week: {
    label: "Bookings this week",
    sql: "WHERE created_at >= now() - interval '7 days'",
    touched: [CURRENT],
    note: "The filter is on the partition key, so the planner can skip eleven partitions before reading a single row.",
  },
  march: {
    label: "March report",
    sql: "WHERE created_at >= '2025-03-01' AND created_at < '2025-04-01'",
    touched: [2],
    note: "One month, one partition. Dropping or archiving March later is a single instant operation.",
  },
  quarter: {
    label: "Q4 revenue",
    sql: "WHERE created_at >= '2025-10-01'",
    touched: [9, 10, 11],
    note: "Three partitions are read. Still a quarter of the work.",
  },
  user: {
    label: "All of one fan's bookings",
    sql: "WHERE user_id = 48210",
    touched: "all",
    note: "No filter on the partition key, so every partition must be checked. Partitioning did not help, and it can make this slightly slower than one big table.",
  },
};

export function PartitionPruning() {
  const [mode, setMode] = useState<"on" | "off">("on");
  const [q, setQ] = useState<QueryId>("week");
  const query = QUERIES[q];

  const partitioned = mode === "on";
  const touched = !partitioned || query.touched === "all" ? MONTHS.map((_, i) => i) : query.touched;
  const total = MONTHS.length * ROWS_PER_MONTH;

  // Rough model: with a usable index, a query reads a share of the touched rows.
  const scanned = partitioned ? touched.length * ROWS_PER_MONTH : total;
  const ms = Math.round(12 + (scanned / total) * 880);

  return (
    <VisualFrame
      title="Which partitions does the query read?"
      hint="A 300-million-row bookings table, split into one partition per month. Pick a query and turn partitioning on and off."
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented
          visual={VISUAL}
          label="Partitioning"
          value={mode}
          onChange={setMode}
          options={[
            { value: "on", label: "Partitioned by month" },
            { value: "off", label: "One big table" },
          ]}
        />
      </div>
      <div className="mt-3">
        <Segmented
          visual={VISUAL}
          label="Query"
          value={q}
          onChange={setQ}
          options={(Object.keys(QUERIES) as QueryId[]).map((k) => ({ value: k, label: QUERIES[k].label }))}
        />
      </div>

      <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-sunken px-3 py-2 font-mono text-[12px] text-muted">
        SELECT * FROM bookings {query.sql}
      </pre>

      <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
        {partitioned ? (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12" aria-label="Monthly partitions">
            {MONTHS.map((m, i) => {
              const hit = touched.includes(i);
              return (
                <li
                  key={m}
                  className={cn(
                    "rounded-lg border px-1 py-2 text-center transition-colors",
                    hit ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-subtle opacity-60",
                  )}
                >
                  <p className="font-mono text-[11px] uppercase">{m}</p>
                  <p className="text-[10.5px]">{hit ? "scanned" : "pruned"}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <div
            className="rounded-lg border border-accent bg-accent-soft px-3 py-6 text-center text-accent"
            aria-label="One big table"
          >
            <p className="font-mono text-[11px] uppercase">bookings</p>
            <p className="text-[12px]">one table, one set of huge indexes</p>
          </div>
        )}
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          {partitioned ? query.note : "Every query searches the same enormous table and its enormous indexes, whatever date it asks about."}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Partitions read" value={partitioned ? `${touched.length} / 12` : "1 / 1"} />
        <Stat label="Rows in range" value={fmtCount(scanned)} tone={scanned < total ? "ok" : "warn"} />
        <Stat label="Est. time" value={`${ms} ms`} tone={ms < 200 ? "ok" : ms > 600 ? "err" : "warn"} sub="illustrative" />
      </div>
    </VisualFrame>
  );
}
