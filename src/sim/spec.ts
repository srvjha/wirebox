/**
 * Capacity, latency and cost of every component the simulator knows.
 *
 * These are planning numbers, not benchmarks: the right order of magnitude for
 * a small service doing a key lookup on common cloud machines. What matters for
 * learning is the ratios (a cache is ~3x a database for reads, a bigger box
 * gives less per extra core). Tune them here; every lab reads from this file.
 */

export type Kind = "client" | "limiter" | "lb" | "server" | "cache" | "db";

export type ServerSize = "s" | "m" | "l" | "xl" | "2xl";

export type Spec = {
  label: string;
  short: string;
  /** Requests (or ops) per second one node can serve. */
  cap: number;
  /** Mean service time in ms at low load. */
  serviceMs: number;
  monthlyUsd: number;
  machine: string;
  note: string;
};

export const SPECS: Record<Kind, Spec> = {
  client: {
    label: "Users",
    short: "Users",
    cap: Infinity,
    serviceMs: 0,
    monthlyUsd: 0,
    machine: "Browsers and phones",
    note: "Sends the scenario's traffic.",
  },
  limiter: {
    label: "Rate limiter",
    short: "Limiter",
    cap: 400_000,
    serviceMs: 0.1,
    monthlyUsd: 50,
    machine: "Rules at the edge (CDN or WAF)",
    note: "Edge networks scale on their own. Checking a counter costs far less than serving a request, so this is rarely the bottleneck.",
  },
  lb: {
    label: "Load balancer",
    short: "LB",
    cap: 150_000,
    serviceMs: 0.2,
    monthlyUsd: 180,
    machine: "Managed L7 load balancer",
    note: "Managed balancers scale out automatically; modeled here as one node.",
  },
  server: {
    label: "API server",
    short: "Server",
    cap: 8_000,
    serviceMs: 2,
    monthlyUsd: 60,
    machine: "App server · 2 vCPU · 4 GB",
    note: "A compiled service doing one key lookup per request.",
  },
  cache: {
    label: "Redis cache",
    short: "Redis",
    cap: 120_000,
    serviceMs: 0.2,
    monthlyUsd: 110,
    machine: "Redis · 2 vCPU · 8 GB",
    note: "In-memory GET/SET. Mostly limited by network and connection count.",
  },
  db: {
    label: "Postgres",
    short: "Postgres",
    cap: 35_000,
    serviceMs: 0.6,
    monthlyUsd: 240,
    machine: "Postgres · 4 vCPU · 16 GB, hot data in RAM",
    note: "Indexed primary-key lookups. Writes cost ~4x a read (WAL, index updates, fsync).",
  },
};

/** Writes per second one database node can take. */
export const DB_WRITE_CAP = 8_000;
export const DB_WRITE_MS = 2;

export type SizeSpec = { id: ServerSize; vcpu: number; ramGb: number; cap: number; monthlyUsd: number };

/** More cores add less each time: lock contention, GC and the network stack. */
export const SERVER_SIZES: SizeSpec[] = [
  { id: "s", vcpu: 2, ramGb: 4, cap: 8_000, monthlyUsd: 60 },
  { id: "m", vcpu: 4, ramGb: 8, cap: 15_000, monthlyUsd: 120 },
  { id: "l", vcpu: 8, ramGb: 16, cap: 26_000, monthlyUsd: 240 },
  { id: "xl", vcpu: 16, ramGb: 32, cap: 36_000, monthlyUsd: 480 },
  { id: "2xl", vcpu: 32, ramGb: 64, cap: 42_000, monthlyUsd: 960 },
];

export function serverSize(id: ServerSize | undefined): SizeSpec {
  return SERVER_SIZES.find((s) => s.id === id) ?? SERVER_SIZES[0];
}

export const LARGEST_SERVER = SERVER_SIZES[SERVER_SIZES.length - 1];

export type SimNodeLike = { kind: Kind; size?: ServerSize };

export function nodeCap(n: SimNodeLike) {
  return n.kind === "server" ? serverSize(n.size).cap : SPECS[n.kind].cap;
}

export function nodeCost(n: SimNodeLike) {
  return n.kind === "server" ? serverSize(n.size).monthlyUsd : SPECS[n.kind].monthlyUsd;
}

export function nodeMachine(n: SimNodeLike) {
  if (n.kind !== "server") return SPECS[n.kind].machine;
  const s = serverSize(n.size);
  return `App server · ${s.vcpu} vCPU · ${s.ramGb} GB`;
}

export function monthlyCost(nodes: SimNodeLike[]) {
  return nodes.reduce((sum, n) => sum + nodeCost(n), 0);
}

/** Which component may send requests to which. */
export const ALLOWED_TARGETS: Record<Kind, Kind[]> = {
  client: ["limiter", "lb", "server"],
  limiter: ["lb", "server"],
  lb: ["server"],
  server: ["cache", "db"],
  cache: [],
  db: [],
};

/** Utilisation above which queues build and tail latency climbs steeply. */
export const HOT_UTIL = 0.85;
/** Requests slower than this time out. */
export const TIMEOUT_MS = 2_000;
