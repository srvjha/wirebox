"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import type { Difficulty, LabMeta } from "@/content/labs/catalog";
import { cn } from "@/lib/utils";
import { LabCard } from "./lab-card";
import { labPercent, useProgress, type LabProgress } from "./progress";

type StatusFilter = "all" | "live" | "soon";
type DifficultyFilter = "all" | Difficulty;

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; count: number }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            value === o.value ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
          <span className="font-mono text-[11px] text-subtle">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

function LabProgressBar({ p }: { p: LabProgress | undefined }) {
  if (!p || (p.stepsDone === 0 && !p.completedAt)) return null;
  const pct = labPercent(p);
  const done = !!p.completedAt;
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className={cn("inline-flex items-center gap-1", done ? "text-ok" : "text-muted")}>
          {done && <CircleCheck className="size-3.5" aria-hidden />}
          {done ? "Completed" : p.totalSteps ? `Step ${p.stepsDone} of ${p.totalSteps}` : `${p.stepsDone} steps done`}
        </span>
        <span className="font-mono text-[11px] text-subtle">{pct}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Lab progress"
      >
        <div className={cn("h-full rounded-full", done ? "bg-ok" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function LabsBrowser({ labs }: { labs: LabMeta[] }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const progress = useProgress();
  const anySoon = labs.some((l) => l.status === "soon");

  const byStatus = (s: StatusFilter) => labs.filter((l) => s === "all" || l.status === s);
  const byDifficulty = (d: DifficultyFilter) => labs.filter((l) => d === "all" || l.difficulty === d);
  const shown = labs
    .filter((l) => (status === "all" || l.status === status) && (difficulty === "all" || l.difficulty === difficulty))
    .sort((a, b) => Number(b.status === "live") - Number(a.status === "live"));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {anySoon && (
          <Segmented
            label="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All", count: byDifficulty(difficulty).length },
              { value: "live", label: "Live", count: byDifficulty(difficulty).filter((l) => l.status === "live").length },
              {
                value: "soon",
                label: "Coming soon",
                count: byDifficulty(difficulty).filter((l) => l.status === "soon").length,
              },
            ]}
          />
        )}
        <Segmented
          label="Filter by difficulty"
          value={difficulty}
          onChange={setDifficulty}
          options={(["all", "easy", "medium", "hard"] as const).map((d) => ({
            value: d,
            label: d.charAt(0).toUpperCase() + d.slice(1),
            count: byStatus(status).filter((l) => d === "all" || l.difficulty === d).length,
          }))}
        />
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
          <p className="text-[15px] text-fg">No labs match those filters yet.</p>
          <button
            type="button"
            onClick={() => {
              setStatus("all");
              setDifficulty("all");
            }}
            className="mt-3 text-[13.5px] text-accent underline underline-offset-3"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((lab) => (
            <li key={lab.slug}>
              <LabCard
                lab={lab}
                location="labs_index"
                maxConcepts={6}
                progress={lab.status === "live" ? <LabProgressBar p={progress.labs.get(lab.slug)} /> : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
