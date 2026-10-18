"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Meter, RangeField, VisualFrame, fmt, trackVisual } from "./caching-scaling-ui";

const VISUAL = "scale-up-vs-out";
const SIZES = [2, 4, 8, 16, 32, 64, 128];
const TARGET = 0.7; // keep machines below 70% busy so spikes have room
const OUT_SIZE = 8;
const LB_COST = 25;

/** Requests/s one API server of `v` vCPUs can handle. Grows slower than v: locks, memory bandwidth, GC. */
const capacity = (v: number) => Math.round(500 * Math.pow(v, 0.85));
/** $/month. The biggest machines carry a premium. */
const price = (v: number) => Math.round(35 * v * (v >= 64 ? 1.25 : 1));

const LOADS = [500, 1000, 2000, 3000, 5000, 8000, 12_000, 16_000, 20_000, 25_000, 30_000, 40_000, 60_000];

function scaleUp(load: number) {
  const v = SIZES.find((s) => load <= capacity(s) * TARGET);
  if (v === undefined) {
    const big = SIZES[SIZES.length - 1];
    return { v: big, cost: price(big), util: load / capacity(big), ok: false };
  }
  return { v, cost: price(v), util: load / capacity(v), ok: true };
}

function scaleOut(load: number) {
  const each = capacity(OUT_SIZE);
  const n = Math.max(2, Math.ceil(load / (each * TARGET)));
  return { n, cost: n * price(OUT_SIZE) + LB_COST, util: load / (n * each), afterLoss: load / ((n - 1) * each) };
}

const W = 440;
const H = 190;
const PAD = { l: 48, r: 12, t: 12, b: 30 };
const xOf = (l: number) => PAD.l + ((Math.log10(l) - Math.log10(500)) / (Math.log10(60_000) - Math.log10(500))) * (W - PAD.l - PAD.r);
const MAX_COST = 8000;
const yOf = (c: number) => PAD.t + (1 - Math.min(c, MAX_COST) / MAX_COST) * (H - PAD.t - PAD.b);

export function ScaleUpVsOut() {
  const [idx, setIdx] = useState(4);
  const load = LOADS[idx];
  const up = scaleUp(load);
  const out = scaleOut(load);

  const curves = useMemo(() => {
    const upPts: string[] = [];
    const outPts: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const l = 500 * Math.pow(120, i / 120);
      const u = scaleUp(l);
      if (u.ok) upPts.push(`${upPts.length ? "L" : "M"}${xOf(l).toFixed(1)} ${yOf(u.cost).toFixed(1)}`);
      const o = scaleOut(l);
      outPts.push(`${i ? "L" : "M"}${xOf(l).toFixed(1)} ${yOf(o.cost).toFixed(1)}`);
    }
    return { up: upPts.join(" "), out: outPts.join(" ") };
  }, []);

  const upEndX = xOf(capacity(128) * TARGET);

  return (
    <VisualFrame
      title="Bigger box or more boxes?"
      hint="Drag the load. Left: one API server, upgraded to the smallest size that stays under 70% busy. Right: as many 8-vCPU servers as needed behind a load balancer."
      caption="Capacity per machine grows slower than its vCPU count (500 × vCPU^0.85 requests/s), and the largest machines cost more per vCPU. Prices are illustrative."
    >
      <RangeField
        label="Peak load"
        value={idx}
        min={0}
        max={LOADS.length - 1}
        onChange={setIdx}
        onCommit={(v) => trackVisual(VISUAL, "load", LOADS[v])}
        format={(v) => `${fmt(LOADS[v])} req/s`}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={cn("min-w-0 rounded-xl border bg-bg p-3", up.ok ? "border-line" : "border-err/50")}>
          <p className="font-mono text-[10.5px] tracking-wider text-accent uppercase">Scale up</p>
          <p className="mt-1 text-[15px] font-semibold text-fg">
            1 × {up.v} vCPU {up.ok ? "" : "(the largest there is)"}
          </p>
          <p className="font-mono text-[12px] text-muted tabular-nums">${fmt(up.cost)}/month</p>
          <Meter className="mt-3" value={up.util} label="CPU at peak" />
          <ul className="mt-3 space-y-1 text-[12.5px] leading-snug">
            <li className={up.ok ? "text-muted" : "text-err"}>
              {up.ok ? `Handles up to ${fmt(Math.round(capacity(up.v) * TARGET))} req/s comfortably.` : "No machine is big enough. Requests queue and time out."}
            </li>
            <li className="text-err">If it dies or reboots for an upgrade: 100% of traffic fails.</li>
          </ul>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-bg p-3">
          <p className="font-mono text-[10.5px] tracking-wider text-info uppercase">Scale out</p>
          <p className="mt-1 text-[15px] font-semibold text-fg">
            {out.n} × {OUT_SIZE} vCPU + load balancer
          </p>
          <p className="font-mono text-[12px] text-muted tabular-nums">${fmt(out.cost)}/month</p>
          <Meter className="mt-3" value={out.util} label="CPU at peak (each)" />
          <ul className="mt-3 space-y-1 text-[12.5px] leading-snug">
            <li className="text-muted">Add a server whenever load grows. No upper limit from hardware.</li>
            <li className={out.afterLoss >= 1 ? "text-err" : out.afterLoss > 0.85 ? "text-warn" : "text-ok"}>
              If one dies: the other {out.n - 1} run at {Math.round(out.afterLoss * 100)}%.
            </li>
          </ul>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 block h-auto w-full" role="img" aria-label="Monthly cost against load for scaling up and scaling out">
        {[0, 2000, 4000, 6000, 8000].map((c) => (
          <g key={c}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(c)} y2={yOf(c)} stroke="var(--border)" strokeDasharray={c ? "3 4" : undefined} />
            <text x={PAD.l - 6} y={yOf(c) + 4} fontSize={10.5} textAnchor="end" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
              ${c / 1000}k
            </text>
          </g>
        ))}
        {[500, 1000, 5000, 10_000, 50_000].map((l) => (
          <text key={l} x={xOf(l)} y={H - 12} fontSize={10.5} textAnchor="middle" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
            {l >= 1000 ? `${l / 1000}k` : l}
          </text>
        ))}
        <text x={W - PAD.r} y={H - 0} fontSize={10} textAnchor="end" fill="var(--fg-subtle)">
          req/s (log)
        </text>
        <path d={curves.out} fill="none" stroke="var(--info)" strokeWidth={2} />
        <path d={curves.up} fill="none" stroke="var(--accent)" strokeWidth={2} />
        <line x1={upEndX} x2={upEndX} y1={PAD.t} y2={H - PAD.b} stroke="var(--err)" strokeDasharray="3 3" />
        <text x={upEndX - 4} y={PAD.t + 10} fontSize={10.5} textAnchor="end" fill="var(--err)">
          biggest box full
        </text>
        <line x1={xOf(load)} x2={xOf(load)} y1={PAD.t} y2={H - PAD.b} stroke="var(--fg-subtle)" />
        {up.ok && <circle cx={xOf(load)} cy={yOf(up.cost)} r={4.5} fill="var(--accent)" />}
        <circle cx={xOf(load)} cy={yOf(out.cost)} r={4.5} fill="var(--info)" />
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-accent" /> one bigger machine
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-info" /> many 8-vCPU machines
        </span>
      </div>
    </VisualFrame>
  );
}
