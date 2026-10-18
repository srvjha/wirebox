"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Toggle, VisualFrame, compact, duration } from "./foundations-kit";

type Rung = { key: string; label: string; where: string; ns: number; tone: string };

const rungs: Rung[] = [
  { key: "l1", label: "L1 cache read", where: "inside the CPU core", ns: 1, tone: "bg-ok" },
  { key: "ram", label: "Main memory (RAM) read", where: "same machine", ns: 100, tone: "bg-ok" },
  { key: "ssd", label: "SSD random read (4 KB)", where: "same machine", ns: 100_000, tone: "bg-info" },
  { key: "dc", label: "Round trip in a data centre", where: "server → database", ns: 500_000, tone: "bg-info" },
  { key: "hdd", label: "Spinning disk seek", where: "old-school storage", ns: 5_000_000, tone: "bg-warn" },
  { key: "eu", label: "Round trip Mumbai ↔ Frankfurt", where: "across continents", ns: 130_000_000, tone: "bg-err" },
  { key: "us", label: "Round trip Mumbai ↔ California", where: "half the planet", ns: 230_000_000, tone: "bg-err" },
];

const MAX = Math.log10(rungs[rungs.length - 1].ns) + 0.5;

/** Seconds as a human span: "1.7 min", "3.8 days", "7.3 years". */
function human(seconds: number) {
  const units: [number, string][] = [
    [365 * 86400, "years"],
    [30 * 86400, "months"],
    [86400, "days"],
    [3600, "hours"],
    [60, "minutes"],
    [1, "seconds"],
  ];
  for (const [s, name] of units) {
    if (seconds >= s) {
      const v = seconds / s;
      return `${v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)} ${v === 1 ? name.slice(0, -1) : name}`;
    }
  }
  return `${seconds} s`;
}

/** Log-scale latency ladder with a "1 ns = 1 s" human-scale view. */
export function LatencyLadder() {
  const [humanScale, setHumanScale] = useState(false);
  const [picked, setPicked] = useState("dc");
  const sel = rungs.find((r) => r.key === picked)!;

  return (
    <VisualFrame
      title="How long things take"
      caption="Bars use a log scale: each step right is ten times longer. Pick a row to compare it with a memory read; flip the toggle to stretch time so one nanosecond lasts a second."
    >
      <Toggle
        label="If 1 nanosecond were 1 second"
        hint="the same ratios, in human time"
        checked={humanScale}
        onChange={(v) => {
          setHumanScale(v);
          track("visual_interacted", { visual: "latency-ladder", control: "human_scale", value: v });
        }}
      />

      <ol className="mt-4 space-y-1.5">
        {rungs.map((r) => {
          const w = ((Math.log10(r.ns) + 0.5) / MAX) * 100;
          const on = r.key === picked;
          return (
            <li key={r.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPicked(r.key);
                  track("visual_interacted", { visual: "latency-ladder", control: "rung", value: r.key });
                }}
                className={cn(
                  "grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
                  on ? "border-accent/50 bg-accent-soft" : "border-transparent hover:bg-surface-2",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-fg">{r.label}</span>
                  <span className="block truncate text-[11px] text-subtle">{r.where}</span>
                </span>
                <span className="text-right font-mono text-[12.5px] font-semibold text-fg tabular-nums">
                  {humanScale ? human(r.ns) : duration(r.ns)}
                </span>
                <span className="col-span-2 h-2 rounded-full bg-surface-3">
                  <span className={cn("block h-full rounded-full opacity-80", r.tone)} style={{ width: `${w}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 rounded-xl border border-line bg-surface-2 p-3 text-[13px] leading-relaxed text-muted" aria-live="polite">
        <span className="font-semibold text-fg">{sel.label}</span>{" "}
        {sel.key === "ram" ? (
          <>is the yardstick: about 100 ns.</>
        ) : sel.ns < 100 ? (
          <>is about 100 times faster than going to RAM.</>
        ) : (
          <>
            takes as long as <span className="font-mono text-fg">{compact(sel.ns / 100)}</span> RAM reads.
            {humanScale && <> In stretched time, a memory read is 1.7 minutes and this is {human(sel.ns)}.</>}
          </>
        )}
      </p>
    </VisualFrame>
  );
}
