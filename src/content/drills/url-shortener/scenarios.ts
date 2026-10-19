// Relative imports keep this file runnable under vitest (no path aliases there).
import { DEFAULT_CACHE, DEFAULT_RESILIENCE, type CacheConfig, type Constraint, type ServerSize } from "../../../sim";
import type { DrillConfigs, DrillGraph, DrillNode, DrillScenario } from "../../../lib/drill/types";

/**
 * Load, incidents and pass conditions for each canvas step of the URL
 * shortener drill. The numbers mirror the calibration in src/sim/sim.test.ts,
 * and drill.test.ts proves every reference design passes and the tempting
 * wrong ones fail.
 */

const ok999: Constraint = { type: "successRate", min: 0.999 };
const fast: Constraint = { type: "p99", maxMs: 100 };

const viral = { reads: 58_800, writes: 1_200, attack: 0 };

export const DESIGN = {
  launch: {
    scenario: { label: "Launch week", load: { reads: 500, writes: 20, attack: 0 } },
    constraints: [ok999, fast, { type: "budget", maxUsd: 400 }],
  },
  vertical: {
    scenario: { label: "A link goes viral", load: { reads: 11_500, writes: 500, attack: 0 } },
    constraints: [
      ok999,
      fast,
      { type: "budget", maxUsd: 500 },
      { type: "maxNodes", kind: "server", n: 1, why: "Try a bigger machine before adding more of them." },
    ],
  },
  horizontal: {
    scenario: { label: "Prime-time traffic", load: { reads: 24_700, writes: 300, attack: 0 } },
    constraints: [ok999, fast, { type: "budget", maxUsd: 700 }],
  },
  cache: {
    scenario: { label: "The celebrity post", load: viral },
    constraints: [ok999, fast, { type: "noWrongData" }, { type: "budget", maxUsd: 1_200 }],
  },
  scraper: {
    scenario: { label: "A scraper shows up", load: { ...viral, attack: 40_000 } },
    constraints: [ok999, fast, { type: "realUsersBlocked", max: 0.001 }, { type: "budget", maxUsd: 1_400 }],
  },
  stampede: {
    scenario: {
      label: "Redis restarts",
      load: viral,
      incident: { type: "cacheCold", label: "Redis restarts with an empty cache" },
      incidentText: "Five seconds in, Redis restarts for a security patch and comes back empty.",
    },
    constraints: [{ type: "everySecond", min: 0.99 }, { type: "recovery", maxSeconds: 3 }, { type: "budget", maxUsd: 1_400 }],
  },
  server: {
    scenario: {
      label: "A server dies",
      load: viral,
      incident: { type: "down", kind: "server", label: "An API server dies" },
      incidentText: "Five seconds in, one API server's disk fails and the machine stops answering.",
    },
    constraints: [{ type: "recovery", maxSeconds: 5 }, { type: "budget", maxUsd: 1_500 }],
  },
  primary: {
    scenario: {
      label: "The database dies",
      load: viral,
      incident: { type: "down", kind: "db", label: "The primary database dies" },
      incidentText: "Five seconds in, the machine running your primary database loses power.",
    },
    constraints: [{ type: "recovery", maxSeconds: 15 }, { type: "budget", maxUsd: 1_800 }],
  },
  freshness: {
    scenario: { label: "Share it right now", load: viral },
    constraints: [ok999, fast, { type: "readYourWrites" }, { type: "budget", maxUsd: 1_800 }],
  },
} satisfies Record<string, { scenario: DrillScenario; constraints: Constraint[] }>;

// ---------------------------------------------------------------- Reference designs (used by tests)

type Shape = {
  servers?: number;
  size?: ServerSize;
  lb?: boolean;
  cache?: boolean;
  limiter?: boolean;
  replicas?: number;
};

const COL = { client: 0, limiter: 220, lb: 440, server: 680, store: 940 };

/** Lays out a design in columns: users → limiter → LB → servers → cache/db. */
export function buildGraph(d: Shape): DrillGraph {
  const nodes: DrillNode[] = [];
  const edges: DrillGraph["edges"] = [];
  const wire = (from: string, to: string) => edges.push({ id: `${from}>${to}`, from, to });
  const servers = d.servers ?? 1;
  const replicas = d.replicas ?? 0;
  const mid = ((servers - 1) * 90) / 2;

  nodes.push({ id: "users", kind: "client", x: COL.client, y: mid });
  let front = "users";
  let x = COL.limiter;
  if (d.limiter) {
    nodes.push({ id: "limiter", kind: "limiter", x, y: mid });
    wire(front, "limiter");
    front = "limiter";
    x = COL.lb;
  }
  if (d.lb) {
    nodes.push({ id: "lb", kind: "lb", x, y: mid });
    wire(front, "lb");
    front = "lb";
  }
  const stores: DrillNode[] = [];
  if (d.cache) stores.push({ id: "redis", kind: "cache", x: COL.store, y: 0 });
  stores.push({ id: "db", kind: "db", role: "primary", x: COL.store, y: 0 });
  for (let i = 0; i < replicas; i++) stores.push({ id: `replica-${i}`, kind: "db", role: "replica", x: COL.store, y: 0 });
  const storeMid = ((stores.length - 1) * 100) / 2;
  stores.forEach((s, i) => (s.y = mid - storeMid + i * 100));
  nodes.push(...stores);

  for (let i = 0; i < servers; i++) {
    const id = `server-${i}`;
    nodes.push({ id, kind: "server", size: d.size ?? "s", x: COL.server, y: i * 90 });
    wire(front, id);
    for (const s of stores) wire(id, s.id);
  }
  return { nodes, edges };
}

const GOOD_CACHE: CacheConfig = { key: "link:{slug}", value: "long_url", onMiss: "each", writeThrough: false };

export function configs(over: {
  cache?: Partial<CacheConfig>;
  limiter?: Partial<DrillConfigs["limiter"]>;
  resilience?: Partial<DrillConfigs["resilience"]>;
} = {}): DrillConfigs {
  return {
    cache: { ...(over.cache ? GOOD_CACHE : DEFAULT_CACHE), ...over.cache },
    limiter: { by: "ip", rate: 100, ...over.limiter },
    resilience: { ...DEFAULT_RESILIENCE, ...over.resilience },
  };
}

type Design = { graph: DrillGraph; configs: DrillConfigs };
type Case = { pass: Design; fail: { why: string; design: Design; failing: string[] }[] };

const viralDesign = { servers: 5, size: "m" as const, lb: true, cache: true };
const coalesce = { onMiss: "coalesce" as const };

export const REFERENCE: Record<keyof typeof DESIGN, Case> = {
  launch: {
    pass: { graph: buildGraph({}), configs: configs() },
    fail: [],
  },
  vertical: {
    pass: { graph: buildGraph({ size: "m" }), configs: configs() },
    fail: [
      { why: "small server melts", design: { graph: buildGraph({ size: "s" }), configs: configs() }, failing: ["successRate"] },
      { why: "two servers not allowed", design: { graph: buildGraph({ servers: 2, lb: true }), configs: configs() }, failing: ["maxNodes"] },
    ],
  },
  horizontal: {
    pass: { graph: buildGraph({ servers: 2, size: "m", lb: true }), configs: configs() },
    fail: [
      { why: "xl blows budget", design: { graph: buildGraph({ size: "xl" }), configs: configs() }, failing: ["budget"] },
      { why: "large is too hot", design: { graph: buildGraph({ size: "l" }), configs: configs() }, failing: ["p99"] },
    ],
  },
  cache: {
    pass: { graph: buildGraph(viralDesign), configs: configs({ cache: {} }) },
    fail: [
      {
        why: "no cache: database melts",
        design: { graph: buildGraph({ servers: 5, size: "m", lb: true }), configs: configs() },
        failing: ["successRate"],
      },
      {
        why: "replicas instead cost too much",
        design: { graph: buildGraph({ servers: 5, size: "m", lb: true, replicas: 2 }), configs: configs() },
        failing: ["budget"],
      },
      {
        why: "key without slug",
        design: { graph: buildGraph(viralDesign), configs: configs({ cache: { key: "link" } }) },
        failing: ["noWrongData"],
      },
    ],
  },
  scraper: {
    pass: { graph: buildGraph({ ...viralDesign, limiter: true }), configs: configs({ cache: {}, limiter: { rate: 100 } }) },
    fail: [
      { why: "no limiter", design: { graph: buildGraph(viralDesign), configs: configs({ cache: {} }) }, failing: ["successRate"] },
      {
        why: "limit below the NAT",
        design: { graph: buildGraph({ ...viralDesign, limiter: true }), configs: configs({ cache: {}, limiter: { rate: 30 } }) },
        failing: ["realUsersBlocked"],
      },
      {
        why: "limit by path",
        design: {
          graph: buildGraph({ ...viralDesign, limiter: true }),
          configs: configs({ cache: {}, limiter: { by: "path", rate: 100 } }),
        },
        failing: ["successRate"],
      },
      {
        why: "throw servers and a replica at it",
        design: { graph: buildGraph({ ...viralDesign, servers: 7, replicas: 1 }), configs: configs({ cache: {} }) },
        failing: ["budget"],
      },
    ],
  },
  stampede: {
    pass: { graph: buildGraph({ ...viralDesign, limiter: true }), configs: configs({ cache: coalesce }) },
    fail: [
      {
        why: "no coalescing",
        design: { graph: buildGraph({ ...viralDesign, limiter: true }), configs: configs({ cache: {} }) },
        failing: ["everySecond"],
      },
    ],
  },
  server: {
    pass: {
      graph: buildGraph({ ...viralDesign, servers: 6, limiter: true }),
      configs: configs({ cache: coalesce, resilience: { healthChecks: true } }),
    },
    fail: [
      {
        why: "spare but no health checks",
        design: { graph: buildGraph({ ...viralDesign, servers: 6, limiter: true }), configs: configs({ cache: coalesce }) },
        failing: ["recovery"],
      },
      {
        why: "health checks but no spare",
        design: {
          graph: buildGraph({ ...viralDesign, limiter: true }),
          configs: configs({ cache: coalesce, resilience: { healthChecks: true } }),
        },
        failing: ["recovery"],
      },
    ],
  },
  primary: {
    pass: {
      graph: buildGraph({ ...viralDesign, servers: 6, limiter: true, replicas: 1 }),
      configs: configs({ cache: coalesce, resilience: { healthChecks: true, failover: true } }),
    },
    fail: [
      {
        why: "no replica",
        design: {
          graph: buildGraph({ ...viralDesign, servers: 6, limiter: true }),
          configs: configs({ cache: coalesce, resilience: { healthChecks: true, failover: true } }),
        },
        failing: ["recovery"],
      },
      {
        why: "replica without failover",
        design: {
          graph: buildGraph({ ...viralDesign, servers: 6, limiter: true, replicas: 1 }),
          configs: configs({ cache: coalesce, resilience: { healthChecks: true } }),
        },
        failing: ["recovery"],
      },
    ],
  },
  freshness: {
    pass: {
      graph: buildGraph({ ...viralDesign, servers: 6, limiter: true, replicas: 1 }),
      configs: configs({ cache: { ...coalesce, writeThrough: true }, resilience: { healthChecks: true, failover: true } }),
    },
    fail: [
      {
        why: "reads from a lagging replica",
        design: {
          graph: buildGraph({ ...viralDesign, servers: 6, limiter: true, replicas: 1 }),
          configs: configs({ cache: coalesce, resilience: { healthChecks: true, failover: true } }),
        },
        failing: ["readYourWrites"],
      },
    ],
  },
};
