"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RangeField, Segmented, Stat, Toggle, VisualFrame, fmt, fmtMs, mulberry32, trackVisual, useInterval, usePrefersReducedMotion } from "./caching-scaling-ui";

const VISUAL = "load-balancer-algorithms";
const SERVERS = 4;
const WORKERS = 4; // requests a server works on at once
const SERVICE = 0.12; // seconds per request on a healthy server
const SLOW_FACTOR = 4;
const SLOW_SERVER = 2;
const DT = 0.1;
const TIMEOUT = 5; // seconds in the queue before the fan gives up

type Algo = "rr" | "least" | "hash";
const ALGOS: { value: Algo; label: string; rule: string }[] = [
  { value: "rr", label: "Round robin", rule: "Next server in turn: 1, 2, 3, 4, 1, 2…" },
  { value: "least", label: "Least connections", rule: "The server with the fewest requests in progress or waiting." },
  { value: "hash", label: "Consistent hash", rule: "Hash the user id onto a ring; the same user always lands on the same server." },
];

type Server = { queue: number[]; busy: number[] }; // arrival times; finish times
type Sim = {
  t: number;
  servers: Server[];
  rr: number;
  carry: number;
  latencies: number[];
  served: number;
  timeouts: number;
  seq: number;
  flying: { id: number; to: number }[];
  seed: number;
};

export const fresh = (): Sim => ({
  t: 0,
  servers: Array.from({ length: SERVERS }, () => ({ queue: [], busy: [] })),
  rr: 0,
  carry: 0,
  latencies: [],
  served: 0,
  timeouts: 0,
  seq: 0,
  flying: [],
  seed: 1,
});

function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const RING = (() => {
  const points: { h: number; s: number }[] = [];
  for (let s = 0; s < SERVERS; s++) for (let v = 0; v < 64; v++) points.push({ h: fnv(`api-${s}#${v}`), s });
  return points.sort((a, b) => a.h - b.h);
})();

function ringLookup(key: string) {
  const h = fnv(key);
  for (const p of RING) if (p.h >= h) return p.s;
  return RING[0].s;
}

export function step(prev: Sim, algo: Algo, rate: number, slow: boolean): Sim {
  const rand = mulberry32(prev.seed);
  const t = prev.t + DT;
  const servers = prev.servers.map((s) => ({ queue: [...s.queue], busy: [...s.busy] }));
  const latencies = [...prev.latencies];
  let { rr, served, timeouts, seq } = prev;
  const flying: Sim["flying"] = [];

  // arrivals
  const exact = rate * DT + prev.carry;
  const n = Math.floor(exact);
  for (let i = 0; i < n; i++) {
    let target = 0;
    if (algo === "rr") {
      target = rr % SERVERS;
      rr++;
    } else if (algo === "least") {
      let best = Infinity;
      for (let s = 0; s < SERVERS; s++) {
        const load = servers[s].busy.length + servers[s].queue.length;
        if (load < best) {
          best = load;
          target = s;
        }
      }
    } else {
      target = ringLookup(`user-${Math.floor(rand() * 5000)}`);
    }
    servers[target].queue.push(t - rand() * DT);
    flying.push({ id: seq++, to: target });
  }

  // service
  servers.forEach((s, i) => {
    const service = SERVICE * (slow && i === SLOW_SERVER ? SLOW_FACTOR : 1);
    s.busy = s.busy.filter((finish) => {
      if (finish > t) return true;
      served++;
      return false;
    });
    s.queue = s.queue.filter((arrived) => {
      if (t - arrived > TIMEOUT) {
        timeouts++;
        return false;
      }
      return true;
    });
    while (s.busy.length < WORKERS && s.queue.length) {
      const arrived = s.queue.shift()!;
      const jitter = 0.6 + rand() * 0.8;
      const finish = t + service * jitter;
      s.busy.push(finish);
      latencies.push(finish - arrived);
    }
  });
  while (latencies.length > 400) latencies.shift();

  return { t, servers, rr, carry: exact - n, latencies, served, timeouts, seq, flying, seed: Math.floor(rand() * 2 ** 31) };
}

function pct(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

const ROW_Y = [26, 86, 146, 206];

export function LoadBalancerAlgorithms() {
  const reduced = usePrefersReducedMotion();
  const [algo, setAlgo] = useState<Algo>("rr");
  const [rate, setRate] = useState(70);
  const [slow, setSlow] = useState(true);
  const [running, setRunning] = useState(true);
  const [sim, setSim] = useState<Sim>(fresh);

  useInterval(() => setSim((s) => step(s, algo, rate, slow)), DT * 1000, running);

  const p50 = pct(sim.latencies, 0.5) * 1000;
  const p95 = pct(sim.latencies, 0.95) * 1000;
  const totalQueued = sim.servers.reduce((a, s) => a + s.queue.length, 0);

  function reset() {
    setSim(fresh());
  }

  return (
    <VisualFrame
      title="Load-balancing algorithms"
      hint="Four API servers, each working on up to four requests at once. Server 3 has a noisy neighbour and runs four times slower. Pick an algorithm and watch the queues."
      caption="Healthy servers take about 120 ms per request. Requests waiting more than 5 s in a queue time out. Latency is measured from arrival to response."
    >
      <div className="flex flex-wrap items-end gap-3">
        <Segmented
          label="Algorithm"
          value={algo}
          options={ALGOS}
          onChange={(a) => {
            setAlgo(a);
            reset();
            trackVisual(VISUAL, "algorithm", a);
          }}
        />
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setRunning((r) => !r)} aria-label={running ? "Pause" : "Play"}>
            {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {running ? "Pause" : "Play"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              reset();
              trackVisual(VISUAL, "reset", true);
            }}
          >
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        </div>
      </div>
      <p className="mt-2 text-[12.5px] text-subtle">{ALGOS.find((a) => a.value === algo)!.rule}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <RangeField
          label="Incoming traffic"
          value={rate}
          min={20}
          max={120}
          step={5}
          onChange={setRate}
          onCommit={(v) => trackVisual(VISUAL, "rate", v)}
          format={(v) => `${v} req/s`}
        />
        <Toggle
          label="Server 3 is slow"
          description="4× slower: a bad disk, a noisy neighbour, a long GC pause."
          checked={slow}
          onChange={(v) => {
            setSlow(v);
            trackVisual(VISUAL, "slow_server", v);
          }}
        />
      </div>

      <svg viewBox="0 0 460 250" className="mt-4 block h-auto w-full" role="img" aria-label={`Queues: ${sim.servers.map((s, i) => `server ${i + 1} ${s.queue.length}`).join(", ")}`}>
        <rect x={6} y={100} width={92} height={48} rx={10} fill="var(--surface-2)" stroke="var(--info)" strokeWidth={1.4} />
        <text x={52} y={121} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--fg)">
          Balancer
        </text>
        <text x={52} y={137} textAnchor="middle" fontSize={10.5} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
          {rate}/s in
        </text>
        {ROW_Y.map((y, i) => (
          <line key={i} x1={98} y1={124} x2={150} y2={y + 20} stroke="var(--border-strong)" />
        ))}
        {!reduced && (
          <AnimatePresence>
            {sim.flying.map((f) => (
              <motion.circle
                key={f.id}
                r={3.2}
                fill="var(--req)"
                initial={{ cx: 98, cy: 124, opacity: 1 }}
                animate={{ cx: 150, cy: ROW_Y[f.to] + 20, opacity: 0.2 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "linear" }}
              />
            ))}
          </AnimatePresence>
        )}
        {sim.servers.map((s, i) => {
          const y = ROW_Y[i];
          const isSlow = slow && i === SLOW_SERVER;
          const q = s.queue.length;
          const shown = Math.min(q, 22);
          return (
            <g key={i}>
              <rect x={150} y={y} width={104} height={40} rx={9} fill="var(--surface-2)" stroke={isSlow ? "var(--warn)" : "var(--border-strong)"} />
              <text x={160} y={y + 17} fontSize={12} fontWeight={600} fill="var(--fg)">
                API {i + 1}
              </text>
              <text x={160} y={y + 31} fontSize={10} fill={isSlow ? "var(--warn)" : "var(--fg-subtle)"} fontFamily="var(--font-geist-mono)">
                {isSlow ? "slow · 480 ms" : "120 ms"}
              </text>
              {Array.from({ length: WORKERS }).map((_, w) => (
                <circle key={w} cx={218 + (w % 2) * 12} cy={y + 13 + Math.floor(w / 2) * 13} r={4} fill={w < s.busy.length ? "var(--res)" : "var(--surface-3)"} />
              ))}
              {Array.from({ length: shown }).map((_, k) => (
                <rect key={k} x={262 + k * 8} y={y + 14} width={6} height={12} rx={1.5} fill={q > 15 ? "var(--err)" : q > 5 ? "var(--warn)" : "var(--req)"} opacity={0.85} />
              ))}
              <text x={454} y={y + 25} fontSize={11} textAnchor="end" fill={q > 15 ? "var(--err)" : "var(--fg-subtle)"} fontFamily="var(--font-geist-mono)">
                {q > 22 ? `+${q - 22}` : ""}
              </text>
              <text x={262} y={y + 9} fontSize={9.5} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
                {q ? `queue ${q}` : ""}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-live="off">
        <Stat label="p50 latency" value={sim.latencies.length ? fmtMs(p50) : "–"} />
        <Stat label="p95 latency" value={sim.latencies.length ? fmtMs(p95) : "–"} tone={p95 > 2000 ? "err" : p95 > 500 ? "warn" : "ok"} />
        <Stat label="Waiting" value={fmt(totalQueued)} tone={totalQueued > 30 ? "err" : totalQueued > 8 ? "warn" : "default"} />
        <Stat label="Timed out" value={fmt(sim.timeouts)} sub={`of ${fmt(sim.served + sim.timeouts)}`} tone={sim.timeouts ? "err" : "ok"} />
      </div>
      <p className={cn("mt-2 text-[12px] text-subtle")}>
        Green dots are requests being worked on; bars are requests waiting in that server&apos;s queue.
      </p>
    </VisualFrame>
  );
}
