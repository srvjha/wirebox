"use client";

import { useState } from "react";
import { ArrowRight, Check, Clock } from "lucide-react";
import { drillTracks, type Difficulty, type LabMeta } from "@/content/labs/catalog";
import { cn } from "@/lib/utils";
import { LabIcon } from "./lab-card";
import { labPercent, useProgress, type LabProgress } from "./progress";
import { TrackedLink } from "./tracked-link";

type DifficultyFilter = "all" | Difficulty;

const pips: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

function DifficultyMeter({ difficulty }: { difficulty: Difficulty }) {
  const n = pips[difficulty];
  return (
    <span className="inline-flex items-center gap-1.5" title={`Difficulty: ${difficulty}`}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("h-2.5 w-1 rounded-sm", i <= n ? "bg-accent" : "bg-surface-3")} />
        ))}
      </span>
      <span className="capitalize">{difficulty}</span>
    </span>
  );
}

/** Right-hand status: start, in progress, or done. */
function DrillState({ p }: { p: LabProgress | undefined }) {
  if (p?.completedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-ok">
        <Check className="size-4" aria-hidden /> Done
      </span>
    );
  }
  if (p && p.stepsDone > 0) {
    const pct = labPercent(p);
    return (
      <span className="inline-flex items-center gap-2 text-fg">
        <span
          className="relative size-4 rounded-full"
          style={{ background: `conic-gradient(var(--color-accent) ${pct * 3.6}deg, var(--color-surface-3) 0)` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Drill progress"
        >
          <span className="absolute inset-[3px] rounded-full bg-surface" />
        </span>
        Resume
      </span>
    );
  }
  return <span className="text-muted transition-colors group-hover:text-fg">Start</span>;
}

function DrillRow({ lab, number, p }: { lab: LabMeta; number: number; p: LabProgress | undefined }) {
  return (
    <TrackedLink
      plain
      href={`/drills/${lab.slug}`}
      location="drills_index"
      className="group grid grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-3 px-4 py-5 outline-none hover:bg-surface-2/60 focus-visible:bg-surface-2 sm:grid-cols-[2.5rem_auto_1fr_auto] sm:items-center sm:px-5"
    >
      <span className="hidden font-mono text-[13px] text-subtle tabular-nums sm:block">{String(number).padStart(2, "0")}</span>
      <span className="grid size-10 place-items-center rounded-lg border border-line bg-surface-2 text-muted transition-colors group-hover:border-accent/40 group-hover:text-accent">
        <LabIcon slug={lab.slug} className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[15.5px] font-semibold tracking-tight text-fg">{lab.product}</span>
          <span className="text-[13.5px] text-muted">{lab.tagline}</span>
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-subtle">
          <DifficultyMeter difficulty={lab.difficulty} />
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> {lab.minutes} min
          </span>
          <span className="hidden truncate md:inline">{lab.concepts.join(" · ")}</span>
        </span>
      </span>
      <span className="flex items-center gap-2 self-center text-[13px] font-medium">
        <DrillState p={p} />
        <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
      </span>
    </TrackedLink>
  );
}

/**
 * The drills index: the catalogue grouped into tracks, one dense row per
 * drill, with a sticky rail of per-track progress on wide screens.
 */
export function DrillIndex({ labs }: { labs: LabMeta[] }) {
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const progress = useProgress();
  const bySlug = new Map(labs.map((l) => [l.slug, l]));
  const numberOf = new Map(drillTracks.flatMap((t) => t.slugs).map((s, i) => [s, i + 1]));

  const tracks = drillTracks.map((t) => {
    const all = t.slugs.map((s) => bySlug.get(s)).filter((l): l is LabMeta => !!l && l.status === "live");
    const done = all.filter((l) => progress.labs.get(l.slug)?.completedAt).length;
    const shown = all.filter((l) => difficulty === "all" || l.difficulty === difficulty);
    return { ...t, all, done, shown };
  });

  return (
    <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="font-mono text-[11px] tracking-wider text-subtle uppercase">Difficulty</p>
        <div role="group" aria-label="Filter by difficulty" className="mt-2 flex flex-wrap gap-1.5">
          {(["all", "easy", "medium", "hard"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={difficulty === d}
              onClick={() => setDifficulty(d)}
              className={cn(
                "h-7 rounded-full border px-3 text-[12.5px] capitalize transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                difficulty === d ? "border-accent/50 bg-accent-soft text-fg" : "border-line text-muted hover:text-fg",
              )}
            >
              {d}
            </button>
          ))}
        </div>

        <nav aria-label="Tracks" className="mt-8 hidden lg:block">
          <p className="font-mono text-[11px] tracking-wider text-subtle uppercase">Tracks</p>
          <ol className="mt-2 space-y-1">
            {tracks.map((t, i) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 text-[13.5px] text-muted hover:bg-surface hover:text-fg">
                  <span className="font-mono text-[11px] text-subtle">{i + 1}</span>
                  <span className="flex-1">{t.title}</span>
                  <span className="font-mono text-[11px] text-subtle">
                    {t.done}/{t.all.length}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      <div className="space-y-12">
        {tracks.map((t, i) => (
          <section key={t.id} id={t.id} aria-labelledby={`${t.id}-title`} className="scroll-mt-24">
            <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-line pb-3">
              <div>
                <p className="font-mono text-[11px] tracking-wider text-accent uppercase">Track {i + 1}</p>
                <h2 id={`${t.id}-title`} className="mt-1 text-[20px] font-semibold tracking-tight text-fg">
                  {t.title}
                </h2>
                <p className="mt-1 text-[13.5px] text-muted">{t.blurb}</p>
              </div>
              <div className="flex items-center gap-2 text-[12px] text-subtle">
                <span className="h-1 w-20 overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full bg-accent" style={{ width: `${t.all.length ? (t.done / t.all.length) * 100 : 0}%` }} />
                </span>
                {t.done} of {t.all.length} done
              </div>
            </header>
            {t.shown.length === 0 ? (
              <p className="px-1 py-5 text-[13.5px] text-subtle">No {difficulty} drills in this track.</p>
            ) : (
              <ul className="divide-y divide-line">
                {t.shown.map((lab) => (
                  <li key={lab.slug}>
                    <DrillRow lab={lab} number={numberOf.get(lab.slug) ?? 0} p={progress.labs.get(lab.slug)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
