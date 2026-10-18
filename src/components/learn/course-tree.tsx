"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { track } from "@/lib/analytics";
import { useLessonProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";
import { KindIcon } from "./kind-icon";
import { ProgressBar, Tick, moduleProgress } from "./progress-ui";
import type { NavLesson, NavModule, NavPart } from "./types";

function matches(q: string, lesson: NavLesson, module: NavModule) {
  const hay = `${lesson.title} ${lesson.summary} ${module.title} ${lesson.n}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/**
 * The whole course as a collapsible tree with search. Used in the desktop
 * sidebar and the mobile drawer.
 */
export function CourseTree({
  parts,
  current,
  onNavigate,
}: {
  parts: NavPart[];
  current?: string;
  onNavigate?: () => void;
}) {
  const { completed } = useLessonProgress();
  const currentModule = useMemo(
    () => parts.flatMap((p) => p.modules).find((m) => m.lessons.some((l) => l.slug === current))?.slug,
    [parts, current],
  );
  const [open, setOpen] = useState<Set<string>>(() => new Set(currentModule ? [currentModule] : []));
  const [query, setQuery] = useState("");
  const q = query.trim();
  const currentRef = useRef<HTMLAnchorElement>(null);

  // A different lesson opens its module.
  const [seenModule, setSeenModule] = useState(currentModule);
  if (currentModule !== seenModule) {
    setSeenModule(currentModule);
    if (currentModule && !open.has(currentModule)) setOpen(new Set(open).add(currentModule));
  }

  const filtered = useMemo(() => {
    if (!q) return null;
    return parts
      .map((p) => ({
        ...p,
        modules: p.modules
          .map((m) => ({ ...m, lessons: m.lessons.filter((l) => matches(q, l, m)) }))
          .filter((m) => m.lessons.length),
      }))
      .filter((p) => p.modules.length);
  }, [parts, q]);
  const resultCount = filtered?.reduce((n, p) => n + p.modules.reduce((k, m) => k + m.lessons.length, 0), 0) ?? 0;

  // Report searches once the reader pauses typing.
  useEffect(() => {
    if (q.length < 2) return;
    const t = setTimeout(() => track("course_search_used", { query_length: q.length, results: resultCount }), 800);
    return () => clearTimeout(t);
  }, [q, resultCount]);

  useEffect(() => {
    // Keep the current lesson in view inside the nearest scrolling panel.
    const el = currentRef.current;
    const parent = el?.closest<HTMLElement>("[data-scroll-root]");
    if (!el || !parent) return;
    const top = el.getBoundingClientRect().top - parent.getBoundingClientRect().top;
    parent.scrollBy({ top: top - parent.clientHeight / 3 });
  }, [current]);

  const toggle = (slug: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });

  const shown = filtered ?? parts;

  return (
    <div>
      <div className="px-3 pb-3">
       <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lessons"
          aria-label="Search lessons"
          className="h-9 w-full rounded-lg border border-line bg-bg pr-8 pl-8 text-[13px] text-fg outline-none placeholder:text-subtle focus:border-accent/60 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-subtle hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        )}
       </div>
      </div>

      {filtered && (
        <p className="px-4 pb-2 text-[12px] text-subtle" aria-live="polite">
          {resultCount === 0 ? `No lessons match “${q}”.` : `${resultCount} lesson${resultCount === 1 ? "" : "s"}`}
        </p>
      )}

      <nav aria-label="Course contents" className="space-y-5 pb-6">
        {shown.map((part) => (
          <div key={part.n}>
            <p className="px-4 pb-1.5 font-mono text-[10.5px] tracking-wider text-subtle uppercase">
              Part {part.n} · {part.title}
            </p>
            <ul className="space-y-0.5 px-2">
              {part.modules.map((m) => {
                const full = parts.flatMap((p) => p.modules).find((x) => x.slug === m.slug) ?? m;
                const { done, total, pct } = moduleProgress(full, completed);
                const isOpen = !!filtered || open.has(m.slug);
                const isCurrent = m.slug === currentModule;
                return (
                  <li key={m.slug}>
                    <button
                      type="button"
                      onClick={() => toggle(m.slug)}
                      aria-expanded={isOpen}
                      className={cn(
                        "group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2",
                        isCurrent && "text-fg",
                      )}
                    >
                      <ChevronRight
                        className={cn("mt-0.5 size-3.5 shrink-0 text-subtle transition-transform", isOpen && "rotate-90")}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono text-[11px] text-subtle">{String(m.n).padStart(2, "0")}</span>
                          <span
                            className={cn(
                              "text-[13.5px] leading-snug font-medium",
                              isCurrent ? "text-fg" : "text-muted group-hover:text-fg",
                            )}
                          >
                            {m.title}
                          </span>
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <ProgressBar value={pct} className="flex-1" label={`${m.title} progress`} />
                          <span className="font-mono text-[10.5px] text-subtle tabular-nums">
                            {done}/{total}
                          </span>
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="mt-0.5 mb-2 ml-[22px] space-y-px border-l border-line pl-1.5">
                        {m.lessons.map((l) => (
                          <li key={l.slug}>
                            <TreeLesson
                              lesson={l}
                              done={completed.has(l.slug)}
                              current={l.slug === current}
                              onNavigate={onNavigate}
                              linkRef={l.slug === current ? currentRef : undefined}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function TreeLesson({
  lesson,
  done,
  current,
  onNavigate,
  linkRef,
}: {
  lesson: NavLesson;
  done: boolean;
  current: boolean;
  onNavigate?: () => void;
  linkRef?: React.RefObject<HTMLAnchorElement | null>;
}) {
  const inner = (
    <>
      <Tick done={done} className="mt-0.5" />
      <span className="min-w-0 flex-1 leading-snug">{lesson.title}</span>
      {lesson.live ? (
        <KindIcon kind={lesson.kind} className="mt-0.5" />
      ) : (
        <span className="mt-px shrink-0 font-mono text-[9.5px] tracking-wide text-subtle uppercase">soon</span>
      )}
    </>
  );
  const base = "flex items-start gap-2 rounded-md px-2 py-1.5 text-[13px]";
  if (!lesson.live) {
    return (
      <span aria-disabled="true" title="Being written" className={cn(base, "cursor-not-allowed text-subtle opacity-60")}>
        {inner}
      </span>
    );
  }
  return (
    <Link
      ref={linkRef}
      href={lesson.href}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={cn(
        base,
        "transition-colors",
        current
          ? "bg-accent-soft font-medium text-fg shadow-[inset_2px_0_0_var(--accent)]"
          : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {inner}
    </Link>
  );
}
