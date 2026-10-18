"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Pause, Play, RotateCcw, Send, Waves, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { VisualFrame } from "./scale-visual-parts";

const VISUAL = "rate-limit-algorithms";
const LIMIT = 5; // requests…
const PERIOD = 2; // …per 2 seconds
const RATE = LIMIT / PERIOD; // 2.5 per second
const VIEW = 8; // seconds of history on screen

type Outcome = "pass" | "reject" | "delay";
type Decision = { t: number; outcome: Outcome; release?: number };

/* ---------- the five algorithms, as pure functions of the arrival times ---------- */

function tokenBucket(arr: number[], now: number) {
  let tokens = LIMIT;
  let last = 0;
  const out: Decision[] = [];
  for (const t of arr) {
    tokens = Math.min(LIMIT, tokens + (t - last) * RATE);
    last = t;
    if (tokens >= 1) {
      tokens -= 1;
      out.push({ t, outcome: "pass" });
    } else out.push({ t, outcome: "reject" });
  }
  tokens = Math.min(LIMIT, tokens + Math.max(0, now - last) * RATE);
  return { out, state: `${tokens.toFixed(1)} of ${LIMIT} tokens`, fill: tokens / LIMIT };
}

function leakyBucket(arr: number[], now: number) {
  const queue: number[] = []; // release times of requests still waiting
  let lastRelease = -Infinity;
  const out: Decision[] = [];
  for (const t of arr) {
    while (queue.length && queue[0] <= t) queue.shift();
    if (queue.length >= LIMIT) {
      out.push({ t, outcome: "reject" });
      continue;
    }
    const release = Math.max(t, lastRelease + 1 / RATE);
    lastRelease = release;
    queue.push(release);
    out.push({ t, outcome: release - t > 0.02 ? "delay" : "pass", release });
  }
  const waiting = queue.filter((r) => r > now).length;
  return { out, state: `${waiting} of ${LIMIT} queued`, fill: waiting / LIMIT };
}

function fixedWindow(arr: number[], now: number) {
  const counts = new Map<number, number>();
  const out: Decision[] = [];
  for (const t of arr) {
    const w = Math.floor(t / PERIOD);
    const c = counts.get(w) ?? 0;
    if (c < LIMIT) {
      counts.set(w, c + 1);
      out.push({ t, outcome: "pass" });
    } else out.push({ t, outcome: "reject" });
  }
  const w = Math.floor(now / PERIOD);
  const used = counts.get(w) ?? 0;
  const reset = (w + 1) * PERIOD - now;
  return { out, state: `${used} of ${LIMIT} used · resets in ${reset.toFixed(1)} s`, fill: used / LIMIT };
}

function slidingLog(arr: number[], now: number) {
  const log: number[] = [];
  const out: Decision[] = [];
  for (const t of arr) {
    while (log.length && log[0] <= t - PERIOD) log.shift();
    if (log.length < LIMIT) {
      log.push(t);
      out.push({ t, outcome: "pass" });
    } else out.push({ t, outcome: "reject" });
  }
  const inWindow = log.filter((x) => x > now - PERIOD).length;
  return { out, state: `${inWindow} of ${LIMIT} in the last ${PERIOD} s`, fill: inWindow / LIMIT };
}

function slidingCounter(arr: number[], now: number) {
  const counts = new Map<number, number>();
  const estimate = (t: number) => {
    const w = Math.floor(t / PERIOD);
    const elapsed = (t - w * PERIOD) / PERIOD;
    return (counts.get(w - 1) ?? 0) * (1 - elapsed) + (counts.get(w) ?? 0);
  };
  const out: Decision[] = [];
  for (const t of arr) {
    if (estimate(t) < LIMIT) {
      const w = Math.floor(t / PERIOD);
      counts.set(w, (counts.get(w) ?? 0) + 1);
      out.push({ t, outcome: "pass" });
    } else out.push({ t, outcome: "reject" });
  }
  const e = estimate(now);
  return { out, state: `≈ ${e.toFixed(1)} of ${LIMIT} (weighted)`, fill: Math.min(1, e / LIMIT) };
}

const ALGOS = [
  { id: "token", name: "Token bucket", run: tokenBucket, note: "Bursts up to 5, then 2.5/s" },
  { id: "leaky", name: "Leaky bucket", run: leakyBucket, note: "Queues, sends at a steady 2.5/s" },
  { id: "fixed", name: "Fixed window", run: fixedWindow, note: "5 per clock-aligned 2 s window", windows: true },
  { id: "log", name: "Sliding log", run: slidingLog, note: "Exactly 5 in any 2 s" },
  { id: "counter", name: "Sliding counter", run: slidingCounter, note: "Weighted estimate of two windows", windows: true },
] as const;

/* ---------- component ---------- */

export function RateLimitAlgorithms() {
  const reduced = useReducedMotion();
  const [now, setNow] = useState(0);
  const [arrivals, setArrivals] = useState<number[]>([]);
  const [running, setRunning] = useState(true);
  const origin = useRef<number | null>(null);
  const pausedAt = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const visible = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    // Resume the simulated clock where it stopped.
    origin.current = performance.now() / 1000 - pausedAt.current;
    let raf = 0;
    let timer = 0;
    const tick = () => {
      if (visible.current && origin.current !== null) {
        const t = performance.now() / 1000 - origin.current;
        pausedAt.current = t;
        setNow(t);
      }
    };
    if (reduced) {
      timer = window.setInterval(tick, 250);
    } else {
      const loop = () => {
        tick();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
    };
  }, [running, reduced]);

  const fire = (kind: string, offsets: number[]) => {
    const base = pausedAt.current;
    setArrivals((a) => [...a.filter((t) => t > base - VIEW - 1), ...offsets.map((o) => base + o)].sort((x, y) => x - y));
    if (!running) setRunning(true);
    track("visual_interacted", { visual: VISUAL, control: "fire", value: kind });
  };

  const boundary = () => {
    const t = pausedAt.current;
    let b = Math.ceil(t / PERIOD) * PERIOD;
    if (b - t < 0.6) b += PERIOD;
    const offsets = [
      ...Array.from({ length: 5 }, (_, i) => b - t - 0.35 + i * 0.06),
      ...Array.from({ length: 5 }, (_, i) => b - t + 0.05 + i * 0.06),
    ];
    fire("boundary", offsets);
  };

  const reset = () => {
    setArrivals([]);
    pausedAt.current = 0;
    origin.current = performance.now() / 1000;
    setNow(0);
    track("visual_interacted", { visual: VISUAL, control: "reset", value: true });
  };

  const seen = arrivals.filter((t) => t <= now);
  const start = Math.max(0, now - VIEW);
  const pct = (t: number) => `${((t - start) / VIEW) * 100}%`;
  const total = seen.length;

  return (
    <VisualFrame
      title="Five limiters, one stream of requests"
      hint={`Every limiter allows ${LIMIT} requests per ${PERIOD} seconds. Fire requests and watch each one decide. Then try the boundary burst: 10 requests straddling a window edge.`}
    >
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => fire("single", [0])}>
          <Send className="size-3.5" /> 1 request
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fire("burst", Array.from({ length: 8 }, (_, i) => i * 0.05))}>
          <Zap className="size-3.5" /> Burst of 8
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fire("steady", Array.from({ length: 16 }, (_, i) => i * 0.25))}>
          <Waves className="size-3.5" /> 4/s for 4 s
        </Button>
        <Button size="sm" variant="secondary" onClick={boundary}>
          Boundary burst
        </Button>
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label={running ? "Pause the clock" : "Resume the clock"}
            onClick={() => {
              setRunning((r) => !r);
              track("visual_interacted", { visual: VISUAL, control: "pause", value: running });
            }}
          >
            {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" aria-label="Clear" onClick={reset}>
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div ref={box} className="mt-4 space-y-3">
        {ALGOS.map((a) => {
          const r = a.run(arrivals, now);
          const shown = r.out.filter((d) => d.t <= now && d.t >= start - 1);
          const passed = r.out.filter((d) => d.t <= now && d.outcome !== "reject").length;
          const rejected = r.out.filter((d) => d.t <= now && d.outcome === "reject").length;
          const boundaries: number[] = [];
          if ("windows" in a) for (let b = Math.ceil(start / PERIOD) * PERIOD; b <= now; b += PERIOD) boundaries.push(b);
          return (
            <Lane
              key={a.id}
              name={a.name}
              note={a.note}
              state={r.state}
              fill={r.fill}
              tally={total ? `${passed} ok · ${rejected} rejected` : ""}
            >
              {boundaries.map((b) => (
                <line key={b} x1={pct(b)} x2={pct(b)} y1="0" y2="32" stroke="var(--border-strong)" strokeDasharray="3 3" />
              ))}
              {shown.map((d, i) => (
                <g key={`${d.t}-${i}`}>
                  {d.outcome === "delay" && d.release !== undefined && (
                    <>
                      <line x1={pct(d.t)} x2={pct(Math.min(d.release, now))} y1="16" y2="16" stroke="var(--info)" strokeWidth="2" opacity="0.6" />
                      {d.release <= now && <circle cx={pct(d.release)} cy="16" r="4.5" fill="var(--ok)" />}
                    </>
                  )}
                  <circle
                    cx={pct(d.t)}
                    cy="16"
                    r={d.outcome === "reject" ? 4 : 4.5}
                    fill={d.outcome === "pass" ? "var(--ok)" : d.outcome === "reject" ? "var(--surface)" : "var(--info)"}
                    stroke={d.outcome === "reject" ? "var(--err)" : "none"}
                    strokeWidth="2"
                  />
                </g>
              ))}
            </Lane>
          );
        })}
        <div className="flex justify-between font-mono text-[10.5px] text-subtle sm:pl-[172px]">
          <span>{VIEW} s ago</span>
          <span>now</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-subtle">
        <Legend dot="bg-ok">allowed</Legend>
        <Legend dot="border-2 border-err">rejected (429)</Legend>
        <Legend dot="bg-info">queued, sent later</Legend>
        <Legend dot="border border-dashed border-line-strong">window edge</Legend>
      </div>
    </VisualFrame>
  );
}

function Lane({
  name,
  note,
  state,
  fill,
  tally,
  children,
}: {
  name: string;
  note: string;
  state: string;
  fill: number;
  tally: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[160px_1fr] sm:items-center sm:gap-3">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-medium text-fg">{name}</p>
          <p className="font-mono text-[10.5px] text-subtle sm:hidden">{tally}</p>
        </div>
        <p className="text-[11.5px] leading-snug text-subtle">{note}</p>
      </div>
      <div className="min-w-0">
        <svg className="block h-8 w-full overflow-visible rounded-md bg-surface-2" aria-hidden="true">
          {children}
        </svg>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(fill * 100)}%` }} />
          </div>
          <p className="truncate font-mono text-[10.5px] text-muted tabular-nums">{state}</p>
          <p className="ml-auto hidden font-mono text-[10.5px] text-subtle sm:block">{tally}</p>
        </div>
      </div>
    </div>
  );
}

function Legend({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block size-2.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
