"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, PartyPopper, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLessonProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";
import { isModuleFinished } from "./progress-ui";
import type { NavModule } from "./types";

/** Seconds on the page before reaching the end counts as finishing it. */
const MIN_SECONDS = 15;

async function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const { default: confetti } = await import("canvas-confetti");
  const colors = ["#3ecf8e", "#f5a524", "#b89cff", "#ededed"];
  const fire = (x: number, angle: number) =>
    confetti({ particleCount: 70, spread: 70, startVelocity: 48, angle, origin: { x, y: 0.75 }, colors });
  fire(0.15, 60);
  fire(0.85, 120);
  setTimeout(() => fire(0.5, 90), 220);
}

/**
 * "Mark as complete", plus auto-complete when the reader reaches the end of
 * the lesson. Finishing the last doable lesson of a module throws confetti.
 */
export function LessonComplete({ slug, module }: { slug: string; module: NavModule }) {
  const { isDone, setDone, completed, hydrated } = useLessonProgress();
  const done = isDone(slug);
  const sentinel = useRef<HTMLDivElement>(null);
  const [finished, setFinished] = useState(false);
  const [auto, setAuto] = useState(false);
  const optedOut = useRef(false);
  const since = useRef(0);

  const complete = (how: "button" | "auto") => {
    const next = new Set(completed).add(slug);
    const wasFinished = isModuleFinished(module, completed);
    setDone(slug, true);
    setAuto(how === "auto");
    if (!wasFinished && isModuleFinished(module, next)) {
      setFinished(true);
      void celebrate();
    }
  };
  const completeRef = useRef(complete);
  useEffect(() => {
    completeRef.current = complete;
  });

  useEffect(() => {
    since.current = Date.now();
    optedOut.current = false;
  }, [slug]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hydrated || done) return;
    let visible = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (!visible || optedOut.current) return;
      const wait = MIN_SECONDS * 1000 - (Date.now() - since.current);
      if (wait > 0) timer = setTimeout(check, wait);
      else completeRef.current("auto");
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      clearTimeout(timer);
      check();
    });
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [hydrated, done, slug]);

  return (
    <div className="mt-14">
      <div ref={sentinel} aria-hidden className="h-px" />
      <div
        className={cn(
          "flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center",
          done ? "border-ok/30 bg-ok/5" : "border-line bg-surface",
        )}
      >
        <div className="flex-1">
          <p className="text-[15px] font-semibold text-fg">
            {done ? (auto ? "Nice. Marked complete." : "Lesson complete") : "Finished reading?"}
          </p>
          <p className="mt-0.5 text-[13.5px] text-muted">
            {done
              ? "Your progress is saved in this browser, and to your account when you're signed in."
              : "Mark it complete to tick it off in the course."}
          </p>
        </div>
        {done ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              optedOut.current = true;
              setFinished(false);
              setDone(slug, false);
            }}
          >
            <RotateCcw className="size-3.5" /> Mark as not done
          </Button>
        ) : (
          <Button onClick={() => complete("button")}>
            <Check className="size-4" /> Mark as complete
          </Button>
        )}
      </div>
      {finished && (
        <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-5">
          <PartyPopper className="mt-0.5 size-5 shrink-0 text-accent" />
          <div>
            <p className="text-[15px] font-semibold text-fg">Module {module.n} complete</p>
            <p className="mt-0.5 text-[13.5px] text-muted">
              You&apos;ve finished every lesson in “{module.title}” that&apos;s out so far.{" "}
              <Link href="/learn" className="text-accent underline underline-offset-2">
                See the whole path
              </Link>
              .
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
