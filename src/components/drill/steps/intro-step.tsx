"use client";

import { Check } from "lucide-react";
import type { IntroStep, Drill } from "@/lib/drill/types";
import { ContinueButton, StepFrame } from "./frame";

export function IntroStepView({ drill, step, onDone }: { drill: Drill; step: IntroStep; onDone: () => void }) {
  const functional = drill.requirements.filter((r) => r.kind === "functional");
  const nonFunctional = drill.requirements.filter((r) => r.kind === "non-functional");
  const minutes = drill.steps.reduce((n, s) => n + s.minutes, 0);
  return (
    <StepFrame
      eyebrow={`${drill.product} · about ${minutes} minutes`}
      title={step.title}
      wide
      footer={<ContinueButton onClick={onDone}>Start designing</ContinueButton>}
    >
      <div className="max-w-[680px] space-y-4 text-[16px] leading-relaxed text-muted [&_strong]:text-fg">{drill.intro}</div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-[13px] text-subtle">What it must do</h2>
          <ul className="mt-3 space-y-3">
            {functional.map((r) => (
              <li key={r.text} className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-ok" />
                <span>
                  <span className="text-[14.5px] font-medium text-fg">{r.text}</span>
                  {r.detail && <span className="block text-[13px] text-muted">{r.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-[13px] text-subtle">How well it must do it</h2>
          <ul className="mt-3 space-y-3">
            {nonFunctional.map((r) => (
              <li key={r.text} className="flex gap-2.5">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
                <span>
                  <span className="text-[14.5px] font-medium text-fg">{r.text}</span>
                  {r.detail && <span className="block text-[13px] text-muted">{r.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-[13px] text-subtle">Back of the envelope</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {drill.estimates.map((e) => (
            <div key={e.label} className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="text-[12px] text-muted">{e.label}</p>
              <p className="mt-0.5 font-mono text-[20px] font-semibold text-fg">{e.value}</p>
              <p className="mt-1 font-mono text-[11px] leading-snug text-subtle">{e.math}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[18px] font-semibold text-fg">How this drill works</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {step.how.map((h, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-line bg-surface p-3.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-[12px] font-semibold text-accent">
                {i + 1}
              </span>
              <span className="text-[14px] leading-relaxed text-muted">{h}</span>
            </li>
          ))}
        </ol>
      </section>
    </StepFrame>
  );
}
