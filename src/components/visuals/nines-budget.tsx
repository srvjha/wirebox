"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Segmented, Stat, VisualShell, useVisualTracker } from "./visual-shell";

const TARGETS = ["99", "99.9", "99.95", "99.99", "99.999"] as const;
const MIN_YEAR = 365 * 24 * 60;
const MIN_MONTH = 30 * 24 * 60;
const MIN_WEEK = 7 * 24 * 60;

function fmt(min: number) {
  if (min >= 120) return `${(min / 60).toFixed(1)} h`;
  if (min >= 1) return `${min.toFixed(min >= 10 ? 0 : 1)} min`;
  return `${(min * 60).toFixed(min * 60 >= 10 ? 0 : 1)} s`;
}

const down = (target: number, total: number) => total * (1 - target / 100);

export function NinesBudget() {
  const track = useVisualTracker("nines-budget");
  const [target, setTarget] = useState<(typeof TARGETS)[number]>("99.9");
  const [outage, setOutage] = useState(20);
  const [chain, setChain] = useState(4);
  const [redundant, setRedundant] = useState(false);

  const t = Number(target);
  const budget = down(t, MIN_MONTH);
  const burn = outage / budget;
  const perDep = 0.999;
  const depAvail = redundant ? 1 - (1 - perDep) ** 2 : perDep;
  const total = depAvail ** chain;
  const totalMonth = MIN_MONTH * (1 - total);

  return (
    <VisualShell
      title="What a nine costs you"
      hint="Pick an availability target to see how little downtime it allows, spend the monthly error budget, then chain dependencies together."
    >
      <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">1 · Target</p>
      <Segmented
        className="mt-1.5"
        label="Availability target"
        value={target}
        onChange={(v) => {
          track("target", v);
          setTarget(v);
        }}
        options={TARGETS.map((x) => ({ value: x, label: `${x}%` }))}
      />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Down per year" value={fmt(down(t, MIN_YEAR))} />
        <Stat label="Per month" value={fmt(down(t, MIN_MONTH))} tone="accent" />
        <Stat label="Per week" value={fmt(down(t, MIN_WEEK))} />
      </div>

      <p className="mt-6 font-mono text-[10px] tracking-wider text-subtle uppercase">2 · Error budget this month</p>
      <label htmlFor="nb-outage" className="mt-1.5 flex justify-between text-[12.5px] text-muted">
        <span>Outage so far</span>
        <span className="font-mono text-fg">{outage} min</span>
      </label>
      <input
        id="nb-outage"
        type="range"
        min={0}
        max={120}
        value={outage}
        onChange={(e) => setOutage(Number(e.target.value))}
        onPointerUp={() => track("outage_minutes", outage)}
        onKeyUp={() => track("outage_minutes", outage)}
        className="mt-1 w-full accent-[var(--accent)]"
      />
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${Math.round(burn * 100)} percent of the error budget used`}>
        <div
          className={cn("h-full rounded-full transition-all", burn > 1 ? "bg-err" : burn > 0.7 ? "bg-warn" : "bg-ok")}
          style={{ width: `${Math.min(burn, 1) * 100}%` }}
        />
      </div>
      <p className="mt-1.5 text-[13px] text-muted">
        Budget for {target}% is <span className="font-mono text-fg">{fmt(budget)}</span>. You have used{" "}
        <span className={cn("font-mono font-semibold", burn > 1 ? "text-err" : burn > 0.7 ? "text-warn" : "text-ok")}>{Math.round(burn * 100)}%</span>
        {burn > 1 ? ": the SLO is blown. Freeze risky releases and spend time on reliability." : burn > 0.7 ? ": slow down on risky launches." : ": room to ship."}
      </p>

      <p className="mt-6 font-mono text-[10px] tracking-wider text-subtle uppercase">3 · Dependencies</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          Services in the request path
          <input
            type="range"
            min={1}
            max={8}
            value={chain}
            aria-label="Number of services in the request path"
            onChange={(e) => setChain(Number(e.target.value))}
            onPointerUp={() => track("chain", chain)}
            onKeyUp={() => track("chain", chain)}
            className="w-28 accent-[var(--accent)]"
          />
          <span className="font-mono text-fg">{chain}</span>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          <input
            type="checkbox"
            checked={redundant}
            onChange={(e) => {
              track("redundant", e.target.checked);
              setRedundant(e.target.checked);
            }}
            className="size-3.5 accent-[var(--accent)]"
          />
          Run each one as 2 independent replicas
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-hidden>
        {Array.from({ length: chain }).map((_, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="flex flex-col gap-0.5">
              <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10.5px] text-fg">99.9%</span>
              {redundant && <span className="rounded-md border border-ok/40 bg-ok/10 px-2 py-0.5 font-mono text-[10.5px] text-ok">99.9%</span>}
            </span>
            {i < chain - 1 && <span className="text-subtle">→</span>}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Combined availability" value={`${(total * 100).toFixed(3)}%`} tone={total * 100 >= t ? "ok" : "err"} />
        <Stat label="Downtime per month" value={fmt(totalMonth)} />
      </div>
      <p className="mt-2 text-[13px] text-subtle">
        In series, availabilities multiply, so the chain is weaker than its weakest link. In parallel, failures must coincide, so two 99.9% replicas give
        99.9999% for that hop (if they really fail independently).
        {total * 100 < t && ` This chain misses your ${target}% target.`}
      </p>
    </VisualShell>
  );
}
