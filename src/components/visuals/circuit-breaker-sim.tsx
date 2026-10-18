"use client";

import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented, Stat, Toggle, VisualFrame, useVisualTracker } from "./distributed-visual-kit";

type Health = "healthy" | "slow" | "down";
type BState = "closed" | "open" | "half-open";

const BROWSE_RPS = 15;
const PAY_RPS = 15;
const POOL = 20;
const BULK_BROWSE = 10;
const BULK_PAY = 10;
const WINDOW = 20;
const MIN_CALLS = 10;
const THRESHOLD = 0.5;
const COOLDOWN = 5;
const HISTORY = 40;

const DUR: Record<Health, number> = { healthy: 0.2, slow: 4, down: 0.05 };
const BROWSE_DUR = 0.05;

type Tick = { browse: number; checkout: number; fast: number; threads: number; state: BState };

type Sim = {
  t: number;
  state: BState;
  openUntil: number;
  window: boolean[];
  history: Tick[];
  last?: Tick & { browseRejected: number; payFailed: number; payOk: number; probe?: boolean };
  log: string[];
};

const initial: Sim = { t: 0, state: "closed", openUntil: 0, window: [], history: [], log: [] };

function step(sim: Sim, health: Health, breaker: boolean, bulkhead: boolean): Sim {
  const t = sim.t + 1;
  let state: BState = breaker ? sim.state : "closed";
  const log = [...sim.log];
  if (breaker && state === "open" && t >= sim.openUntil) {
    state = "half-open";
    log.push(`t=${t}s · cooldown over → half-open, sending one trial call`);
  }

  const attempted = !breaker || state === "closed" ? PAY_RPS : state === "half-open" ? 1 : 0;
  const fast = PAY_RPS - attempted;

  const browseDemand = BROWSE_RPS * BROWSE_DUR;
  const payDemand = attempted * DUR[health];
  let browseAdmit: number;
  let payAdmit: number;
  let threads: number;
  if (bulkhead) {
    browseAdmit = Math.min(1, BULK_BROWSE / Math.max(browseDemand, 1e-9));
    payAdmit = Math.min(1, BULK_PAY / Math.max(payDemand, 1e-9));
    threads = Math.min(browseDemand, BULK_BROWSE) + Math.min(payDemand, BULK_PAY);
  } else {
    const total = browseDemand + payDemand;
    const f = Math.min(1, POOL / Math.max(total, 1e-9));
    browseAdmit = f;
    payAdmit = f;
    threads = Math.min(total, POOL);
  }

  const browseOk = Math.round(BROWSE_RPS * browseAdmit);
  const payAdmitted = Math.round(attempted * payAdmit);
  const payOk = health === "healthy" ? payAdmitted : 0;
  const payFailed = attempted - payOk;

  let window = sim.window;
  let openUntil = sim.openUntil;
  if (breaker) {
    const outcomes = [...Array(payOk).fill(true), ...Array(payFailed).fill(false)] as boolean[];
    if (state === "half-open") {
      if (payOk > 0) {
        state = "closed";
        window = [];
        log.push(`t=${t}s · trial call succeeded → closed`);
      } else {
        state = "open";
        openUntil = t + COOLDOWN;
        log.push(`t=${t}s · trial call failed → open again for ${COOLDOWN}s`);
      }
    } else if (state === "closed") {
      window = [...sim.window, ...outcomes].slice(-WINDOW);
      const fails = window.filter((x) => !x).length;
      if (window.length >= MIN_CALLS && fails / window.length >= THRESHOLD) {
        state = "open";
        openUntil = t + COOLDOWN;
        log.push(`t=${t}s · ${fails}/${window.length} recent calls failed → open for ${COOLDOWN}s`);
      }
    }
  }

  const tick: Tick = {
    browse: browseOk / BROWSE_RPS,
    checkout: payOk / PAY_RPS,
    fast,
    threads,
    state,
  };
  return {
    t,
    state,
    openUntil,
    window,
    history: [...sim.history, tick].slice(-HISTORY),
    last: { ...tick, browseRejected: BROWSE_RPS - browseOk, payFailed, payOk },
    log: log.slice(-4),
  };
}

const stateColor: Record<BState, string> = { closed: "var(--ok)", open: "var(--err)", "half-open": "var(--warn)" };

export function CircuitBreakerSim() {
  const tr = useVisualTracker("circuit-breaker-sim");
  const [health, setHealth] = useState<Health>("healthy");
  const [breaker, setBreaker] = useState(false);
  const [bulkhead, setBulkhead] = useState(false);
  const [sim, setSim] = useState<Sim>(initial);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setSim((s) => step(s, health, breaker, bulkhead)), 550);
    return () => clearInterval(id);
  }, [playing, health, breaker, bulkhead]);

  const last = sim.last;
  const shownState: BState = breaker ? sim.state : "closed";

  return (
    <VisualFrame
      eyebrow="Try it · slow is worse than down"
      title="Booking calls payments, 30 requests a second"
      hint="Half the requests are people browsing (no payment), half are checkouts. Press play, make payments slow, and watch browsing die too. Then add a circuit breaker or a bulkhead."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Health>
          label="Payments health"
          size="sm"
          className="flex-1 basis-60"
          value={health}
          onChange={(v) => {
            setHealth(v);
            tr("health", v);
          }}
          options={[
            { value: "healthy", label: "Healthy" },
            { value: "slow", label: "Slow (4 s timeouts)" },
            { value: "down", label: "Down (fast errors)" },
          ]}
        />
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={playing ? "secondary" : "primary"}
            onClick={() => {
              setPlaying((p) => !p);
              tr("play", !playing);
            }}
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button size="sm" variant="ghost" aria-label="Step one second" onClick={() => setSim((s) => step(s, health, breaker, bulkhead))}>
            <StepForward className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Reset"
            onClick={() => {
              setSim(initial);
              tr("reset", true);
            }}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5">
        <Toggle
          label="Circuit breaker"
          checked={breaker}
          onChange={(v) => {
            setBreaker(v);
            setSim((s) => ({ ...s, state: "closed", window: [], openUntil: 0 }));
            tr("breaker", v);
          }}
        />
        <Toggle
          label={`Bulkhead (${BULK_BROWSE} + ${BULK_PAY} threads)`}
          checked={bulkhead}
          onChange={(v) => {
            setBulkhead(v);
            tr("bulkhead", v);
          }}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[200px_1fr]">
        <svg viewBox="0 0 200 150" className="mx-auto block w-full max-w-[240px]" role="img" aria-label={`Breaker state: ${shownState}`}>
          <defs>
            <marker id="cbs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--fg-subtle)" />
            </marker>
          </defs>
          <path d="M55 40 L145 40" stroke="var(--border-strong)" fill="none" markerEnd="url(#cbs-arrow)" />
          <text x={100} y={32} textAnchor="middle" fontSize={9} fill="var(--fg-subtle)">
            too many failures
          </text>
          <path d="M160 58 L120 108" stroke="var(--border-strong)" fill="none" markerEnd="url(#cbs-arrow)" />
          <text x={198} y={96} textAnchor="end" fontSize={9} fill="var(--fg-subtle)">
            cooldown
          </text>
          <path d="M80 108 L42 58" stroke="var(--border-strong)" fill="none" markerEnd="url(#cbs-arrow)" />
          <text x={4} y={96} fontSize={9} fill="var(--fg-subtle)">
            trial ok
          </text>
          <path d="M108 104 L148 60" stroke="var(--border-strong)" fill="none" strokeDasharray="3 3" markerEnd="url(#cbs-arrow)" />
          {(
            [
              ["closed", 30, 40],
              ["open", 170, 40],
              ["half-open", 100, 122],
            ] as const
          ).map(([s, cx, cy]) => {
            const active = shownState === s;
            return (
              <g key={s}>
                <rect
                  x={cx - 32}
                  y={cy - 15}
                  width={64}
                  height={30}
                  rx={15}
                  fill={active ? stateColor[s] : "var(--surface-2)"}
                  fillOpacity={active ? 0.18 : 1}
                  stroke={active ? stateColor[s] : "var(--border-strong)"}
                  strokeWidth={active ? 2 : 1}
                />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={active ? stateColor[s] : "var(--fg-muted)"}>
                  {s}
                </text>
              </g>
            );
          })}
          {!breaker && (
            <text x={100} y={146} textAnchor="middle" fontSize={9} fill="var(--fg-subtle)">
              (breaker off: always calls)
            </text>
          )}
        </svg>

        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Browsing works"
              value={last ? `${Math.round(last.browse * 100)}%` : "–"}
              tone={!last ? "default" : last.browse > 0.95 ? "ok" : last.browse > 0.5 ? "warn" : "err"}
              sub="pages with no payment"
            />
            <Stat
              label="Checkouts paid"
              value={last ? `${Math.round(last.checkout * 100)}%` : "–"}
              tone={!last ? "default" : last.checkout > 0.95 ? "ok" : last.checkout > 0.5 ? "warn" : "err"}
              sub={last && last.fast > 0 ? `${last.fast}/s fail fast: "try again in a minute"` : "need payments"}
            />
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-[12px] text-muted">
              <span>Booking threads busy</span>
              <span className="font-mono tabular-nums">
                {last ? last.threads.toFixed(1) : "0"} / {POOL}
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${((last?.threads ?? 0) / POOL) * 100}%`,
                  background: (last?.threads ?? 0) >= POOL - 0.01 ? "var(--err)" : "var(--accent)",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-line bg-bg p-2">
        <div className="mb-1 flex flex-wrap gap-x-4 px-1 text-[11px] text-subtle">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-[var(--info)]" /> browsing
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-[var(--ok)]" /> checkouts paid
          </span>
          <span className="ml-auto font-mono">t = {sim.t}s</span>
        </div>
        <svg viewBox={`0 0 ${HISTORY * 8} 70`} className="block h-[70px] w-full" preserveAspectRatio="none" aria-hidden>
          {sim.history.map((h, i) => (
            <rect key={i} x={i * 8} y={0} width={8} height={70} fill={stateColor[h.state]} opacity={breaker && h.state !== "closed" ? 0.08 : 0} />
          ))}
          {(["browse", "checkout"] as const).map((k) => (
            <polyline
              key={k}
              fill="none"
              stroke={k === "browse" ? "var(--info)" : "var(--ok)"}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              points={sim.history.map((h, i) => `${i * 8 + 4},${66 - h[k] * 62}`).join(" ")}
            />
          ))}
        </svg>
      </div>

      <div className={cn("mt-2 min-h-[40px] space-y-0.5 font-mono text-[11.5px] text-muted")} aria-live="polite">
        {sim.log.length ? sim.log.map((l, i) => <p key={i}>{l}</p>) : <p className="text-subtle">Breaker events show up here.</p>}
      </div>
    </VisualFrame>
  );
}
