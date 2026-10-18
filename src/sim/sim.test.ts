import { describe, expect, it } from "vitest";
import {
  DEFAULT_CACHE,
  DEFAULT_RESILIENCE,
  limiterEffect,
  p99Of,
  runTest,
  type CacheConfig,
  type Constraint,
  type Resilience,
  type Scenario,
  type ServerSize,
  type SimEdge,
  type SimNode,
} from "./index";

const VALUES = [
  { v: "long_url", label: "long_url", useful: true },
  { v: "id", label: "id", useful: false },
];
const GOOD_CACHE: CacheConfig = { key: "link:{slug}", value: "long_url", onMiss: "each", writeThrough: false };

type Design = {
  servers?: number;
  size?: ServerSize;
  lb?: boolean;
  cache?: boolean;
  limiter?: boolean;
  replicas?: number;
};

function build(d: Design): { nodes: SimNode[]; edges: SimEdge[] } {
  const nodes: SimNode[] = [{ id: "client", kind: "client" }];
  const edges: SimEdge[] = [];
  const servers = Array.from({ length: d.servers ?? 1 }, (_, i) => `server-${i}`);
  const replicas = Array.from({ length: d.replicas ?? 0 }, (_, i) => `replica-${i}`);
  let front = "client";
  if (d.limiter) {
    nodes.push({ id: "limiter", kind: "limiter" });
    edges.push({ from: front, to: "limiter" });
    front = "limiter";
  }
  if (d.lb) {
    nodes.push({ id: "lb", kind: "lb" });
    edges.push({ from: front, to: "lb" });
    front = "lb";
  }
  nodes.push({ id: "db", kind: "db", role: "primary" });
  for (const r of replicas) nodes.push({ id: r, kind: "db", role: "replica" });
  if (d.cache) nodes.push({ id: "redis", kind: "cache" });
  for (const s of servers) {
    nodes.push({ id: s, kind: "server", size: d.size ?? "s" });
    edges.push({ from: front, to: s });
    edges.push({ from: s, to: "db" });
    for (const r of replicas) edges.push({ from: s, to: r });
    if (d.cache) edges.push({ from: s, to: "redis" });
  }
  return { nodes, edges };
}

function test(
  d: Design,
  scenario: Scenario,
  constraints: Constraint[],
  opts: { cache?: CacheConfig; resilience?: Partial<Resilience>; limitRate?: number; limitBy?: "ip" | "path" | "global" } = {},
) {
  return runTest({
    ...build(d),
    scenario,
    constraints,
    cache: opts.cache ?? (d.cache ? GOOD_CACHE : DEFAULT_CACHE),
    cacheParam: "slug",
    cacheValues: VALUES,
    limiter: { by: opts.limitBy ?? "ip", rate: opts.limitRate ?? 100 },
    resilience: { ...DEFAULT_RESILIENCE, ...opts.resilience },
  });
}

const failing = (r: ReturnType<typeof test>) => r.checks.filter((c) => !c.ok).map((c) => c.constraint.type);

describe("latency model", () => {
  it("grows steeply as utilisation approaches 1", () => {
    expect(p99Of(2, 0.5)).toBeCloseTo(18.4, 1);
    expect(p99Of(2, 0.9)).toBeGreaterThan(p99Of(2, 0.5) * 4);
    expect(p99Of(2, 0.99)).toBe(2000);
  });
});

describe("rate limiter", () => {
  it("lets every real IP through when the per-IP limit sits above the busiest NAT", () => {
    const e = limiterEffect({ by: "ip", rate: 100 }, { legit: 60_000, attack: 40_000 });
    expect(e.legitPass).toBe(1);
    expect(e.attackPass).toBeLessThan(0.06);
  });
  it("blocks people behind shared IPs when the limit is too low", () => {
    expect(limiterEffect({ by: "ip", rate: 30 }, { legit: 60_000, attack: 0 }).legitPass).toBeLessThan(0.97);
  });
  it("by path hurts popular links and not the bot", () => {
    const e = limiterEffect({ by: "path", rate: 100 }, { legit: 60_000, attack: 40_000 });
    expect(e.attackPass).toBe(1);
    expect(e.legitPass).toBeLessThan(0.6);
  });
});

// Lab calibration: these mirror the URL shortener lab's steps.
const launch: Scenario = { load: { reads: 500, writes: 20, attack: 0 } };
const vertical: Scenario = { load: { reads: 11_500, writes: 500, attack: 0 } };
const horizontal: Scenario = { load: { reads: 24_700, writes: 300, attack: 0 } };
const big = { reads: 58_800, writes: 1_200, attack: 0 };
const fast: Constraint = { type: "p99", maxMs: 100 };
const ok999: Constraint = { type: "successRate", min: 0.999 };

describe("URL shortener lab calibration", () => {
  it("launch: one small server and one database pass", () => {
    const r = test({}, launch, [ok999, fast, { type: "budget", maxUsd: 400 }]);
    expect(failing(r)).toEqual([]);
  });

  it("vertical: a small server fails, a medium one passes", () => {
    const cs: Constraint[] = [ok999, fast, { type: "budget", maxUsd: 500 }, { type: "maxNodes", kind: "server", n: 1 }];
    expect(failing(test({ size: "s" }, vertical, cs))).toContain("successRate");
    expect(failing(test({ size: "m" }, vertical, cs))).toEqual([]);
  });

  it("horizontal: the big box blows the budget, two medium servers pass", () => {
    const cs: Constraint[] = [ok999, fast, { type: "budget", maxUsd: 700 }];
    expect(failing(test({ size: "xl" }, horizontal, cs))).toEqual(["budget"]);
    expect(failing(test({ size: "l" }, horizontal, cs))).toContain("p99");
    expect(failing(test({ servers: 2, size: "m", lb: true }, horizontal, cs))).toEqual([]);
  });

  it("cache: the database melts without Redis; replicas instead cost too much", () => {
    const cs: Constraint[] = [ok999, fast, { type: "budget", maxUsd: 1_200 }];
    const s = { load: big };
    expect(failing(test({ servers: 5, size: "m", lb: true }, s, cs))).toContain("successRate");
    expect(failing(test({ servers: 5, size: "m", lb: true, replicas: 2 }, s, cs))).toContain("budget");
    expect(failing(test({ servers: 5, size: "m", lb: true, cache: true }, s, cs))).toEqual([]);
  });

  it("cache: a key without {slug} serves wrong data, a useless value doesn't help", () => {
    const cs: Constraint[] = [ok999, { type: "noWrongData" }];
    const d = { servers: 5, size: "m" as const, lb: true, cache: true };
    const wrongKey = test(d, { load: big }, cs, { cache: { ...GOOD_CACHE, key: "link" } });
    expect(failing(wrongKey)).toContain("noWrongData");
    const uselessValue = test(d, { load: big }, cs, { cache: { ...GOOD_CACHE, value: "id" } });
    expect(failing(uselessValue)).toContain("successRate");
  });

  it("scraper: needs a limiter keyed by IP above the busiest real IP", () => {
    const s = { load: { ...big, attack: 40_000 } };
    const cs: Constraint[] = [ok999, fast, { type: "realUsersBlocked", max: 0.001 }];
    const d = { servers: 5, size: "m" as const, lb: true, cache: true };
    expect(failing(test(d, s, cs))).toContain("successRate");
    expect(failing(test({ ...d, limiter: true }, s, cs, { limitRate: 30 }))).toContain("realUsersBlocked");
    expect(failing(test({ ...d, limiter: true }, s, cs, { limitBy: "path" }))).not.toEqual([]);
    expect(failing(test({ ...d, limiter: true }, s, cs, { limitRate: 100 }))).toEqual([]);
  });

  it("cache restart: a stampede without coalescing, smooth with it", () => {
    const s: Scenario = { load: big, incident: { type: "cacheCold" } };
    const cs: Constraint[] = [{ type: "everySecond", min: 0.99 }, { type: "recovery", maxSeconds: 3 }];
    const d = { servers: 5, size: "m" as const, lb: true, cache: true };
    expect(failing(test(d, s, cs))).toContain("everySecond");
    expect(failing(test(d, s, cs, { cache: { ...GOOD_CACHE, onMiss: "coalesce" } }))).toEqual([]);
  });

  it("lose a server: needs health checks and one spare server", () => {
    const s: Scenario = { load: big, incident: { type: "down", kind: "server" } };
    const cs: Constraint[] = [{ type: "recovery", maxSeconds: 5 }];
    const cache = { ...GOOD_CACHE, onMiss: "coalesce" as const };
    expect(failing(test({ servers: 6, size: "m", lb: true, cache: true }, s, cs, { cache }))).toContain("recovery");
    expect(
      failing(test({ servers: 5, size: "m", lb: true, cache: true }, s, cs, { cache, resilience: { healthChecks: true } })),
    ).toContain("recovery");
    expect(
      failing(test({ servers: 6, size: "m", lb: true, cache: true }, s, cs, { cache, resilience: { healthChecks: true } })),
    ).toEqual([]);
  });

  it("lose the primary: needs a replica and automatic failover", () => {
    const s: Scenario = { load: big, incident: { type: "down", kind: "db" } };
    const cs: Constraint[] = [{ type: "recovery", maxSeconds: 15 }];
    const d = { servers: 6, size: "m" as const, lb: true, cache: true };
    const opts = { cache: { ...GOOD_CACHE, onMiss: "coalesce" as const }, resilience: { healthChecks: true } };
    expect(failing(test(d, s, cs, opts))).toContain("recovery");
    expect(failing(test({ ...d, replicas: 1 }, s, cs, opts))).toContain("recovery");
    expect(
      failing(test({ ...d, replicas: 1 }, s, cs, { ...opts, resilience: { healthChecks: true, failover: true } })),
    ).toEqual([]);
  });

  it("read-your-writes: replica reads 404 fresh links until fixed", () => {
    const s: Scenario = { load: big };
    const cs: Constraint[] = [{ type: "readYourWrites" }];
    const d = { servers: 6, size: "m" as const, lb: true, cache: true, replicas: 1 };
    const res = { healthChecks: true, failover: true };
    expect(failing(test(d, s, cs, { resilience: res }))).toEqual(["readYourWrites"]);
    expect(failing(test(d, s, cs, { resilience: { ...res, readFrom: "primary" } }))).toEqual([]);
    expect(failing(test(d, s, cs, { resilience: res, cache: { ...GOOD_CACHE, writeThrough: true } }))).toEqual([]);
  });
});
