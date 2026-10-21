"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { RangeControl, Segmented, Stat, VisualFrame, seeded } from "./scale-visual-parts";

const VISUAL = "distributed-limiter";
const LIMIT = 10; // per user per second
const BURST_MS = 40; // the script fires its requests within 40 ms

type Mode = "local" | "split" | "getset" | "atomic";

const MODES: { value: Mode; label: string }[] = [
  { value: "local", label: "Local counters" },
  { value: "split", label: "Local, limit ÷ N" },
  { value: "getset", label: "Redis GET then SET" },
  { value: "atomic", label: "Redis atomic INCR" },
];

const EXPLAIN: Record<Mode, string> = {
  local: "Each server counts only what it sees. With N servers, the user really gets N × the limit.",
  split: "Each server allows limit ÷ N. Fair only if the load balancer spreads one user's requests evenly, which it doesn't.",
  getset: "Every server reads the shared count, decides, then writes count + 1. Requests that read before another's write all see the same old value.",
  atomic: "INCR adds and returns the new value in one step inside Redis. No two requests can see the same count.",
};

type Req = { id: number; at: number; server: number; ok: boolean };

function simulate(mode: Mode, servers: number, requests: number, rtt: number): Req[] {
  const rand = seeded(7 + servers * 31 + requests);
  // Arrival times within the burst and the server the load balancer picks for each.
  const reqs = Array.from({ length: requests }, (_, i) => ({
    id: i,
    at: (i / requests) * BURST_MS + rand() * 1.5,
    server: Math.floor(rand() * servers),
    ok: false,
  })).sort((a, b) => a.at - b.at);

  if (mode === "local" || mode === "split") {
    const cap = mode === "local" ? LIMIT : Math.max(1, Math.floor(LIMIT / servers));
    const counts = new Array(servers).fill(0);
    for (const r of reqs) {
      if (counts[r.server] < cap) {
        counts[r.server]++;
        r.ok = true;
      }
    }
    return reqs;
  }

  if (mode === "atomic") {
    // INCR is applied in Redis in arrival order (half a round trip after the request starts).
    let count = 0;
    for (const r of reqs) {
      count++;
      r.ok = count <= LIMIT;
    }
    return reqs;
  }

  // GET then SET: the GET reads at at + rtt/2; the SET lands at at + 1.5 rtt.
  const writes: { at: number; value: number }[] = [];
  for (const r of reqs) {
    const readAt = r.at + rtt / 2;
    const applied = writes.filter((w) => w.at <= readAt);
    const seen = applied.length ? applied[applied.length - 1].value : 0;
    if (seen < LIMIT) {
      r.ok = true;
      writes.push({ at: r.at + rtt * 1.5, value: seen + 1 });
      writes.sort((a, b) => a.at - b.at);
    }
  }
  return reqs;
}

export function DistributedLimiter() {
  const [mode, setMode] = useState<Mode>("local");
  const [servers, setServers] = useState(4);
  const [requests, setRequests] = useState(40);
  const [rtt, setRtt] = useState(2);

  const reqs = useMemo(() => simulate(mode, servers, requests, rtt), [mode, servers, requests, rtt]);
  const allowed = reqs.filter((r) => r.ok).length;
  const perServer = Array.from({ length: servers }, (_, s) => ({
    ok: reqs.filter((r) => r.server === s && r.ok).length,
    no: reqs.filter((r) => r.server === s && !r.ok).length,
  }));
  const target = Math.min(LIMIT, requests);
  const diff = allowed - target;
  const redisCalls = mode === "getset" ? 2 : mode === "atomic" ? 1 : 0;

  return (
    <VisualFrame
      title="One user, a burst, many servers"
      hint={`The limit is ${LIMIT} requests per second per user. A script fires a burst within ${BURST_MS} ms and the load balancer spreads it across servers. How many get through?`}
    >
      <Segmented visual={VISUAL} label="Where the counter lives" value={mode} onChange={setMode} options={MODES} />
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{EXPLAIN[mode]}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <RangeControl visual={VISUAL} label="API servers" value={servers} min={1} max={8} onChange={setServers} />
        <RangeControl visual={VISUAL} label="Requests in the burst" value={requests} min={10} max={80} step={5} onChange={setRequests} />
        <div className={cn(mode !== "getset" && "opacity-50")}>
          <RangeControl
            visual={VISUAL}
            label="Redis round trip"
            value={rtt}
            min={0.5}
            max={8}
            step={0.5}
            onChange={setRtt}
            format={(v) => `${v} ms`}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {perServer.map((p, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface-2 p-2.5">
            <p className="font-mono text-[11px] text-subtle">server {i + 1}</p>
            <div className="mt-1.5 flex flex-wrap gap-1" aria-label={`${p.ok} allowed, ${p.no} rejected`}>
              {reqs
                .filter((r) => r.server === i)
                .map((r) => (
                  <span
                    key={r.id}
                    className={cn("inline-block size-2.5 rounded-full", r.ok ? "bg-ok" : "border-2 border-err")}
                  />
                ))}
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-muted">
              {p.ok} ok · {p.no} 429
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-[12px] text-muted">
          <span>Allowed in total</span>
          <span className="font-mono tabular-nums">
            {allowed} / limit {LIMIT}
          </span>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn("h-full rounded-full transition-[width] duration-300", diff > 0 ? "bg-err" : diff < 0 ? "bg-warn" : "bg-ok")}
            style={{ width: `${Math.min(100, (allowed / Math.max(requests, LIMIT * 2)) * 100)}%` }}
          />
          <div className="absolute inset-y-0 border-l-2 border-fg" style={{ left: `${(LIMIT / Math.max(requests, LIMIT * 2)) * 100}%` }} aria-hidden="true" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat
          label="Versus limit"
          value={diff > 0 ? `+${diff} over` : diff < 0 ? `${-diff} short` : "exact"}
          tone={diff > 0 ? "err" : diff < 0 ? "warn" : "ok"}
          sub={diff < 0 ? "real requests refused" : diff > 0 ? "limit not enforced" : "as intended"}
        />
        <Stat label="Redis calls / request" value={redisCalls} sub={redisCalls ? `+${(redisCalls * rtt).toFixed(1)} ms each` : "no network hop"} />
        <Stat label="If Redis is down" value={redisCalls ? "decide!" : "unaffected"} tone={redisCalls ? "warn" : "default"} sub={redisCalls ? "fail open or closed" : "but inaccurate"} />
      </div>
    </VisualFrame>
  );
}
