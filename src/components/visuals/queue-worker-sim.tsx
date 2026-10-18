"use client";

import { useMemo, useState } from "react";
import { RangeControl, Segmented, Stat, VisualFrame, fmtCount } from "./scale-visual-parts";

const VISUAL = "queue-worker-sim";
const DURATION = 180; // seconds simulated
const DT = 0.5;
const BURST_START = 20;
const BURST_LEN = 30;

function fmtDuration(s: number) {
  if (!Number.isFinite(s)) return "never";
  if (s < 1) return `${Math.round(s * 1000)} ms`;
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

export function QueueWorkerSim() {
  const [rate, setRate] = useState(20);
  const [workers, setWorkers] = useState(6);
  const [procMs, setProcMs] = useState(250);
  const [burst, setBurst] = useState<"on" | "off">("on");

  const sim = useMemo(() => {
    const capacity = (workers * 1000) / procMs; // jobs per second
    const points: { t: number; depth: number; arrivals: number }[] = [];
    let depth = 0;
    let peak = 0;
    let peakAt = 0;
    for (let t = 0; t <= DURATION; t += DT) {
      const inBurst = burst === "on" && t >= BURST_START && t < BURST_START + BURST_LEN;
      const arrivals = inBurst ? rate * 5 : rate;
      depth = Math.max(0, depth + (arrivals - capacity) * DT);
      if (depth > peak) {
        peak = depth;
        peakAt = t;
      }
      points.push({ t, depth, arrivals });
    }
    const end = points[points.length - 1].depth;
    const growing = rate >= capacity;
    // Time from peak until empty, if it drains.
    const drain = growing ? Infinity : peak / (capacity - rate);
    const maxWait = peak / capacity + procMs / 1000;
    const util = Math.min(1, rate / capacity);
    return { capacity, points, peak, peakAt, end, growing, drain, maxWait, util };
  }, [rate, workers, procMs, burst]);

  const maxDepth = Math.max(50, sim.peak * 1.1);
  const maxRate = Math.max(sim.capacity, rate * (burst === "on" ? 5 : 1)) * 1.15;
  const W = 600;
  const H = 180;
  const x = (t: number) => (t / DURATION) * W;
  const yDepth = (d: number) => H - (d / maxDepth) * H;
  const yRate = (r: number) => H - (r / maxRate) * H;
  const area = `M0 ${H} ${sim.points.map((p) => `L${x(p.t).toFixed(1)} ${yDepth(p.depth).toFixed(1)}`).join(" ")} L${W} ${H} Z`;
  const depthLine = sim.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${yDepth(p.depth).toFixed(1)}`).join(" ");
  const arrivalLine = sim.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${yRate(p.arrivals).toFixed(1)}`).join(" ");

  return (
    <VisualFrame
      title="Queue depth when the on-sale opens"
      hint="Jobs arrive (PDFs, emails, texts) and workers take them off the queue. At 20 s the on-sale opens and bookings jump 5×. Find a worker count that keeps the wait under a minute."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <RangeControl visual={VISUAL} control="arrival_rate" label="Jobs arriving (normal)" value={rate} min={2} max={60} onChange={setRate} format={(v) => `${v}/s`} />
        <RangeControl visual={VISUAL} control="workers" label="Workers" value={workers} min={1} max={40} onChange={setWorkers} />
        <RangeControl
          visual={VISUAL}
          control="processing_ms"
          label="Time per job"
          value={procMs}
          min={50}
          max={2000}
          step={50}
          onChange={setProcMs}
          format={(v) => `${v} ms`}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        On-sale burst (5× for 30 s):
        <Segmented
          visual={VISUAL}
          control="burst"
          label="On-sale burst"
          value={burst}
          onChange={setBurst}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </div>

      <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-subtle">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-info/50" /> jobs waiting (left scale)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-accent" /> arrivals / s
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-ok" /> worker capacity / s
          </span>
        </div>
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-44 w-full" role="img" aria-label={`Queue depth peaks at ${Math.round(sim.peak)} jobs`}>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
            ))}
            {burst === "on" && <rect x={x(BURST_START)} y={0} width={x(BURST_LEN)} height={H} fill="var(--accent)" opacity={0.06} />}
            <path d={area} fill="var(--info)" opacity={0.35} />
            <path d={depthLine} fill="none" stroke="var(--info)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <path d={arrivalLine} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <line
              x1={0}
              x2={W}
              y1={yRate(sim.capacity)}
              y2={yRate(sim.capacity)}
              stroke="var(--ok)"
              strokeWidth={1.5}
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="absolute top-0 left-1 font-mono text-[10.5px] text-info">{fmtCount(maxDepth)} jobs</span>
          <span className="absolute top-0 right-1 font-mono text-[10.5px] text-accent">{fmtCount(maxRate)}/s</span>
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10.5px] text-subtle">
          <span>0 s</span>
          <span>{burst === "on" ? "on-sale opens at 20 s" : ""}</span>
          <span>{DURATION} s</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Capacity" value={`${fmtCount(sim.capacity)}/s`} sub={`${workers} × 1000/${procMs} ms`} />
        <Stat label="Utilisation" value={`${Math.round(sim.util * 100)}%`} tone={sim.util >= 1 ? "err" : sim.util > 0.8 ? "warn" : "default"} sub="outside the burst" />
        <Stat label="Peak backlog" value={fmtCount(sim.peak)} tone={sim.growing ? "err" : sim.peak > 1000 ? "warn" : "default"} sub="jobs waiting" />
        <Stat
          label="Worst wait"
          value={sim.growing ? "grows forever" : fmtDuration(sim.maxWait)}
          tone={sim.growing ? "err" : sim.maxWait > 60 ? "warn" : "ok"}
          sub={sim.growing ? "arrivals ≥ capacity" : `drains in ${fmtDuration(sim.drain)}`}
        />
      </div>
    </VisualFrame>
  );
}
