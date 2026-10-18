"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Stat, Toggle, VisualFrame, fmt, mulberry32, trackVisual, useInterval, usePrefersReducedMotion } from "./caching-scaling-ui";

const VISUAL = "thundering-herd-sim";
const CAP = 3000; // DB queries/s before it saturates
const BASE = 300; // other DB traffic (bookings, logins)
const TTL = 30; // seconds
const DT = 0.1;
const DURATION = 120;
const SERVERS = 20;
const BASE_R = 0.25; // seconds to rebuild a page on an idle DB
const HOT_RPS = 6000;
const TAIL_RPS = 6000;
const TAIL_KEYS = 40;
const BUCKET = 0.5; // seconds per bar

type Opts = { coalesce: boolean; early: boolean; jitter: boolean };

/**
 * A fixed-step simulation. Every key was cached at t = 0 (just after a deploy).
 * When a key expires, requests for it miss and hit the database until one of
 * them rebuilds it. Rebuild time grows as the database gets busier, which is
 * what turns a spike into a pile-up.
 */
function simulate(o: Opts) {
  const rates = [HOT_RPS];
  let z = 0;
  for (let i = 1; i <= TAIL_KEYS; i++) z += 1 / i;
  for (let i = 1; i <= TAIL_KEYS; i++) rates.push((TAIL_RPS * (1 / i)) / z);
  const rand = mulberry32(7);
  const ttl = () => (o.jitter ? TTL * (0.8 + 0.4 * rand()) : TTL);
  const keys = rates.map((rate) => ({ rate, expires: ttl(), missing: false, progress: 0 }));
  const steps = Math.round(DURATION / DT);
  const load: number[] = [];
  let prev = BASE;
  let failed = 0;
  let total = 0;
  for (let s = 0; s < steps; s++) {
    const t = s * DT;
    let q = BASE;
    let refreshes = 0;
    const u = prev / CAP;
    const rebuild = BASE_R * (u >= 0.95 ? 20 : Math.min(20, 1 / (1 - u)));
    for (const k of keys) {
      if (!k.missing && t >= k.expires) {
        if (o.early) {
          // refreshed in the background just before expiry: one query, no miss
          refreshes += 1;
          k.expires = t + ttl();
          continue;
        }
        k.missing = true;
        k.progress = 0;
      }
      if (k.missing) {
        // coalescing: each app server sends at most one rebuild query per key at a time
        q += o.coalesce ? Math.min(k.rate, SERVERS / rebuild) : k.rate;
        k.progress += DT / rebuild;
        if (k.progress >= 1) {
          k.missing = false;
          k.expires = t + ttl();
        }
      }
    }
    q += refreshes / DT;
    load.push(q);
    prev = q;
    total += q * DT;
    if (q > CAP) failed += (q - CAP) * DT;
  }
  const per = Math.round(BUCKET / DT);
  const bars: number[] = [];
  for (let i = 0; i < load.length; i += per) {
    let m = 0;
    for (let j = i; j < i + per; j++) m = Math.max(m, load[j]);
    bars.push(m);
  }
  return { bars, failed, total, peak: Math.max(...load), over: load.filter((x) => x > CAP).length * DT };
}

const W = 480;
const H = 210;
const PAD = { l: 44, r: 10, t: 12, b: 28 };

export function ThunderingHerdSim() {
  const reduced = usePrefersReducedMotion();
  const [opts, setOpts] = useState<Opts>({ coalesce: false, early: false, jitter: false });
  const [progress, setProgress] = useState(1);
  const sim = useMemo(() => simulate(opts), [opts]);

  useInterval(() => setProgress((p) => Math.min(1, p + 0.012)), 40, progress < 1 && !reduced);
  const shown = reduced ? 1 : progress;

  const max = Math.max(4000, sim.peak * 1.08);
  const yOf = (v: number) => PAD.t + (1 - Math.min(v, max) / max) * (H - PAD.t - PAD.b);
  const bw = (W - PAD.l - PAD.r) / sim.bars.length;
  const visibleBars = Math.round(sim.bars.length * shown);
  const ticks = [0, 1000, 2000, 3000, 5000, 10_000, 15_000, 20_000].filter((v) => v <= max);

  function set(key: keyof Opts, v: boolean) {
    setOpts((o) => ({ ...o, [key]: v }));
    setProgress(0);
    trackVisual(VISUAL, key, v);
  }

  const bad = sim.over > 0;

  return (
    <VisualFrame
      title="A hot key expires"
      hint="Two minutes of Gatepass traffic after a deploy cached everything at once: the band's page at 6,000 reads/s plus 40 other event pages. TTL is 30 s. Turn on protections and watch the database."
      caption="Each bar is the peak database load in half a second. Rebuilding a page takes 250 ms on an idle database and much longer on a busy one, so a herd feeds itself."
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <Toggle label="Request coalescing" description="One rebuild per key per server; others wait for it." checked={opts.coalesce} onChange={(v) => set("coalesce", v)} />
        <Toggle label="Early refresh" description="Rebuild in the background before the TTL ends." checked={opts.early} onChange={(v) => set("early", v)} />
        <Toggle label="Jittered TTL" description="TTL is 30 s ± 20%, so keys expire apart." checked={opts.jitter} onChange={(v) => set("jitter", v)} />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 block h-auto w-full" role="img" aria-label={`Peak database load ${fmt(sim.peak)} queries per second; capacity ${fmt(CAP)}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="var(--border)" strokeDasharray={v ? "3 4" : undefined} />
            <text x={PAD.l - 6} y={yOf(v) + 4} fontSize={10.5} textAnchor="end" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
              {v >= 1000 ? `${v / 1000}k` : v}
            </text>
          </g>
        ))}
        {sim.bars.map((v, i) => (
          <rect
            key={i}
            x={PAD.l + i * bw}
            y={yOf(v)}
            width={Math.max(0.8, bw - 0.4)}
            height={H - PAD.b - yOf(v)}
            fill={v > CAP ? "var(--err)" : v > CAP * 0.8 ? "var(--warn)" : "var(--res)"}
            opacity={i < visibleBars ? 0.9 : 0.08}
          />
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={yOf(CAP)} y2={yOf(CAP)} stroke="var(--err)" strokeWidth={1.2} strokeDasharray="6 3" />
        <text x={W - PAD.r} y={yOf(CAP) - 5} fontSize={10.5} textAnchor="end" fill="var(--err)" fontFamily="var(--font-geist-mono)">
          DB capacity 3k/s
        </text>
        {[0, 30, 60, 90, 120].map((s) => (
          <text key={s} x={PAD.l + (s / DURATION) * (W - PAD.l - PAD.r)} y={H - 10} fontSize={10.5} textAnchor="middle" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
            {s}s
          </text>
        ))}
        {shown < 1 && (
          <line x1={PAD.l + shown * (W - PAD.l - PAD.r)} x2={PAD.l + shown * (W - PAD.l - PAD.r)} y1={PAD.t} y2={H - PAD.b} stroke="var(--accent)" strokeWidth={1.5} />
        )}
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Peak DB load" value={`${fmt(sim.peak)}/s`} tone={sim.peak > CAP ? "err" : sim.peak > CAP * 0.8 ? "warn" : "ok"} />
        <Stat label="Time overloaded" value={`${fmt(sim.over, 1)} s`} tone={bad ? "err" : "ok"} />
        <Stat label="Queries refused" value={fmt(sim.failed)} sub="beyond capacity" tone={sim.failed ? "err" : "ok"} />
        <Stat label="DB queries total" value={fmt(sim.total)} sub="over 2 minutes" />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className={cn("text-[12.5px]", bad ? "text-err" : sim.peak > CAP * 0.8 ? "text-warn" : "text-ok")} aria-live="polite">
          {bad
            ? "Each expiry sends a wall of misses to the database. It slows down, rebuilds take longer, and the misses keep coming."
            : sim.peak > CAP * 0.8
              ? "No overload, but expiries still line up into spikes close to the limit."
              : "The database barely notices the expiries."}
        </p>
        {!reduced && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setProgress(0);
              trackVisual(VISUAL, "replay", true);
            }}
          >
            <RotateCcw className="size-3.5" /> Replay
          </Button>
        )}
      </div>
    </VisualFrame>
  );
}
