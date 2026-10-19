"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ListOrdered } from "lucide-react";
import { track } from "@/lib/analytics";
import { LAST_LESSON_KEY, useLessonProgress, writeKey } from "@/lib/progress";
import { cn } from "@/lib/utils";
import type { Chapter } from "./chapters";

/** Fires lesson_viewed and remembers the lesson for "continue where you left off". */
export function LessonView({ slug, module, kind }: { slug: string; module: string; kind: string }) {
  useEffect(() => {
    track("lesson_viewed", { lesson: slug, module, kind });
    writeKey(LAST_LESSON_KEY, slug);
  }, [slug, module, kind]);
  return null;
}

/** "Completed" chip in the lesson header. */
export function LessonStatus({ slug }: { slug: string }) {
  const { isDone } = useLessonProgress();
  if (!isDone(slug)) return null;
  return (
    <span className="inline-flex items-center gap-1 text-ok">
      <CheckCircle2 className="size-3.5" /> Completed
    </span>
  );
}

/** The "What you'll learn" list, built from the lesson's `## ` headings. */
export function ChapterList({ slug, chapters }: { slug: string; chapters: Chapter[] }) {
  if (!chapters.length) return null;
  return (
    <nav aria-label="What you'll learn" className="mt-8 rounded-2xl border border-line bg-surface p-5">
      <p className="mb-3 flex items-center gap-2 text-[13px] text-subtle">
        <ListOrdered className="size-3.5" /> What you&apos;ll learn
      </p>
      <ol className="grid gap-1 sm:grid-cols-2 sm:gap-x-6">
        {chapters.map((c, i) => (
          <li key={c.id}>
            <a
              href={`#${c.id}`}
              onClick={() => track("lesson_chapter_clicked", { lesson: slug, chapter: c.id })}
              className="group flex items-baseline gap-3 rounded-lg py-1.5 text-[14px] text-muted transition-colors hover:text-fg"
            >
              <span className="font-mono text-[11px] text-subtle tabular-nums group-hover:text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="leading-snug">{c.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Sticky "On this page" list with scroll-spy and reading progress. */
export function OnThisPage({ slug, chapters }: { slug: string; chapters: Chapter[] }) {
  const [active, setActive] = useState<string | null>(null);
  const [read, setRead] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let current: string | null = null;
      for (const c of chapters) {
        const el = document.getElementById(c.id);
        if (el && el.getBoundingClientRect().top < 140) current = c.id;
      }
      setActive(current);
      const article = document.getElementById("lesson-article");
      if (article) {
        const r = article.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        setRead(total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [chapters]);

  if (!chapters.length) return null;
  return (
    <nav aria-label="On this page">
      <p className="mb-3 text-[13px] text-subtle">On this page</p>
      <ul className="space-y-0.5 border-l border-line">
        {chapters.map((c) => (
          <li key={c.id}>
            <a
              href={`#${c.id}`}
              aria-current={active === c.id ? "location" : undefined}
              onClick={() => track("lesson_chapter_clicked", { lesson: slug, chapter: c.id })}
              className={cn(
                "-ml-px block border-l py-1 pl-3 text-[13px] leading-snug transition-colors",
                active === c.id ? "border-accent text-fg" : "border-transparent text-subtle hover:text-fg",
              )}
            >
              {c.title}
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(read * 100)}%` }} />
        </div>
        <span className="font-mono text-[10.5px] text-subtle tabular-nums">{Math.round(read * 100)}%</span>
      </div>
    </nav>
  );
}
