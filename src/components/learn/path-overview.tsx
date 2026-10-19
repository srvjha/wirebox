"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowRight, ChevronDown, Flag, Target } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { LAST_LESSON_KEY, readKey, useLessonProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";
import { KindIcon, kindLabel } from "./kind-icon";
import { ProgressBar, Tick, moduleProgress } from "./progress-ui";
import type { NavLesson, NavModule, NavPart } from "./types";

const noop = () => () => {};
const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/** "Continue where you left off": the last opened lesson if unfinished, else the first unfinished live lesson. */
export function ContinueButton({ parts, className }: { parts: NavPart[]; className?: string }) {
  const { completed, hydrated } = useLessonProgress();
  const last = useSyncExternalStore(noop, () => readKey(LAST_LESSON_KEY), () => null);
  const lessons = parts.flatMap((p) => p.modules.flatMap((m) => m.lessons)).filter((l) => l.live && l.kind !== "drill");
  const started = hydrated && (completed.size > 0 || !!last);
  const lastLesson = lessons.find((l) => l.slug === last && !completed.has(l.slug));
  const target: NavLesson | undefined = lastLesson ?? lessons.find((l) => !completed.has(l.slug)) ?? lessons[0];
  if (!target) return null;
  return (
    <Link
      href={target.href}
      onClick={() => track("cta_clicked", { location: "learn_hero", target: target.slug })}
      className={buttonClass("primary", "lg", className)}
    >
      <span className="truncate">{started ? `Continue: ${target.title}` : "Start the course"}</span>
      <ArrowRight className="size-4 shrink-0" />
    </Link>
  );
}

export function OverallProgress({ parts }: { parts: NavPart[] }) {
  const { completed, hydrated } = useLessonProgress();
  const all = parts.flatMap((p) => p.modules.flatMap((m) => m.lessons));
  const done = all.filter((l) => completed.has(l.slug)).length;
  if (!hydrated || done === 0) return null;
  return (
    <div className="mt-6 max-w-sm">
      <div className="flex justify-between text-[12.5px] text-subtle">
        <span>Your progress</span>
        <span className="font-mono tabular-nums">
          {done}/{all.length} lessons
        </span>
      </div>
      <ProgressBar value={done / all.length} className="mt-1.5 h-1.5" label="Course progress" />
    </div>
  );
}

export function ModuleCard({ module, defaultOpen = false }: { module: NavModule; defaultOpen?: boolean }) {
  const { completed } = useLessonProgress();
  const [toggled, setOpen] = useState<boolean | null>(null);
  const linked = useSyncExternalStore(subscribeHash, () => window.location.hash === `#${module.slug}`, () => false);
  const open = toggled ?? (defaultOpen || linked);
  const { done, total, pct } = moduleProgress(module, completed);
  const liveCount = module.lessons.filter((l) => l.live).length;
  const minutes = module.lessons.reduce((n, l) => n + l.minutes, 0);
  return (
    <li id={module.slug} className="scroll-mt-20 rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`${module.slug}-body`}
        className="flex w-full items-start gap-4 p-4 text-left sm:p-5"
      >
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl border font-mono text-[13px]",
            pct === 1 ? "border-ok/40 bg-ok/10 text-ok" : "border-line bg-surface-2 text-muted",
          )}
        >
          {String(module.n).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold tracking-tight text-fg">{module.title}</span>
          <span className="mt-0.5 block text-[14px] leading-relaxed text-muted">{module.summary}</span>
          <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-subtle tabular-nums">
            <span>{total} lessons</span>
            <span>{Math.round(minutes / 6) / 10}h</span>
            {liveCount < total && <span>{liveCount === 0 ? "Being written" : `${liveCount} out now`}</span>}
          </span>
          <span className="mt-2.5 flex items-center gap-2">
            <ProgressBar value={pct} className="max-w-56 flex-1" label={`${module.title} progress`} />
            <span className="font-mono text-[11px] text-subtle tabular-nums">
              {done}/{total}
            </span>
          </span>
        </span>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={`${module.slug}-body`} className="border-t border-line px-4 pt-4 pb-3 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-2 p-3.5">
              <p className="flex items-center gap-1.5 text-[13px] text-accent">
                <Flag className="size-3" /> The problem
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{module.story}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3.5">
              <p className="flex items-center gap-1.5 text-[13px] text-ok">
                <Target className="size-3" /> You&apos;ll leave with
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{module.outcome}</p>
            </div>
          </div>
          <ol className="mt-3">
            {module.lessons.map((l) => (
              <li key={l.slug}>
                <LessonRow lesson={l} done={completed.has(l.slug)} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

function LessonRow({ lesson, done }: { lesson: NavLesson; done: boolean }) {
  const inner = (
    <>
      <Tick done={done} />
      <span className="w-8 shrink-0 font-mono text-[11.5px] text-subtle">{lesson.n}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[14px] leading-snug", lesson.live ? "text-fg" : "text-subtle")}>
          {lesson.title}
        </span>
        <span className="mt-0.5 hidden text-[12.5px] text-subtle sm:block">{lesson.summary}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-[12px] text-subtle">
        {lesson.live ? (
          <span className="hidden items-center gap-1 sm:inline-flex">
            <KindIcon kind={lesson.kind} /> {kindLabel[lesson.kind]}
          </span>
        ) : (
          <span className="rounded-full border border-line px-2 py-0.5 text-[13px]">
            Being written
          </span>
        )}
        <span className="w-9 text-right font-mono tabular-nums">{lesson.minutes}m</span>
      </span>
    </>
  );
  const base = "flex items-center gap-3 rounded-lg px-2 py-2.5";
  if (!lesson.live)
    return (
      <div aria-disabled="true" className={cn(base, "opacity-70")}>
        {inner}
      </div>
    );
  return (
    <Link href={lesson.href} className={cn(base, "transition-colors hover:bg-surface-2")}>
      {inner}
    </Link>
  );
}
