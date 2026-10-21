"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { RangeControl, Segmented, Stat, VisualFrame, fmtCount, seeded } from "./scale-visual-parts";

const VISUAL = "retry-backoff-jitter";
const CLIENTS = 2000;
const BUCKET = 0.1; // seconds
const HORIZON = 40; // seconds
const BUCKETS = HORIZON / BUCKET;

type Strategy = "immediate" | "fixed" | "expo" | "jitter";

const LABELS: Record<Strategy, string> = {
  immediate: "Retry at once",
  fixed: "Every 1 s",
  expo: "Exponential",
  jitter: "Exponential + jitter",
};

/** Delay before retry number `n` (1-based). */
function delayFor(s: Strategy, n: number, rand: () => number) {
  const capped = Math.min(16, 0.5 * 2 ** (n - 1));
  switch (s) {
    case "immediate":
      return 0.1;
    case "fixed":
      return 1;
    case "expo":
      return capped;
    case "jitter":
      return Math.max(0.1, rand() * capped);
  }
}

function simulate(strategy: Strategy, outage: number, capacity: number) {
  const rand = seeded(42);
  const ok = new Array<number>(BUCKETS).fill(0);
  const fail = new Array<number>(BUCKETS).fill(0);
  // Every client's first call fails within the first 200 ms of the outage.
  let pending = Array.from({ length: CLIENTS }, () => ({ at: rand() * 0.2, tries: 0 }));
  const perBucket = capacity * BUCKET;
  let doneAt = Infinity;
  let attempts = 0;
  for (let b = 0; b < BUCKETS && pending.length; b++) {
    const t0 = b * BUCKET;
    const t1 = t0 + BUCKET;
    const now = pending.filter((p) => p.at < t1);
    const later = pending.filter((p) => p.at >= t1);
    let served = 0;
    // An overloaded provider gets slower, not just full: past 2x its capacity,
    // time spent rejecting calls eats into the calls it can actually serve.
    const limit = perBucket / Math.max(1, now.length / (perBucket * 2));
    const retry: typeof pending = [];
    for (const p of now) {
      attempts++;
      p.tries++;
      const healthy = t0 >= outage;
      if (healthy && served < limit) {
        served++;
        ok[b]++;
      } else {
        fail[b]++;
        retry.push({ at: t1 + delayFor(strategy, p.tries, rand) - BUCKET * 0.5, tries: p.tries });
      }
    }
    pending = later.concat(retry);
    if (!pending.length) doneAt = t1;
  }
  // Ignore the first 300 ms: every strategy's first calls arrive together.
  const peak = Math.max(...ok.map((v, i) => (i < 3 ? 0 : v + fail[i]))) / BUCKET;
  return { ok, fail, doneAt, attempts, peak, left: pending.length };
}

export function RetryBackoffJitter() {
  const [strategy, setStrategy] = useState<Strategy>("immediate");
  const [outage, setOutage] = useState(8);
  const [capacity, setCapacity] = useState(400);

  const all = useMemo(() => {
    const out = {} as Record<Strategy, ReturnType<typeof simulate>>;
    (Object.keys(LABELS) as Strategy[]).forEach((s) => (out[s] = simulate(s, outage, capacity)));
    return out;
  }, [outage, capacity]);
  const sim = all[strategy];

  const maxBar = Math.max(capacity * BUCKET * 1.3, ...sim.ok.map((v, i) => v + sim.fail[i]));
  const H = 160;
  const y = (v: number) => (v / maxBar) * H;

  return (
    <VisualFrame
      title="2,000 workers, one SMS outage"
      hint="The SMS provider goes down at 0 s. Every worker's call fails and each one retries by its own rule. Bars are calls per 100 ms; the dashed line is what the provider can serve once it's back."
    >
      <Segmented
        visual={VISUAL}
        label="Retry strategy"
        value={strategy}
        onChange={setStrategy}
        options={(Object.keys(LABELS) as Strategy[]).map((s) => ({ value: s, label: LABELS[s] }))}
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <RangeControl visual={VISUAL} label="Outage length" value={outage} min={2} max={20} onChange={setOutage} format={(v) => `${v} s`} />
        <RangeControl
          visual={VISUAL}
          label="Provider capacity once back"
          value={capacity}
          min={100}
          max={1000}
          step={50}
          onChange={setCapacity}
          format={(v) => `${v}/s`}
        />
      </div>

      <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
        <svg viewBox={`0 0 ${BUCKETS} ${H}`} preserveAspectRatio="none" className="block h-40 w-full" role="img" aria-label={`${LABELS[strategy]}: peak ${Math.round(sim.peak)} calls per second`}>
          <rect x={0} y={0} width={outage / BUCKET} height={H} fill="var(--err)" opacity={0.07} />
          {sim.ok.map((v, i) => {
            const f = sim.fail[i];
            if (!v && !f) return null;
            return (
              <g key={i}>
                <rect x={i} y={H - y(f) - y(v)} width={0.85} height={y(f)} fill="var(--err)" />
                <rect x={i} y={H - y(v)} width={0.85} height={y(v)} fill="var(--ok)" />
              </g>
            );
          })}
          <line x1={0} x2={BUCKETS} y1={H - y(capacity * BUCKET)} y2={H - y(capacity * BUCKET)} stroke="var(--fg-muted)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="mt-1 flex justify-between font-mono text-[10.5px] text-subtle">
          <span>0 s</span>
          <span className="text-err">outage ends at {outage} s</span>
          <span>{HORIZON} s</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-subtle">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-err" /> failed call
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-ok" /> succeeded
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Total calls" value={fmtCount(sim.attempts)} tone={sim.attempts > 20000 ? "err" : "default"} sub={`for ${fmtCount(CLIENTS)} jobs`} />
        <Stat label="Peak load" value={`${fmtCount(sim.peak)}/s`} tone={sim.peak > capacity * 3 ? "err" : sim.peak > capacity ? "warn" : "ok"} sub={`${(sim.peak / capacity).toFixed(1)}× capacity`} />
        <Stat
          label="All delivered"
          value={Number.isFinite(sim.doneAt) ? `${sim.doneAt.toFixed(1)} s` : "not yet"}
          tone={Number.isFinite(sim.doneAt) ? "ok" : "err"}
          sub={Number.isFinite(sim.doneAt) ? "after the outage began" : `${fmtCount(sim.left)} still retrying`}
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-[12.5px]">
          <thead className="text-subtle">
            <tr>
              <th className="py-1.5 pr-2 font-normal">Strategy</th>
              <th className="py-1.5 pr-2 font-normal">Calls</th>
              <th className="py-1.5 pr-2 font-normal">Peak</th>
              <th className="py-1.5 font-normal">All delivered</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(LABELS) as Strategy[]).map((s) => {
              const r = all[s];
              return (
                <tr key={s} className={cn("border-t border-line", s === strategy ? "text-fg" : "text-muted")}>
                  <td className="py-1.5 pr-2">{LABELS[s]}</td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums">{fmtCount(r.attempts)}</td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums">{fmtCount(r.peak)}/s</td>
                  <td className="py-1.5 font-mono tabular-nums">{Number.isFinite(r.doneAt) ? `${r.doneAt.toFixed(1)} s` : "not in 40 s"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </VisualFrame>
  );
}
