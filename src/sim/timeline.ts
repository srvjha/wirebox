import { evaluate, type EvalInput, type EvalResult } from "./evaluate";
import { TIMEOUT_MS } from "./spec";

export type Incident =
  | { type: "down"; kind: "server" | "db" | "cache"; label?: string }
  | { type: "cacheCold"; label?: string };

export const TIMELINE = {
  /** Simulated seconds per run. */
  seconds: 30,
  /** Second the incident happens. */
  at: 5,
  /** Seconds before a load balancer's health checks notice a dead server. */
  detectSeconds: 3,
  /** Seconds to detect a dead primary and promote a replica. */
  failoverSeconds: 12,
  /** Share of failed requests clients retry the next second. */
  retry: 0.5,
  /** Share of the cache refilled per second, scaled by how many misses succeed. */
  refill: 0.3,
  /** Refill per second when misses are coalesced (one query per hot key). */
  refillCoalesced: 0.7,
  /** Success rate that counts as "recovered". */
  healthy: 0.99,
} as const;

export type Frame = {
  t: number;
  success: number;
  p99: number;
  down: string[];
  warmth: number;
  result: EvalResult;
};

export type Timeline = {
  frames: Frame[];
  /** Lowest per-second success rate from the incident on. */
  worst: number;
  /** Seconds from the incident until success stayed healthy; null if it never did. */
  recovery: number | null;
  overall: number;
  victim: string | null;
};

export type TimelineInput = Omit<EvalInput, "down" | "undetected" | "promoted"> & { incident: Incident };

export function pickVictim(input: Pick<EvalInput, "nodes" | "edges">, incident: Incident): string | null {
  if (incident.type === "cacheCold") return null;
  const { nodes, edges } = input;
  if (incident.kind === "db") {
    return (nodes.find((n) => n.kind === "db" && (n.role ?? "primary") === "primary") ?? nodes.find((n) => n.kind === "db"))?.id ?? null;
  }
  const wired = nodes.filter((n) => n.kind === incident.kind && edges.some((e) => e.to === n.id));
  return (wired[0] ?? nodes.find((n) => n.kind === incident.kind))?.id ?? null;
}

export function runTimeline(input: TimelineInput): Timeline {
  const { incident } = input;
  const victim = pickVictim(input, incident);
  const replica = input.nodes.find((n) => n.kind === "db" && n.role === "replica" && n.id !== victim);
  const victimIsPrimary = incident.type === "down" && incident.kind === "db";

  const frames: Frame[] = [];
  let warmth = input.cache.warmth;
  let retryLoad = 0;
  let servedTotal = 0;
  let legitTotal = 0;

  for (let t = 0; t < TIMELINE.seconds; t++) {
    const after = t - TIMELINE.at;
    const hit = after >= 0;
    if (incident.type === "cacheCold" && after === 0) warmth = 0;

    const down = hit && victim ? [victim] : [];
    const undetected = input.resilience.healthChecks && after < TIMELINE.detectSeconds ? down : [];
    const promoted =
      victimIsPrimary && hit && input.resilience.failover && replica && after >= TIMELINE.failoverSeconds
        ? replica.id
        : null;

    const reads = input.load.reads + retryLoad;
    const result = evaluate({
      ...input,
      load: { ...input.load, reads },
      cache: { ...input.cache, warmth },
      down,
      undetected,
      promoted,
    });
    const success = result.legit > 0 ? result.served / result.legit : 1;
    frames.push({ t, success, p99: result.p99, down, warmth, result });

    // Retries pile onto the next second; only the original traffic counts toward totals.
    const failed = Math.max(0, result.legit - result.served - result.limitedLegit);
    retryLoad = failed * TIMELINE.retry;
    const original = input.load.reads + input.load.writes + (input.load.clientCached ?? 0);
    servedTotal += Math.min(original, result.served);
    legitTotal += original;

    if (warmth < 1) {
      const rate = input.cache.coalesce ? TIMELINE.refillCoalesced : TIMELINE.refill * success;
      warmth = Math.min(1, warmth + rate);
    }
  }

  const during = frames.filter((f) => f.t >= TIMELINE.at);
  const worst = Math.min(...during.map((f) => f.success));
  let recovery: number | null = 0;
  // Healthy means nearly everything succeeds and requests aren't timing out in a queue.
  const lastBad = [...frames].reverse().find((f) => f.success < TIMELINE.healthy || f.p99 >= TIMEOUT_MS);
  if (lastBad) {
    recovery = lastBad.t === TIMELINE.seconds - 1 ? null : Math.max(0, lastBad.t - TIMELINE.at + 1);
  }
  return { frames, worst, recovery, overall: legitTotal ? servedTotal / legitTotal : 1, victim };
}
