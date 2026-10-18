"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ListTree, X } from "lucide-react";
import { track } from "@/lib/analytics";
import { useLessonProgress } from "@/lib/progress";
import { CourseTree } from "./course-tree";
import { ProgressBar } from "./progress-ui";
import type { NavPart } from "./types";

function CourseProgress({ parts }: { parts: NavPart[] }) {
  const { completed } = useLessonProgress();
  const all = useMemo(() => parts.flatMap((p) => p.modules.flatMap((m) => m.lessons)), [parts]);
  const done = all.filter((l) => completed.has(l.slug)).length;
  return (
    <div className="px-4 pt-4 pb-4">
      <div className="flex items-baseline justify-between">
        <Link href="/learn" className="text-[13px] font-semibold text-fg hover:text-accent">
          The course
        </Link>
        <span className="font-mono text-[11px] text-subtle tabular-nums">
          {done}/{all.length} done
        </span>
      </div>
      <ProgressBar value={all.length ? done / all.length : 0} className="mt-2" label="Course progress" />
    </div>
  );
}

/**
 * Course navigation for a lesson page: a sticky sidebar from `lg`, and a
 * drawer opened from a bar under the header on smaller screens.
 */
export function LearnSidebar({ parts, current }: { parts: NavPart[]; current?: string }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const currentModule = parts.flatMap((p) => p.modules).find((m) => m.lessons.some((l) => l.slug === current));
  const currentLesson = currentModule && {
    module: currentModule,
    i: currentModule.lessons.findIndex((l) => l.slug === current),
  };

  const setDrawer = (next: boolean) => {
    setOpen(next);
    track("sidebar_toggled", { open: next });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <aside className="hidden w-72 shrink-0 border-r border-line lg:block">
        <div data-scroll-root className="sticky top-14 h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain">
          <CourseProgress parts={parts} />
          <CourseTree parts={parts} current={current} />
        </div>
      </aside>

      <div className="sticky top-14 z-30 border-b border-line bg-bg/90 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-expanded={open}
          aria-controls="course-drawer"
          className="flex h-11 w-full items-center gap-2.5 px-4 text-left text-[13px] text-muted hover:text-fg"
        >
          <ListTree className="size-4 shrink-0" />
          <span className="font-medium text-fg">Course</span>
          {currentLesson && (
            <span className="min-w-0 truncate text-subtle">
              · Module {currentLesson.module.n} · {currentLesson.i + 1} of {currentLesson.module.lessons.length}
            </span>
          )}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" id="course-drawer">
            <motion.div
              className="absolute inset-0 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Course contents"
              className="absolute inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col border-r border-line bg-surface shadow-card"
              initial={reduce ? { opacity: 0 } : { x: "-100%" }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "-100%" }}
              transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
            >
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
                <span className="font-mono text-[11px] tracking-wider text-subtle uppercase">Course contents</span>
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  aria-label="Close course contents"
                  autoFocus
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div data-scroll-root className="flex-1 overflow-y-auto overscroll-contain">
                <CourseProgress parts={parts} />
                <CourseTree parts={parts} current={current} onNavigate={() => setOpen(false)} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
