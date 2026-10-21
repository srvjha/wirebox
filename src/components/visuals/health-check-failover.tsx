"use client";

import { useState } from "react";
import { HeartPulse, Pause, Play, Power, RotateCcw, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Meter, RangeField, Segmented, Stat, Toggle, VisualFrame, fmt, trackVisual, useInterval } from "./caching-scaling-ui";

const VISUAL = "health-check-failover";
const N = 3;
const CAP = 100; // req/s one server can handle
const HISTORY = 90; // seconds shown
const HEALTHY_AFTER = 2; // passing checks before a revived server gets traffic

type Srv = { alive: boolean; inPool: boolean; fails: number; passes: number };
type Sim = {
  t: number;
  servers: Srv[];
  history: { ok: number; failed: number; event?: string }[];
  failed: number;
  killedAt: number | null;
  removedAt: number | null;
};

const fresh = (): Sim => ({
  t: 0,
  servers: Array.from({ length: N }, () => ({ alive: true, inPool: true, fails: 0, passes: HEALTHY_AFTER })),
  history: [],
  failed: 0,
  killedAt: null,
  removedAt: null,
});

type Cfg = { checks: boolean; interval: number; threshold: number; loadPct: number };

function tick(s: Sim, c: Cfg): Sim {
  const t = s.t + 1;
  let removedAt = s.removedAt;
  let event: string | undefined;
  const servers = s.servers.map((x) => ({ ...x }));

  if (c.checks && t % c.interval === 0) {
    servers.forEach((x, i) => {
      if (x.alive) {
        x.fails = 0;
        x.passes++;
        if (!x.inPool && x.passes >= HEALTHY_AFTER) {
          x.inPool = true;
          event = `API ${i + 1} passed checks, back in pool`;
        }
      } else {
        x.passes = 0;
        x.fails++;
        if (x.inPool && x.fails >= c.threshold) {
          x.inPool = false;
          event = `API ${i + 1} marked unhealthy, removed`;
          if (removedAt === null && s.killedAt !== null) removedAt = t;
        }
      }
    });
  }

  const total = (c.loadPct / 100) * N * CAP;
  const pool = servers.filter((x) => x.inPool);
  let ok = 0;
  let failed = 0;
  if (pool.length === 0) failed = total;
  else {
    const each = total / pool.length;
    for (const x of pool) {
      if (!x.alive) failed += each;
      else {
        ok += Math.min(each, CAP);
        failed += Math.max(0, each - CAP);
      }
    }
  }
  const history = [...s.history, { ok, failed, event }].slice(-HISTORY);
  return { ...s, t, servers, history, failed: s.failed + failed, removedAt };
}

const W = 460;
const H = 120;

export function HealthCheckFailover() {
  const [cfg, setCfg] = useState<Cfg>({ checks: true, interval: 10, threshold: 3, loadPct: 60 });
  const [sim, setSim] = useState<Sim>(fresh);
  const [running, setRunning] = useState(true);

  useInterval(() => setSim((s) => tick(s, cfg)), 200, running);

  const total = (cfg.loadPct / 100) * N * CAP;
  const maxY = N * CAP;
  const bw = W / HISTORY;
  const alive = sim.servers.filter((x) => x.alive).length;
  const perServerAfter = alive ? total / alive / CAP : Infinity;
  const detection = sim.killedAt !== null ? (sim.removedAt ?? null) : null;
  const lastEvent = [...sim.history].reverse().find((h) => h.event)?.event;
  const worstCase = cfg.interval * cfg.threshold;

  function update(p: Partial<Cfg>) {
    setCfg((c) => ({ ...c, ...p }));
    trackVisual(VISUAL);
  }

  return (
    <VisualFrame
      title="Kill a server"
      hint="Three API servers behind a balancer, each good for 100 req/s. Each second of the simulation runs in 0.2 s. Kill API 2 and count the failed requests before the balancer notices."
      caption={`Worst-case detection delay = check interval × failures needed = ${cfg.interval} s × ${cfg.threshold} = ${worstCase} s. A revived server needs ${HEALTHY_AFTER} passing checks before it gets traffic again.`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Toggle
          label="Health checks"
          description="Balancer calls GET /healthz on every server."
          checked={cfg.checks}
          onChange={(v) => update({ checks: v })}
        />
        <RangeField
          label="Traffic"
          value={cfg.loadPct}
          min={30}
          max={95}
          step={5}
          onChange={(v) => setCfg((c) => ({ ...c, loadPct: v }))}
          onCommit={() => trackVisual(VISUAL)}
          format={(v) => `${fmt((v / 100) * N * CAP)} req/s (${v}% of 3 servers)`}
        />
        <Segmented
          label="Check every"
          value={String(cfg.interval)}
          options={[2, 5, 10, 30].map((v) => ({ value: String(v), label: `${v} s` }))}
          onChange={(v) => update({ interval: Number(v) })}
        />
        <Segmented
          label="Failures before removal"
          value={String(cfg.threshold)}
          options={[1, 2, 3, 5].map((v) => ({ value: String(v), label: String(v) }))}
          onChange={(v) => update({ threshold: Number(v) })}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {sim.servers.map((x, i) => (
          <div
            key={i}
            className={cn(
              "min-w-0 rounded-xl border bg-bg p-2.5",
              !x.alive ? "border-err/50" : !x.inPool ? "border-warn/50" : "border-line",
            )}
          >
            <p className="text-[13px] font-semibold text-fg">API {i + 1}</p>
            <p className={cn("font-mono text-[10.5px] uppercase", x.alive ? "text-ok" : "text-err")}>{x.alive ? "running" : "dead"}</p>
            <p className={cn("font-mono text-[10.5px]", x.inPool ? "text-muted" : "text-warn")}>{x.inPool ? "in pool" : "out of pool"}</p>
            <Button
              size="sm"
              variant={x.alive ? "secondary" : "outline"}
              className="mt-2 h-7 w-full px-2 text-[12px]"
              onClick={() => {
                setSim((s) => ({
                  ...s,
                  servers: s.servers.map((y, j) => (j === i ? { ...y, alive: !y.alive, fails: 0, passes: 0 } : y)),
                  killedAt: x.alive ? s.t : s.killedAt,
                  removedAt: x.alive ? null : s.removedAt,
                  history: s.history.map((h, k) => (k === s.history.length - 1 ? { ...h, event: x.alive ? `API ${i + 1} died` : `API ${i + 1} restarted` } : h)),
                }));
                trackVisual(VISUAL);
              }}
            >
              {x.alive ? <Skull className="size-3" /> : <Power className="size-3" />}
              {x.alive ? "Kill" : "Restart"}
            </Button>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H + 16}`} className="mt-4 block h-auto w-full" role="img" aria-label="Requests per second over the last 90 seconds, succeeded and failed">
        <line x1={0} x2={W} y1={H} y2={H} stroke="var(--border-strong)" />
        {sim.history.map((h, i) => {
          const x = (HISTORY - sim.history.length + i) * bw;
          const okH = (h.ok / maxY) * (H - 6);
          const fH = (h.failed / maxY) * (H - 6);
          return (
            <g key={sim.t - sim.history.length + i}>
              <rect x={x} y={H - okH} width={bw - 0.6} height={okH} fill="var(--res)" opacity={0.85} />
              <rect x={x} y={H - okH - fH} width={bw - 0.6} height={fH} fill="var(--err)" />
              {h.event && <line x1={x + bw / 2} x2={x + bw / 2} y1={4} y2={H} stroke="var(--fg-subtle)" strokeDasharray="2 3" />}
            </g>
          );
        })}
        <text x={2} y={H + 13} fontSize={10} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
          −90 s
        </text>
        <text x={W - 2} y={H + 13} fontSize={10} textAnchor="end" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
          now
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-res" /> served
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-err" /> failed
        </span>
        {lastEvent && <span className="text-subtle">last event: {lastEvent}</span>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Failed requests" value={fmt(sim.failed)} tone={sim.failed ? "err" : "ok"} />
        <Stat
          label="Time to remove"
          value={sim.killedAt === null ? "–" : detection !== null ? `${detection - sim.killedAt} s` : cfg.checks ? `${sim.t - sim.killedAt} s…` : "never"}
          sub={cfg.checks ? `worst case ${worstCase} s` : "until a human notices"}
          tone={sim.killedAt !== null && detection === null ? "err" : "default"}
        />
        <div className="col-span-2 rounded-xl border border-line bg-bg px-3 py-2 sm:col-span-1">
          <Meter value={perServerAfter} label={`Each survivor (${alive} up)`} />
          <p className="mt-1 text-[11.5px] leading-snug text-subtle">
            {perServerAfter >= 1 ? "Survivors can't absorb the load. Too little spare capacity." : "Survivors can absorb the load."}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => setRunning((r) => !r)}>
          {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {running ? "Pause" : "Play"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSim(fresh());
            trackVisual(VISUAL);
          }}
        >
          <RotateCcw className="size-3.5" /> Reset
        </Button>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-subtle">
          <HeartPulse className="size-3.5" /> t = {sim.t} s
        </span>
      </div>
    </VisualFrame>
  );
}
