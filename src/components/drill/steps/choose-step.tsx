"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useStore } from "zustand";
import { track } from "@/lib/analytics";
import type { DrillStore } from "@/lib/drill/store";
import type { ChooseStep, Drill } from "@/lib/drill/types";
import { cn } from "@/lib/utils";
import { ContinueButton, StepFrame } from "./frame";

type Props = { drill: Drill; step: ChooseStep; index: number; store: DrillStore; onNext: () => void };

export function ChooseStepView({ drill, step, index, store, onNext }: Props) {
  const choice = useStore(store, (s) => s.choices[step.id]);
  const passed = useStore(store, (s) => s.passed.includes(step.id));

  const pick = (id: string) => {
    store.getState().choose(step.id, id);
    track("drill_choice_made", { drill: drill.slug, step: index, option: id });
    if (!passed) store.getState().pass(step.id);
  };

  return (
    <StepFrame
      eyebrow={`Step ${index + 1} · Deep dive`}
      title={step.title}
      wide
      footer={passed ? <ContinueButton onClick={onNext}>Continue</ContinueButton> : <span className="text-[13px] text-subtle">Pick one to see every tradeoff. There&apos;s no wrong answer here.</span>}
    >
      <div className="max-w-[680px] space-y-3 text-[15.5px] leading-relaxed text-muted [&_code]:font-mono [&_code]:text-[0.88em] [&_code]:text-fg [&_strong]:text-fg">
        {step.body}
      </div>
      <p className="mt-8 text-[16px] font-semibold text-fg">{step.prompt}</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {step.options.map((o) => {
          const mine = choice === o.id;
          return (
            <div
              key={o.id}
              className={cn(
                "flex flex-col rounded-2xl border bg-surface p-4 transition-colors",
                mine ? "border-accent/60 ring-1 ring-accent/30" : "border-line",
              )}
            >
              <p className="text-[15px] font-semibold text-fg">{o.title}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{o.summary}</p>
              {choice && (
                <div className="mt-3 space-y-2 border-t border-line pt-3 text-[13px] leading-relaxed">
                  <ul className="space-y-1">
                    {o.pros.map((p) => (
                      <li key={p} className="flex gap-1.5 text-muted">
                        <Plus className="mt-1 size-3 shrink-0 text-ok" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <ul className="space-y-1">
                    {o.cons.map((c) => (
                      <li key={c} className="flex gap-1.5 text-muted">
                        <Minus className="mt-1 size-3 shrink-0 text-err" />
                        {c}
                      </li>
                    ))}
                  </ul>
                  <p className="rounded-lg bg-surface-2 px-2.5 py-2 text-[12.5px] text-fg">{o.when}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => pick(o.id)}
                className={cn(
                  "mt-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors",
                  mine ? "border-accent bg-accent text-accent-fg" : "border-line-strong text-fg hover:bg-surface-2",
                  choice ? "mt-3" : "mt-4",
                )}
              >
                {mine && <Check className="size-3.5" />}
                {mine ? "Your pick" : "I'd pick this"}
              </button>
            </div>
          );
        })}
      </div>
      {choice && step.after && (
        <div className="mt-8 rounded-2xl border border-accent/30 bg-accent-soft/40 p-5 text-[15px] leading-relaxed text-muted [&_strong]:text-fg">{step.after}</div>
      )}
    </StepFrame>
  );
}
