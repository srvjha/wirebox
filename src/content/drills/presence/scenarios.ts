// Relative imports keep this file runnable under vitest (no path aliases there).
import { SPECS, serverSize, type Constraint, type CustomKnob, type Flow } from "../../../sim";
import type { CustomCheckContext, DesignStep, DrillConfigs, DrillGraph, DrillNode } from "../../../lib/drill/types";
import { DEFAULT_CONFIGS } from "../../../lib/drill/run";

/**
 * Traffic, knobs, incidents and pass conditions for each canvas step of the presence drill.
 * Each test models one region carrying 300,000 concurrent users: the full product is ~70 such regions.
 * drill.test.ts proves every reference design passes and the tempting wrong ones fail.
 */

type StepData = Pick<
  DesignStep,
  "scenario" | "constraints" | "flows" | "incident" | "incidentText" | "customKnobs" | "customChecks" | "customCheckLabels" | "nodeDefaults"
>;

const EMPTY = { label: "", load: { reads: 0, writes: 0, attack: 0 } };
const ok = (min: number): Constraint => ({ type: "successRate", min });

export const REGION_USERS = 300_000;

// ---------------------------------------------------------------- Flows

/** A connected app pings every few seconds, which refreshes a short-lived key in Redis. */
const heartbeat = (connections: number, rps: number): Flow => ({
  id: "heartbeat",
  label: "Heartbeats",
  rps,
  connections,
  route: [
    { kind: "limiter", optional: true },
    { kind: "lb", optional: true },
    { kind: "ws", missing: "Presence rides on a long-lived connection: wire Users (or the load balancer) to a WebSocket gateway." },
    { kind: "cache", missing: "Who is online lives in memory, with a timeout: wire the gateways to a Redis cache." },
  ],
});

/** Opening a friend list asks "which of these 200 people are online?". */
const lookup = (rps: number): Flow => ({
  id: "lookup",
  label: "Friend list lookups",
  rps,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "cache" }],
});

/** Someone comes online or goes offline, and each of their online friends is told. */
const status = (rps: number, fanout: number): Flow => ({
  id: "status",
  label: "Status changes → friends",
  rps,
  fanout,
  route: [{ kind: "lb", optional: true }, { kind: "ws" }, { kind: "pubsub", optional: true }],
});

/** Opening the app: authenticate, load the friend list, attach to a gateway. */
const connect = (rps: number): Flow => ({
  id: "connect",
  label: "Connections opening",
  rps,
  route: [{ kind: "lb", optional: true }, { kind: "ws" }, { kind: "server" }, { kind: "db", missing: "Opening the app loads your friend list: wire the API servers to a database." }],
});

// ---------------------------------------------------------------- Knobs

/** Heartbeat interval and how long silence is tolerated before showing someone as offline. */
const HEARTBEATS = {
  frantic: { every: 2, misses: 1 },
  jumpy: { every: 20, misses: 1 },
  steady: { every: 20, misses: 3 },
  lazy: { every: 60, misses: 5 },
} as const;
type HeartbeatId = keyof typeof HEARTBEATS;

const heartbeatKnob: CustomKnob = {
  id: "heartbeat",
  label: "Heartbeats and timeout",
  help: "How often the app pings, and how many missed pings before a friend appears offline.",
  default: "frantic",
  appliesTo: "ws",
  options: [
    { v: "frantic", label: "Ping every 2 s, offline after 1 miss", desc: "Offline shows within 2 seconds. A single dropped packet on a train makes everyone look like they left." },
    { v: "jumpy", label: "Ping every 20 s, offline after 1 miss", desc: "Cheaper traffic, but one lost ping is enough to flip someone offline, then online again." },
    { v: "steady", label: "Ping every 20 s, offline after 3 misses (60 s)", desc: "A glitch has to last a minute to show. A closed app disappears within a minute." },
    { v: "lazy", label: "Ping every 60 s, offline after 5 misses (5 min)", desc: "Very cheap. But five minutes after closing the app, you still look online." },
  ],
};

const reconnect: CustomKnob = {
  id: "reconnect",
  label: "Reconnecting after a drop",
  help: "What clients do when their gateway disappears.",
  default: "immediate",
  options: [
    { v: "immediate", label: "Reconnect at once", desc: "Everyone who lost the gateway knocks on the door in the same second.", values: { retries: 0.5 } },
    { v: "jitter", label: "Backoff with random jitter", desc: "Wait a random 0–10 s before retrying, doubling on failure. The herd spreads out.", values: { retries: 0.1 } },
  ],
};

// ---------------------------------------------------------------- Checks

const count = (g: DrillGraph, kind: DrillNode["kind"]) => g.nodes.filter((n) => n.kind === kind).length;

const heartbeatChecks = ({ knobs, graph }: CustomCheckContext) => {
  const hb = HEARTBEATS[(knobs.heartbeat as HeartbeatId) in HEARTBEATS ? (knobs.heartbeat as HeartbeatId) : "frantic"];
  const staleAfter = hb.every * hb.misses;
  const pings = REGION_USERS / hb.every;
  const redisNeeded = Math.ceil(pings / (SPECS.cache.cap * 0.8));
  const redis = count(graph, "cache");
  return [
    {
      label: "A friend who closes the app looks offline within 90 s",
      ok: staleAfter <= 90,
      message: `With this setting a user who closes the app still looks online for ${staleAfter >= 120 ? `${Math.round(staleAfter / 60)} minutes` : `${staleAfter} seconds`}. Presence that stale stops being presence.`,
    },
    {
      label: "One dropped packet doesn't flip someone offline",
      ok: hb.misses >= 2,
      message:
        "Mobile connections hiccup constantly. If one missed ping marks a user offline, they flicker offline and back online, and each flip tells all their friends. Wait for several misses before believing it.",
    },
    {
      label: "Heartbeat traffic fits the Redis you built",
      ok: redis >= redisNeeded,
      message: `${REGION_USERS.toLocaleString("en-US")} users pinging every ${hb.every} s is ${Math.round(pings).toLocaleString("en-US")} writes a second to Redis. One node handles ~${Math.round((SPECS.cache.cap * 0.8) / 1000)}k comfortably, so this needs ${redisNeeded} (you have ${redis}). Pinging less often is cheaper than more Redis.`,
    },
  ];
};

const reconnectCheck = ({ knobs, graph }: CustomCheckContext) => {
  const gateways = Math.max(1, count(graph, "ws"));
  const orphans = REGION_USERS / gateways;
  const spread = knobs.reconnect === "jitter" ? 10 : 1;
  const authPerSec = orphans / spread;
  const capacity = graph.nodes.filter((n) => n.kind === "server").reduce((s, n) => s + serverSize(n.size).cap, 0);
  return [
    {
      label: "A gateway failure doesn't cause a reconnect stampede",
      ok: authPerSec <= capacity * 0.6,
      message: `When a gateway dies, its ~${Math.round(orphans).toLocaleString("en-US")} users reconnect${spread === 1 ? " in the same second" : ` over ~${spread} s`}: about ${Math.round(authPerSec).toLocaleString("en-US")} logins a second against API servers that can do ${capacity.toLocaleString("en-US")}. Spread reconnects out with jittered backoff${spread === 1 ? "" : " or add servers"}.`,
    },
  ];
};

// ---------------------------------------------------------------- Steps

const heartbeatLabels = [
  "A friend who closes the app looks offline within 90 s",
  "One dropped packet doesn't flip someone offline",
  "Heartbeat traffic fits the Redis you built",
];

export const DESIGN = {
  launch: {
    scenario: { ...EMPTY, label: "Launch week" },
    flows: [heartbeat(30_000, 1_500), lookup(500)],
    constraints: [ok(0.999), { type: "p99", maxMs: 100 }, { type: "budget", maxUsd: 400 }],
  },
  scale: {
    scenario: { ...EMPTY, label: "Evening in one region" },
    flows: [heartbeat(REGION_USERS, 15_000), lookup(8_000)],
    constraints: [ok(0.999), { type: "p99", maxMs: 100 }, { type: "budget", maxUsd: 1_400 }],
  },
  fanout: {
    scenario: { ...EMPTY, label: "Friends see each other come and go" },
    flows: [heartbeat(REGION_USERS, 15_000), lookup(8_000), status(1_500, 40)],
    constraints: [ok(0.999), { type: "delivery", min: 0.99 }, { type: "p99", maxMs: 100 }, { type: "budget", maxUsd: 1_600 }],
  },
  timeouts: {
    scenario: { ...EMPTY, label: "Tuning the heartbeat" },
    flows: [heartbeat(REGION_USERS, 15_000), lookup(8_000), status(1_500, 40)],
    customKnobs: [heartbeatKnob],
    customChecks: (ctx) => heartbeatChecks(ctx),
    customCheckLabels: heartbeatLabels,
    constraints: [ok(0.999), { type: "delivery", min: 0.99 }, { type: "budget", maxUsd: 1_600 }],
  },
  gateway: {
    scenario: { ...EMPTY, label: "A gateway dies" },
    flows: [heartbeat(REGION_USERS, 15_000), lookup(8_000), status(1_500, 40), connect(3_000)],
    customKnobs: [heartbeatKnob, reconnect],
    customChecks: (ctx) => [...heartbeatChecks(ctx), ...reconnectCheck(ctx)],
    customCheckLabels: [...heartbeatLabels, "A gateway failure doesn't cause a reconnect stampede"],
    incident: { type: "down", kind: "ws", label: "A WebSocket gateway dies" },
    incidentText: "Five seconds in, one gateway's host fails. Every user connected to it loses the connection at once.",
    constraints: [{ type: "recovery", maxSeconds: 5 }, { type: "delivery", min: 0.9 }, { type: "budget", maxUsd: 2_200 }],
  },
} satisfies Record<string, StepData>;

export type StepId = keyof typeof DESIGN;

// ---------------------------------------------------------------- Reference designs (used by tests)

type Shape = {
  gateways?: number;
  lb?: boolean;
  servers?: number;
  redis?: number;
  pubsub?: boolean;
  db?: boolean;
  noRedisFromGateway?: boolean;
};

/** users → (lb →) gateways → redis (+ pubsub); users → servers → redis / db. */
export function buildGraph(s: Shape = {}): DrillGraph {
  const nodes: DrillNode[] = [{ id: "users", kind: "client", x: 0, y: 0 }];
  const edges: DrillGraph["edges"] = [];
  const add = (id: string, kind: DrillNode["kind"], extra: Partial<DrillNode> = {}) => nodes.push({ id, kind, x: 0, y: 0, ...extra });
  const wire = (from: string, to: string) => edges.push({ id: `${from}>${to}`, from, to });
  const front = s.lb ? "lb" : "users";
  if (s.lb) {
    add("lb", "lb");
    wire("users", "lb");
  }
  const redis = s.redis ?? 1;
  for (let r = 0; r < redis; r++) add(`redis${r}`, "cache");
  if (s.db) add("db", "db", { role: "primary" });
  if (s.pubsub) add("pubsub", "pubsub");
  for (let g = 0; g < (s.gateways ?? 0); g++) {
    const id = `ws${g}`;
    add(id, "ws");
    wire(front, id);
    if (!s.noRedisFromGateway) for (let r = 0; r < redis; r++) wire(id, `redis${r}`);
    if (s.pubsub) {
      wire(id, "pubsub");
      wire("pubsub", id);
    }
  }
  for (let i = 0; i < (s.servers ?? 0); i++) {
    const id = `srv${i}`;
    add(id, "server", { size: "m" });
    wire(front === "lb" ? "lb" : "users", id);
    for (let r = 0; r < redis; r++) wire(id, `redis${r}`);
    if (s.db) wire(id, "db");
    for (let g = 0; g < (s.gateways ?? 0); g++) wire(`ws${g}`, id);
  }
  return { nodes, edges };
}

export type Design = { graph: DrillGraph; configs: DrillConfigs };

export function configs(custom: Record<string, string> = {}, healthChecks = false): DrillConfigs {
  const c = structuredClone(DEFAULT_CONFIGS);
  return { ...c, custom, resilience: { ...c.resilience, healthChecks } };
}

type Case = { pass: Design; fail: { why: string; design: Design; failing: string[] }[] };

const STEADY = { heartbeat: "steady" };

export const REFERENCE: Record<StepId, Case> = {
  launch: {
    pass: { graph: buildGraph({ gateways: 1, servers: 1 }), configs: configs() },
    fail: [
      { why: "no gateway: nothing holds the connections", design: { graph: buildGraph({ gateways: 0, servers: 1 }), configs: configs() }, failing: ["successRate"] },
      { why: "gateways and servers beyond the budget", design: { graph: buildGraph({ gateways: 3, servers: 2, lb: true, redis: 2 }), configs: configs() }, failing: ["budget"] },
    ],
  },
  scale: {
    pass: { graph: buildGraph({ gateways: 8, lb: true, servers: 1 }), configs: configs() },
    fail: [
      { why: "four gateways can't hold 300k connections", design: { graph: buildGraph({ gateways: 4, lb: true, servers: 1 }), configs: configs() }, failing: ["successRate"] },
      { why: "scaling gateways without a limit on cost", design: { graph: buildGraph({ gateways: 14, lb: true, servers: 1 }), configs: configs() }, failing: ["budget"] },
    ],
  },
  fanout: {
    pass: { graph: buildGraph({ gateways: 8, lb: true, servers: 1, pubsub: true }), configs: configs() },
    fail: [
      { why: "gateways that can't talk: friends on other gateways never hear", design: { graph: buildGraph({ gateways: 8, lb: true, servers: 1 }), configs: configs() }, failing: ["delivery"] },
    ],
  },
  timeouts: {
    pass: { graph: buildGraph({ gateways: 8, lb: true, servers: 1, pubsub: true }), configs: configs(STEADY) },
    fail: [
      { why: "pinging every 2 s: flappy and expensive", design: { graph: buildGraph({ gateways: 8, lb: true, servers: 1, pubsub: true }), configs: configs({ heartbeat: "frantic" }) }, failing: ["custom"] },
      { why: "one missed ping means offline", design: { graph: buildGraph({ gateways: 8, lb: true, servers: 1, pubsub: true }), configs: configs({ heartbeat: "jumpy" }) }, failing: ["custom"] },
      { why: "five-minute timeout: ghosts", design: { graph: buildGraph({ gateways: 8, lb: true, servers: 1, pubsub: true }), configs: configs({ heartbeat: "lazy" }) }, failing: ["custom"] },
    ],
  },
  gateway: {
    pass: { graph: buildGraph({ gateways: 9, lb: true, servers: 2, pubsub: true, db: true }), configs: configs({ ...STEADY, reconnect: "jitter" }, true) },
    fail: [
      { why: "no health checks: the balancer keeps sending to the dead gateway", design: { graph: buildGraph({ gateways: 9, lb: true, servers: 2, pubsub: true, db: true }), configs: configs({ ...STEADY, reconnect: "jitter" }, false) }, failing: ["recovery"] },
      { why: "no spare gateway: the survivors can't hold everyone", design: { graph: buildGraph({ gateways: 6, lb: true, servers: 2, pubsub: true, db: true }), configs: configs({ ...STEADY, reconnect: "jitter" }, true) }, failing: ["recovery"] },
      { why: "reconnect stampede", design: { graph: buildGraph({ gateways: 9, lb: true, servers: 2, pubsub: true, db: true }), configs: configs({ ...STEADY, reconnect: "immediate" }, true) }, failing: ["custom"] },
    ],
  },
};
