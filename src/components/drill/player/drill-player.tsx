"use client";

import { Cloud, CloudOff, LoaderCircle, PanelLeft, PanelLeftClose, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { LogoMark } from "@/components/site/logo";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { getDrill } from "@/content/drills";
import { track } from "@/lib/analytics";
import { frontier as frontierOf, getDrillStore, type DrillStore } from "@/lib/drill/store";
import { useDrillSync, type SyncStatus } from "@/lib/drill/sync";
import type { Drill } from "@/lib/drill/types";
import { cn } from "@/lib/utils";
import { DesignStepView } from "../design/design-step";
import { ApiStepView } from "../steps/api-step";
import { ChooseStepView } from "../steps/choose-step";
import { FinishStepView } from "../steps/finish-step";
import { IntroStepView } from "../steps/intro-step";
import { ReadStepView } from "../steps/read-step";
import { SchemaStepView } from "../steps/schema-step";
import { StepList } from "./step-list";

const noop = () => () => {};

export function DrillPlayer({ slug }: { slug: string }) {
  const drill = getDrill(slug);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const store = useMemo(() => (mounted && drill ? getDrillStore(drill) : null), [mounted, drill]);
  if (!drill || !store) return <PlayerSkeleton />;
  return <Player drill={drill} store={store} />;
}

function Player({ drill, store }: { drill: Drill; store: DrillStore }) {
  const hydrated = useStore(store, (s) => s.hydrated);
  const current = useStore(store, (s) => s.current);
  const passed = useStore(store, (s) => s.passed);
  const sync = useDrillSync(drill, store, hydrated);
  const [listOpen, setListOpen] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const steps = drill.steps;
  const front = frontierOf(steps, passed);
  const index = Math.min(current, front);
  const step = steps[index];
  const designsDone = steps.filter((s) => passed.includes(s.id)).length;
  const progress = designsDone / steps.length;

  useEffect(() => {
    track("drill_viewed", { drill: drill.slug });
  }, [drill.slug]);
  useEffect(() => {
    if (hydrated) track("drill_step_viewed", { drill: drill.slug, step: index, type: step.type });
  }, [hydrated, index, drill.slug, step.type]);

  const go = useCallback(
    (i: number) => {
      store.getState().go(i);
      setDrawer(false);
      document.getElementById("drill-main")?.scrollTo({ top: 0 });
    },
    [store],
  );
  const next = useCallback(() => go(index + 1), [go, index]);
  const doneAndNext = useCallback(() => {
    const s = store.getState();
    s.pass(step.id);
    go(index + 1);
  }, [go, index, step, store]);

  if (!hydrated) return <PlayerSkeleton />;

  const list = <StepList steps={steps} current={index} passed={passed} frontier={front} onGo={go} />;

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-4">
        <button
          type="button"
          onClick={() => {
            if (window.matchMedia("(min-width: 1024px)").matches) setListOpen((o) => !o);
            else setDrawer(true);
          }}
          className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          aria-label="Toggle step list"
        >
          {listOpen ? <PanelLeftClose className="hidden size-4 lg:block" /> : <PanelLeft className="hidden size-4 lg:block" />}
          <PanelLeft className="size-4 lg:hidden" />
        </button>
        <Link href="/" aria-label="Wirebox home" className="hidden text-fg sm:block">
          <LogoMark className="size-5" />
        </Link>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <Link href="/drills" className="text-muted hover:text-fg">
            Drills
          </Link>
          <span className="text-subtle">/</span>
          <span className="truncate font-medium text-fg">{drill.product}</span>
        </nav>

        <div className="mx-auto hidden w-full max-w-[320px] items-center gap-3 md:flex">
          <span className="shrink-0 font-mono text-[11px] text-muted">
            Step {index + 1} of {steps.length}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Drill progress">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <span className="font-mono text-[11px] text-muted md:hidden">
            {index + 1}/{steps.length}
          </span>
          <SyncBadge status={sync} returnTo={`/drills/${drill.slug}`} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setConfirmReset((o) => !o)}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Reset drill"
              title="Reset drill"
            >
              <RotateCcw className="size-4" />
            </button>
            {confirmReset && (
              <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-surface p-3 shadow-card">
                <p className="text-[13px] font-medium text-fg">Start this drill over?</p>
                <p className="mt-1 text-[12.5px] text-muted">Your API, schema, canvas and passed steps will be cleared.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      store.getState().reset();
                      track("drill_reset", { drill: drill.slug });
                      setConfirmReset(false);
                    }}
                    className="h-8 rounded-lg bg-err px-3 text-[12.5px] font-medium text-white hover:opacity-90"
                  >
                    Reset drill
                  </button>
                  <button type="button" onClick={() => setConfirmReset(false)} className="h-8 rounded-lg px-3 text-[12.5px] text-muted hover:bg-surface-2">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className={cn("hidden w-[248px] shrink-0 overflow-y-auto border-r border-line bg-surface/40", listOpen && "lg:block")}>
          <p className="px-4 pt-4 text-[13px] text-subtle">{drill.title}</p>
          {list}
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Steps">
            <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close steps" onClick={() => setDrawer(false)} />
            <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85%] overflow-y-auto border-r border-line bg-bg shadow-card">
              <div className="flex items-center justify-between px-4 pt-4">
                <p className="text-[13px] text-subtle">{drill.title}</p>
                <button type="button" onClick={() => setDrawer(false)} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Close steps">
                  <X className="size-4" />
                </button>
              </div>
              {list}
            </div>
          </div>
        )}

        <main id="drill-main" className={cn("min-w-0 flex-1 overflow-y-auto", step.type === "design" && "lg:overflow-hidden")}>
          {step.type === "intro" && <IntroStepView key={step.id} drill={drill} step={step} onDone={doneAndNext} />}
          {step.type === "read" && <ReadStepView key={step.id} step={step} onDone={doneAndNext} />}
          {step.type === "api" && <ApiStepView key={step.id} drill={drill} step={step} index={index} store={store} onNext={next} />}
          {step.type === "schema" && <SchemaStepView key={step.id} drill={drill} step={step} index={index} store={store} onNext={next} />}
          {step.type === "design" && <DesignStepView key={step.id} drill={drill} step={step} index={index} store={store} onNext={next} />}
          {step.type === "choose" && <ChooseStepView key={step.id} drill={drill} step={step} index={index} store={store} onNext={next} />}
          {step.type === "finish" && <FinishStepView key={step.id} drill={drill} step={step} index={index} store={store} />}
        </main>
      </div>
    </div>
  );
}

function SyncBadge({ status, returnTo }: { status: SyncStatus; returnTo: string }) {
  if (status === "local") {
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(returnTo)}`}
        className="hidden items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-subtle hover:bg-surface-2 hover:text-fg sm:flex"
        title="Progress is saved in this browser. Sign in to keep it everywhere."
      >
        <CloudOff className="size-3.5" /> Saved locally
      </Link>
    );
  }
  const label = status === "loading" ? "Loading" : status === "saving" ? "Saving" : status === "error" ? "Not synced" : "Synced";
  return (
    <span className={cn("hidden items-center gap-1.5 px-2 text-[12px] sm:flex", status === "error" ? "text-err" : "text-subtle")}>
      {status === "loading" || status === "saving" ? <LoaderCircle className="size-3.5 animate-spin" /> : status === "error" ? <CloudOff className="size-3.5" /> : <Cloud className="size-3.5" />}
      {label}
    </span>
  );
}

function PlayerSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <div className="h-14 shrink-0 border-b border-line" />
      <div className="flex flex-1">
        <div className="hidden w-[248px] shrink-0 space-y-2 border-r border-line p-3 lg:block">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
        <div className="mx-auto w-full max-w-[720px] space-y-4 px-4 py-14">
          <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
          <div className="h-8 w-2/3 animate-pulse rounded bg-surface-2" />
          <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
