// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow, FlowIncident } from "../../../sim";
import type { CustomCheckContext, DesignStep, DrillScenario } from "../../../lib/drill/types";
import type { Shape } from "./graph";

/**
 * Traffic, incidents and pass conditions for the canvas steps of the ride-dispatch drill.
 * drill.test.ts proves each reference design passes and each tempting wrong one fails.
 */

const NONE = { reads: 0, writes: 0, attack: 0 };

/** Launch: every driver ping is written straight to the database. */
const pingsToDb = (rps: number): Flow => ({
  id: "location",
  label: "Driver location updates",
  rps,
  write: true,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }],
});
/** Scale: pings land in an in-memory index; the database only sees periodic checkpoints. */
const pings = (rps: number): Flow => ({
  id: "location",
  label: "Driver location updates",
  rps,
  write: true,
  route: [
    { kind: "lb", optional: true },
    { kind: "server" },
    { kind: "cache", cacheable: 0.95, missing: "At this volume locations belong in memory: wire the API servers to a Redis geo index." },
    { kind: "db" },
  ],
});
const request = (rps: number): Flow => ({
  id: "request",
  label: "Request a ride",
  rps,
  write: true,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }],
});
const nearby: Flow = {
  id: "nearby",
  label: "Find nearby drivers",
  rps: 1_500,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "cache", missing: "Nearby search reads the in-memory geo index: wire the API servers to Redis." }],
};
const match: Flow = {
  id: "match",
  label: "Match a rider to a driver",
  rps: 300,
  write: true,
  workMs: 30,
  slaSeconds: 10,
  route: [
    { kind: "lb", optional: true },
    { kind: "server" },
    { kind: "queue", missing: "Matching runs as a service off a queue: wire the API servers to a Queue." },
    { kind: "worker", missing: "Wire the queue to matching workers." },
    { kind: "cache" },
    { kind: "db" },
  ],
};
const trips: Flow = {
  id: "trips",
  label: "Trip events and history",
  rps: 6_000,
  write: true,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }],
};
const track: Flow = {
  id: "track",
  label: "Live driver position to riders",
  rps: 37_500,
  connections: 150_000,
  fanout: 1,
  route: [{ kind: "ws", missing: "Riders hold a WebSocket open to watch the car move: put a WebSocket gateway in front of users." }, { kind: "pubsub", optional: true }],
};

const geoKnob: CustomKnob = {
  id: "geo",
  label: "Finding nearby drivers",
  help: "How the geo index answers 'who is within 2 km of this pickup?'.",
  default: "scan",
  options: [
    { v: "scan", label: "Compare to every driver", desc: "Loop over all 200,000 drivers and compute distances." },
    { v: "grid", label: "Fixed grid", desc: "Square cells of the same size everywhere." },
    { v: "geohash", label: "Geohash, one cell", desc: "Prefix of the pickup's geohash. Fast, but ignores the borders." },
    { v: "geohash9", label: "Geohash + 8 neighbours", desc: "The pickup's cell and the eight around it, then sort by distance." },
    { v: "quadtree", label: "Quadtree", desc: "Cells split when crowded. Elegant for fixed points." },
  ],
};
const assignKnob: CustomKnob = {
  id: "assign",
  label: "Claiming a driver",
  help: "What happens when two matchers pick the same nearest driver.",
  default: "read",
  options: [
    { v: "read", label: "Read status, then assign", desc: "Look at the driver, see 'available', then mark busy." },
    { v: "atomic", label: "Atomic claim", desc: "SET driver:7 busy NX in Redis, or UPDATE ... WHERE status='available'. Exactly one caller wins." },
  ],
};
const shardKnob: CustomKnob = {
  id: "shardKey",
  label: "Shard by",
  help: "How trip rows are spread over shards.",
  default: "city",
  appliesTo: "db",
  options: [
    { v: "city", label: "city", desc: "Everything about Mumbai lives together. Mumbai is 60% of the traffic.", values: { skew: 0.6 } },
    { v: "driver", label: "driver id", desc: "Spreads evenly. A nearby search must ask every shard.", values: { skew: 0 } },
    { v: "citycell", label: "city, then geohash prefix", desc: "Hot cities are split into neighbourhood ranges. A search still touches one or two shards.", values: { skew: 0 } },
  ],
};

const ok99: Constraint = { type: "successRate", min: 0.99 };
const ND = { cache: { hitRate: 0.95 } };

const geoChecks = (c: CustomCheckContext) => [
  {
    label: "Nearby search doesn't read every driver",
    ok: c.knobs.geo === "geohash9",
    message:
      c.knobs.geo === "scan"
        ? "Comparing a pickup to 200,000 drivers on every request is 300 million distance calculations a second. Index drivers by location cell."
        : c.knobs.geo === "grid"
          ? "One cell size does not fit a city: downtown holds thousands of drivers in a cell, the suburbs hold none. Use a hierarchical index like geohash."
          : c.knobs.geo === "geohash"
            ? "A rider standing near a cell edge misses the closest drivers just across it. Search the cell and its eight neighbours."
            : "A quadtree has to rebalance as 50,000 drivers move every second, which burns CPU. Moving points suit a plain prefix lookup on a hash key.",
  },
];
const assignChecks = (c: CustomCheckContext) => [
  {
    label: "A driver is never promised to two riders",
    ok: c.knobs.assign === "atomic",
    message: "Two matchers can both read 'available' and both offer the ride. Make the claim one atomic step: SET NX or a conditional UPDATE.",
  },
];
const shardChecks = (c: CustomCheckContext) => [
  {
    label: "Shards stay balanced and searches stay local",
    ok: c.knobs.shardKey === "citycell",
    message:
      c.knobs.shardKey === "city"
        ? "Mumbai is 60% of rides and lives on one shard, so one machine melts while the rest idle. Adding shards cannot move a city. Split hot cities by area."
        : "Sharding by driver balances writes, but every nearby search must ask every shard and merge the answers. Keep neighbours together.",
  },
];

type Def = {
  scenario: DrillScenario;
  flows: Flow[];
  constraints: Constraint[];
  incident?: FlowIncident;
  incidentText?: string;
  nodeDefaults?: DesignStep["nodeDefaults"];
  customKnobs?: CustomKnob[];
  customChecks?: DesignStep["customChecks"];
  customCheckLabels?: string[];
};
const GEO = "Nearby search doesn't read every driver";
const ASSIGN = "A driver is never promised to two riders";
const SHARD = "Shards stay balanced and searches stay local";

export const DESIGN = {
  launch: {
    scenario: { label: "One city, 2,000 drivers", load: NONE },
    flows: [pingsToDb(500), request(5)],
    constraints: [ok99, { type: "p99", maxMs: 200 }, { type: "budget", maxUsd: 450 }],
  },
  updates: {
    scenario: { label: "200,000 drivers on the road", load: NONE },
    flows: [pings(50_000), request(200)],
    nodeDefaults: ND,
    constraints: [ok99, { type: "flowSuccess", flow: "location", min: 0.995 }, { type: "budget", maxUsd: 1_700 }],
  },
  geo: {
    scenario: { label: "Who is nearby?", load: NONE },
    flows: [pings(50_000), request(200), nearby],
    nodeDefaults: ND,
    customKnobs: [geoKnob],
    customChecks: geoChecks,
    customCheckLabels: [GEO],
    constraints: [ok99, { type: "flowSuccess", flow: "nearby", min: 0.995 }, { type: "budget", maxUsd: 2_000 }],
  },
  matching: {
    scenario: { label: "Two riders, one driver", load: NONE },
    flows: [pings(50_000), request(200), nearby, match],
    nodeDefaults: ND,
    customKnobs: [geoKnob, assignKnob],
    customChecks: (c) => [...geoChecks(c), ...assignChecks(c)],
    customCheckLabels: [GEO, ASSIGN],
    constraints: [ok99, { type: "flowSuccess", flow: "match", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 5 }, { type: "budget", maxUsd: 2_400 }],
  },
  cities: {
    scenario: { label: "Rain in Mumbai", load: NONE },
    flows: [pings(50_000), request(200), nearby, match, trips],
    incident: { type: "spike", multiplier: 3, flows: ["trips"], seconds: 12, label: "Monsoon surge in one city" },
    incidentText: "Friday 9 p.m., the rain starts in Mumbai: trip activity triples for twelve seconds, and Mumbai is 60% of all rides.",
    nodeDefaults: ND,
    customKnobs: [geoKnob, assignKnob, shardKnob],
    customChecks: (c) => [...geoChecks(c), ...assignChecks(c), ...shardChecks(c)],
    customCheckLabels: [GEO, ASSIGN, SHARD],
    constraints: [{ type: "everySecond", min: 0.97 }, { type: "flowSuccess", flow: "trips", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 3_200 }],
  },
  tracking: {
    scenario: { label: "Watch the car arrive", load: NONE },
    flows: [pings(50_000), request(200), nearby, match, trips, track],
    nodeDefaults: ND,
    customKnobs: [geoKnob, assignKnob, shardKnob],
    customChecks: (c) => [...geoChecks(c), ...assignChecks(c), ...shardChecks(c)],
    customCheckLabels: [GEO, ASSIGN, SHARD],
    constraints: [ok99, { type: "delivery", min: 0.99 }, { type: "flowSuccess", flow: "track", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 4_200 }],
  },
} satisfies Record<string, Def>;

// ---------------------------------------------------------------- Reference designs (used by tests)

type Case = { shape: Shape; knobs?: Record<string, string> };
const G = { geo: "geohash9" };
const A = { ...G, assign: "atomic" };
const S = { ...A, shardKey: "citycell" };
const FAST: Shape = { lb: true, servers: 5, size: "m", cache: true };
const MATCH: Shape = { ...FAST, queue: true, workers: 2 };
const CITY: Shape = { ...MATCH, shards: 4 };
const LIVE: Shape = { ...CITY, gateways: 4, pubsub: true };

export const REFERENCE: Record<keyof typeof DESIGN, { pass: Case; fail: { why: string; case: Case; failing: string[] }[] }> = {
  launch: {
    pass: { shape: { servers: 1, size: "s" } },
    fail: [{ why: "a fleet of big servers is a budget bust for 500 pings a second", case: { shape: { lb: true, servers: 4, size: "xl", cache: true, shards: 2 } }, failing: ["budget"] }],
  },
  updates: {
    pass: { shape: FAST },
    fail: [
      { why: "writing every ping to the database melts it", case: { shape: { lb: true, servers: 5, size: "m", shards: 1 } }, failing: ["successRate", "flowSuccess"] },
      { why: "Redis with too few servers drops pings", case: { shape: { servers: 1, size: "m", cache: true } }, failing: ["flowSuccess"] },
    ],
  },
  geo: {
    pass: { shape: FAST, knobs: G },
    fail: [
      { why: "scanning every driver is far too slow", case: { shape: FAST, knobs: { geo: "scan" } }, failing: ["custom"] },
      { why: "one geohash cell misses drivers across the border", case: { shape: FAST, knobs: { geo: "geohash" } }, failing: ["custom"] },
      { why: "a quadtree thrashes under constant movement", case: { shape: FAST, knobs: { geo: "quadtree" } }, failing: ["custom"] },
      { why: "without Redis nearby search has nothing to read", case: { shape: { lb: true, servers: 5, size: "m" }, knobs: G }, failing: ["flowSuccess"] },
    ],
  },
  matching: {
    pass: { shape: MATCH, knobs: A },
    fail: [
      { why: "read-then-assign can offer one driver twice", case: { shape: MATCH, knobs: { ...G, assign: "read" } }, failing: ["custom"] },
      { why: "no queue or workers means no matching service", case: { shape: FAST, knobs: A }, failing: ["flowSuccess"] },
      { why: "one matcher cannot keep up in time", case: { shape: { ...MATCH, workers: 1 }, knobs: A }, failing: ["asyncOnTime"] },
    ],
  },
  cities: {
    pass: { shape: CITY, knobs: S },
    fail: [
      { why: "sharding by city leaves Mumbai on one hot shard", case: { shape: { ...CITY, shards: 8 }, knobs: { ...A, shardKey: "city" } }, failing: ["custom", "flowSuccess"] },
      { why: "sharding by driver scatters every nearby search", case: { shape: CITY, knobs: { ...A, shardKey: "driver" } }, failing: ["custom"] },
      { why: "one database cannot absorb the surge at all", case: { shape: { ...MATCH, shards: 1 }, knobs: S }, failing: ["flowSuccess"] },
    ],
  },
  tracking: {
    pass: { shape: LIVE, knobs: S },
    fail: [
      { why: "one gateway cannot hold 150,000 connections", case: { shape: { ...CITY, gateways: 1, pubsub: true }, knobs: S }, failing: ["flowSuccess"] },
      { why: "several gateways without pub/sub deliver only a fraction", case: { shape: { ...CITY, gateways: 4 }, knobs: S }, failing: ["delivery"] },
      { why: "no gateway at all", case: { shape: CITY, knobs: S }, failing: ["flowSuccess"] },
    ],
  },
};
