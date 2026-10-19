"use client";

import confetti from "canvas-confetti";
import { ArrowRight, BookOpen, CircleCheck, FlaskConical, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import { getLesson } from "@/content/course";
import { getDrillMeta } from "@/content/drills/catalog";
import { track } from "@/lib/analytics";
import { dbLabelOf } from "@/lib/drill/run";
import type { DrillStore } from "@/lib/drill/store";
import type { FinishStep, Drill } from "@/lib/drill/types";
import { formatMinutes } from "@/lib/utils";
import { DesignCanvas } from "../canvas/design-canvas";
import { StepFrame } from "./frame";

type Props = { drill: Drill; step: FinishStep; index: number; store: DrillStore };

export function FinishStepView({ drill, step, index, store }: Props) {
  const runs = useStore(store, (s) => s.runs);
  const passed = useStore(store, (s) => s.passed);
  const choices = useStore(store, (s) => s.choices);
  const schema = useStore(store, (s) => s.schema);
  const startedAt = useStore(store, (s) => s.startedAt);
  const completedAt = useStore(store, (s) => s.completedAt);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const s = store.getState();
    if (!s.completedAt) {
      s.complete();
      if (!s.passed.includes(step.id)) s.pass(step.id);
      track("drill_step_completed", { drill: drill.slug, step: index, type: step.type });
      track("drill_completed", { drill: drill.slug, seconds: Math.round((Date.now() - (s.startedAt ?? Date.now())) / 1000) });
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#3ecf8e", "#f5a524", "#b89cff", "#ededed"];
    confetti({ particleCount: 110, spread: 75, origin: { y: 0.35 }, colors, disableForReducedMotion: true });
    const t = setTimeout(() => confetti({ particleCount: 60, spread: 110, origin: { y: 0.45 }, colors, disableForReducedMotion: true }), 350);
    return () => clearTimeout(t);
  }, [index, drill.slug, step.id, step.type, store]);

  const designs = drill.steps.filter((s) => s.type === "design");
  const concepts = [...new Map(designs.flatMap((s) => s.concepts).map((c) => [c.term, c])).values()];
  const minutes = startedAt && completedAt ? Math.max(1, Math.round((completedAt - startedAt) / 60000)) : null;
  const dbLabel = dbLabelOf(drill, schema);
  const lessons = drill.related.lessons.map(getLesson).filter((l) => !!l);
  const drills = drill.related.drills.map(getDrillMeta).filter((l) => !!l);
  const picks = drill.steps.flatMap((s) => {
    if (s.type !== "choose") return [];
    const option = s.options.find((o) => o.id === choices[s.id]);
    return option ? [{ id: s.id, label: s.short ?? s.title, option }] : [];
  });

  return (
    <StepFrame eyebrow="Drill complete" title={step.title} wide>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Trophy className="size-6" />
        </span>
        <div className="text-[15px] text-muted">
          <p className="font-medium text-fg">
            {passed.filter((id) => designs.some((d) => d.id === id)).length} load tests passed
            {minutes ? ` in ${formatMinutes(minutes)}` : ""}.
          </p>
          <p>From one small server to a design that holds up under real traffic and real failures.</p>
        </div>
      </div>

      <div className="mt-6 max-w-[680px] space-y-3 text-[15.5px] leading-relaxed text-muted [&_strong]:text-fg">{step.body}</div>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] tracking-wider text-subtle uppercase">Your final architecture</h2>
        <div className="mt-3 h-[380px] overflow-hidden rounded-2xl border border-line">
          <DesignCanvas drill={drill.slug} store={store} palette={[]} dbLabel={dbLabel} selected={null} onSelect={() => {}} frame={null} locked />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] tracking-wider text-subtle uppercase">What you built, step by step</h2>
        <ol className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {designs.map((d) => {
            const r = runs[d.id];
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <CircleCheck className="size-4 text-ok" />
                <span className="min-w-[180px] flex-1 text-[14px] text-fg">{d.short ?? d.title}</span>
                {r && (
                  <span className="font-mono text-[12px] text-muted">
                    {(r.successRate * 100).toFixed(2)}% · p99 {r.p99} ms · ${r.cost.toLocaleString("en-US")}/mo
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {picks.map((p) => (
          <p key={p.id} className="mt-3 text-[13.5px] text-muted">
            {p.label}, your pick: <span className="font-medium text-fg">{p.option.title}</span>.
          </p>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] tracking-wider text-subtle uppercase">Concepts you used</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {concepts.map((c) => (
            <span key={c.term} title={c.text} className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-fg">
              {c.term}
            </span>
          ))}
        </div>
      </section>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <section>
          <h2 className="font-mono text-[11px] tracking-wider text-subtle uppercase">Go deeper</h2>
          <ul className="mt-3 space-y-2">
            {lessons.map((l) => (
              <li key={l.slug}>
                <Link href={`/learn/${l.slug}`} className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 hover:border-line-strong">
                  <BookOpen className="size-4 text-accent" />
                  <span className="flex-1">
                    <span className="block text-[14px] text-fg">{l.title}</span>
                    <span className="block text-[12px] text-subtle">
                      {l.module.title} · {l.minutes} min
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="font-mono text-[11px] tracking-wider text-subtle uppercase">Next drill</h2>
          <ul className="mt-3 space-y-2">
            {drills.map((l) => (
              <li key={l.slug}>
                <Link href={`/drills/${l.slug}`} className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 hover:border-line-strong">
                  <FlaskConical className="size-4 text-info" />
                  <span className="flex-1">
                    <span className="block text-[14px] text-fg">{l.title}</span>
                    <span className="block text-[12px] text-subtle">{l.tagline}</span>
                  </span>
                  <ArrowRight className="size-4 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/drills" className="mt-3 inline-flex items-center gap-1 text-[13px] text-accent hover:underline">
            All drills <ArrowRight className="size-3.5" />
          </Link>
        </section>
      </div>
    </StepFrame>
  );
}
