"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, Cloud, CloudOff, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { DrillIcon } from "@/components/site/drill-card";
import { drillPercent, useProgress, type DrillProgress } from "@/components/site/progress";
import { TrackedLink } from "@/components/site/tracked-link";
import { allLessons, course, type ModuleMeta } from "@/content/course";
import { getDrillMeta, drillCatalog } from "@/content/drills/catalog";
import { cn } from "@/lib/utils";

function Bar({ pct, tone = "accent", label }: { pct: number; tone?: "accent" | "ok"; label: string }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-surface-3"
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", tone === "ok" ? "bg-ok" : "bg-accent")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Stat({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-[26px] font-semibold tracking-tight text-fg tabular-nums">{value}</p>
      <p className="text-[13px] text-muted">{label}</p>
      {sub && <p className="mt-0.5 font-mono text-[11px] text-subtle">{sub}</p>}
    </div>
  );
}

function ModuleRow({ m, done, live }: { m: ModuleMeta; done: Set<string>; live: Set<string> }) {
  const n = m.lessons.filter((l) => done.has(l.slug)).length;
  const total = m.lessons.length;
  const pct = Math.round((n / total) * 100);
  const nextLesson = m.lessons.find((l) => !done.has(l.slug) && live.has(l.slug));
  const complete = n === total;
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-x-3 gap-y-2 py-4 sm:grid-cols-[2rem_1fr_9rem_7.5rem] sm:items-center">
      <span className="font-mono text-[12px] text-subtle tabular-nums">{String(m.n).padStart(2, "0")}</span>
      <div className="min-w-0">
        <p className="truncate text-[14.5px] font-medium text-fg">{m.title}</p>
        <p className="font-mono text-[11px] text-subtle">
          {n}/{total} lessons
        </p>
      </div>
      <div className="col-start-2 sm:col-start-auto">
        <Bar pct={pct} tone={complete ? "ok" : "accent"} label={`${m.title} progress`} />
      </div>
      <div className="col-start-2 sm:col-start-auto sm:text-right">
        {complete ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] text-ok">
            <CircleCheck className="size-3.5" aria-hidden /> Complete
          </span>
        ) : nextLesson ? (
          <Link
            href={`/learn/${nextLesson.slug}`}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-fg hover:text-accent"
          >
            {n ? "Continue" : "Start"} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <Link href="/learn" className="text-[12.5px] text-subtle hover:text-fg">
            More lessons soon
          </Link>
        )}
      </div>
    </li>
  );
}

function DrillRow({ p }: { p: DrillProgress }) {
  const meta = getDrillMeta(p.slug);
  const pct = drillPercent(p);
  const done = !!p.completedAt;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
          <DrillIcon slug={p.slug} className="size-[18px]" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-medium text-fg">{meta?.title ?? p.slug}</p>
          <p className="font-mono text-[11px] text-subtle">
            {done ? "Completed" : p.totalSteps ? `Step ${p.stepsDone} of ${p.totalSteps}` : `${p.stepsDone} steps done`}
          </p>
        </div>
      </div>
      <div className="w-full sm:w-40">
        <Bar pct={pct} tone={done ? "ok" : "accent"} label={`${meta?.title ?? p.slug} progress`} />
      </div>
      <TrackedLink
        href={`/drills/${p.slug}`}
        location="me_drills"
        variant={done ? "ghost" : "secondary"}
        size="sm"
        className="self-start sm:self-auto"
      >
        {done ? "Revisit" : "Continue"} <ArrowRight className="size-3.5" aria-hidden />
      </TrackedLink>
    </li>
  );
}

export function ProgressDashboard({ liveLessons }: { liveLessons: string[] }) {
  const live = new Set(liveLessons);
  const { lessons: done, drills, signedIn, sessionPending, user, loading } = useProgress();

  const doneCount = allLessons.filter((l) => done.has(l.slug)).length;
  const modulesDone = course.flatMap((p) => p.modules).filter((m) => m.lessons.every((l) => done.has(l.slug))).length;
  const startedDrills = [...drills.values()]
    .filter((l) => l.stepsDone > 0 || l.completedAt)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const drillsDone = startedDrills.filter((l) => l.completedAt).length;

  // Next lesson: the first live lesson after the furthest one finished, else the first unfinished live lesson.
  const lastDoneIdx = allLessons.reduce((acc, l, i) => (done.has(l.slug) ? i : acc), -1);
  const next =
    allLessons.slice(lastDoneIdx + 1).find((l) => live.has(l.slug) && !done.has(l.slug)) ??
    allLessons.find((l) => live.has(l.slug) && !done.has(l.slug));
  const suggestedDrill = drillCatalog.find((l) => l.status === "live" && !drills.has(l.slug));

  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">Dashboard</p>
          <h1 className="mt-3 text-[34px] leading-[1.1] font-semibold tracking-tight text-fg sm:text-[40px]">
            Your progress
          </h1>
          <p className="mt-2 flex items-center gap-1.5 text-[13.5px] text-muted">
            {sessionPending ? (
              <span className="h-4 w-48 animate-pulse rounded bg-surface-2" />
            ) : signedIn ? (
              <>
                <Cloud className="size-4 text-ok" aria-hidden /> Synced to {user?.email}
                {loading && <span className="text-subtle"> · loading…</span>}
              </>
            ) : (
              <>
                <CloudOff className="size-4 text-subtle" aria-hidden /> Saved in this browser only
              </>
            )}
          </p>
        </div>
        {next && (
          <TrackedLink href={`/learn/${next.slug}`} location="me_continue" size="md">
            {doneCount ? "Continue" : "Start"}: {next.title} <ArrowRight className="size-4" aria-hidden />
          </TrackedLink>
        )}
      </header>

      {!sessionPending && !signedIn && (
        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-accent/30 bg-accent-soft p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-[14.5px] font-medium text-fg">Sign in to keep this on every device.</p>
            <p className="mt-1 text-[13.5px] text-muted">
              Optional. Your progress below lives in this browser and will sync once you sign in.
            </p>
          </div>
          <Link href="/sign-in?next=/me" className={buttonClass("primary", "sm")}>
            Sign in to sync
          </Link>
        </div>
      )}

      <section aria-label="Summary" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={`${doneCount}`} label="lessons done" sub={`of ${allLessons.length}`} />
        <Stat
          value={modulesDone}
          label="modules complete"
          sub={`of ${course.reduce((n, p) => n + p.modules.length, 0)}`}
        />
        <Stat value={startedDrills.length} label="drills started" />
        <Stat value={drillsDone} label="drills completed" />
      </section>

      <section aria-labelledby="drills-title" className="mt-14">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="drills-title" className="text-[20px] font-semibold tracking-tight text-fg">
            Drills
          </h2>
          <Link href="/drills" className="text-[13px] text-muted hover:text-fg">
            All drills
          </Link>
        </div>
        {startedDrills.length > 0 ? (
          <ul className="space-y-3">
            {startedDrills.map((p) => (
              <DrillRow key={p.slug} p={p} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-line-strong p-5 sm:flex-row sm:items-center">
            <FlaskConical className="size-5 shrink-0 text-subtle" aria-hidden />
            <p className="flex-1 text-[14px] text-muted">
              You haven&apos;t started a drill yet.
              {suggestedDrill && ` The ${suggestedDrill.product.toLowerCase()} drill is a good first one.`}
            </p>
            {suggestedDrill && (
              <TrackedLink href={`/drills/${suggestedDrill.slug}`} location="me_drills" variant="secondary" size="sm">
                Start the drill
              </TrackedLink>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="modules-title" className="mt-14">
        <h2 id="modules-title" className="mb-2 text-[20px] font-semibold tracking-tight text-fg">
          Lessons by module
        </h2>
        {course.map((part) => (
          <div key={part.n} className="mt-6">
            <div className="flex items-center gap-2">
              <p className="font-mono text-[11px] tracking-[0.12em] text-subtle uppercase">
                Part {part.n} · {part.title}
              </p>
              {part.modules.every((m) => m.lessons.every((l) => done.has(l.slug))) && <Badge tone="ok">Done</Badge>}
            </div>
            <ol className="mt-1 divide-y divide-line border-y border-line">
              {part.modules.map((m) => (
                <ModuleRow key={m.slug} m={m} done={done} live={live} />
              ))}
            </ol>
          </div>
        ))}
      </section>
    </div>
  );
}
