// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow } from "../../../sim";
import { DB_WRITE_CAP, SPECS } from "../../../sim";
import type { CustomCheckContext, DesignStep, LabGraph, LabNode } from "../../../lib/lab/types";

/**
 * Load, knobs, incidents and pass conditions for each canvas step of the
 * key-value store lab. A "node" of the cluster is an API server (coordinator)
 * plus its share of the database's shards; replication and quorums are
 * lab-defined knobs checked against the engine's numbers. lab.test.ts proves
 * every reference design passes and the tempting wrong ones fail.
 */

export type StepData = Pick<
  DesignStep,
  "scenario" | "constraints" | "flows" | "incident" | "incidentText" | "customKnobs" | "customChecks" | "customCheckLabels" | "nodeDefaults"
>;

const NO_LOAD = { reads: 0, writes: 0, attack: 0 };
const route = (...r: Flow["route"]) => r;
type Knobs = Record<string, string>;
type Rule = { label: string; ok: (c: CustomCheckContext) => boolean; message: (c: CustomCheckContext) => string };

// ---------------------------------------------------------------- Knobs

export const PARTITION: CustomKnob = {
  id: "partition",
  label: "Assign keys to partitions by",
  help: "The rule that decides which partition owns a key.",
  default: "range",
  appliesTo: "db",
  options: [
    { v: "range", label: "Key range (A–F, G–M, ...)", desc: "Neighbouring keys stay together. Popular prefixes and timestamps pile onto one partition.", values: { skew: 0.7 } },
    { v: "modulo", label: "hash(key) mod number of nodes", desc: "Even, but changing the node count remaps almost every key." },
    { v: "ring", label: "Consistent-hash ring, one token per node", desc: "Adding a node moves only its neighbour's keys, but random token positions give unequal slices.", values: { skew: 0.3 } },
    { v: "vnodes", label: "Consistent-hash ring, many virtual nodes", desc: "Each node owns many small slices, so load is even and adding a node steals evenly from everyone." },
  ],
};

export const REPLICAS: CustomKnob = {
  id: "n",
  label: "Copies of every key (N)",
  help: "How many nodes store each key.",
  default: "1",
  options: [
    { v: "1", label: "N = 1", desc: "One copy. The node that dies takes its keys with it." },
    { v: "3", label: "N = 3", desc: "Three copies on three different nodes. The usual choice." },
    { v: "5", label: "N = 5", desc: "Five copies. Survives two failures, and multiplies write traffic by five." },
  ],
};

export const READ_Q: CustomKnob = {
  id: "r",
  label: "Replicas that must answer a read (R)",
  help: "A read returns when this many replicas have replied.",
  default: "one",
  options: [
    { v: "one", label: "R = 1", desc: "Fastest. May return a replica that hasn't seen the latest write." },
    { v: "quorum", label: "R = majority", desc: "Waits for more than half of the replicas." },
    { v: "all", label: "R = N", desc: "Waits for every replica. One slow or dead node stalls every read." },
  ],
};

export const WRITE_Q: CustomKnob = {
  id: "w",
  label: "Replicas that must confirm a write (W)",
  help: "A write is acknowledged when this many replicas have stored it.",
  default: "one",
  options: [
    { v: "one", label: "W = 1", desc: "Fastest ack. The other copies are updated in the background." },
    { v: "quorum", label: "W = majority", desc: "Waits for more than half of the replicas." },
    { v: "all", label: "W = N", desc: "Waits for every replica. One dead node blocks all writes to its keys." },
  ],
};

export const HEAL: CustomKnob = {
  id: "heal",
  label: "Stale replicas are repaired by",
  help: "How a node that missed writes catches up.",
  default: "none",
  options: [
    { v: "none", label: "Nothing", desc: "They stay stale until the key is overwritten." },
    { v: "read", label: "Read repair", desc: "When a read sees replicas disagree, it writes the newest value back to the stale ones." },
    { v: "full", label: "Hinted handoff + read repair + anti-entropy", desc: "Stand-in nodes hold missed writes and hand them back; Merkle trees find the rest." },
  ],
};

export const HOT: CustomKnob = {
  id: "hot",
  label: "One very hot key is handled by",
  help: "What happens when one key gets a huge share of the traffic.",
  default: "none",
  options: [
    { v: "none", label: "Nothing special", desc: "Every request for the key lands on its three replicas.", values: { skew: 0.55 } },
    { v: "split", label: "Split it into sub-keys", desc: "Store score#1 to score#8; writers pick one at random, readers combine them.", values: { skew: 0 } },
    { v: "cache", label: "Cache it in front", desc: "A cache answers repeat reads before they reach the owners.", values: { skew: 0 } },
  ],
};

// ---------------------------------------------------------------- Rules

const quorum = (n: number) => Math.floor(n / 2) + 1;
const num = (k: Knobs, id: "r" | "w") => {
  const n = Number(k.n ?? 1);
  return k[id] === "all" ? n : k[id] === "quorum" ? quorum(n) : 1;
};

const GETS = 30_000;
const PUTS = 6_000;

/** Utilisation of the busiest-possible shard once replication is counted. */
export function storageUtil(g: LabGraph, k: Knobs, gets = GETS, puts = PUTS) {
  const shards = Math.max(1, g.nodes.find((n) => n.kind === "db")?.shards ?? 1);
  const n = Number(k.n ?? 1);
  return (gets * num(k, "r")) / SPECS.db.cap / shards + (puts * n) / DB_WRITE_CAP / shards;
}

const RULES = {
  moves: {
    label: "Adding a node moves only its share of keys",
    ok: ({ knobs }) => knobs.partition === "ring" || knobs.partition === "vnodes",
    message: () =>
      "With hash(key) mod N, going from 6 nodes to 7 changes the owner of about 6 keys in 7. That means copying most of the data while serving traffic. Use a consistent-hash ring: a new node only takes over its neighbour's slice.",
  },
  even: {
    label: "Every partition gets a fair share",
    ok: ({ knobs }) => knobs.partition !== "ring" && knobs.partition !== "range",
    message: ({ knobs }) =>
      knobs.partition === "range"
        ? "Key ranges follow how people name keys. All of today's order ids share a prefix, so one partition takes the traffic. Hash the key."
        : "A ring with one random token per node gives slices that differ by 2-3x, so one node is always the hot one. Give each node many virtual nodes.",
  },
  durable: {
    label: "A dead disk doesn't lose keys",
    ok: ({ knobs }) => Number(knobs.n) >= 3,
    message: () => "With one copy, the node that dies takes its keys with it. Keep at least three copies on different nodes, so two can fail before anything is lost.",
  },
  capacity: {
    label: "Replicated writes still fit on the nodes",
    ok: (c) => storageUtil(c.graph, c.knobs) <= 0.85,
    message: (c) =>
      `With these settings the storage layer would run at ${Math.round(storageUtil(c.graph, c.knobs) * 100)}%: every write is stored N times and every read asks R replicas. Add partitions, or lower N or R.`,
  },
  fresh: {
    label: "A read always sees the latest acknowledged write",
    ok: ({ knobs }) => num(knobs, "r") + num(knobs, "w") > Number(knobs.n),
    message: ({ knobs }) =>
      `R + W is ${num(knobs, "r") + num(knobs, "w")} but N is ${knobs.n}. A write can be on W nodes and a read can ask R nodes that don't overlap with them, so the read misses it. Choose R + W > N so every read set overlaps every write set.`,
  },
  writesSurvive: {
    label: "Writes still succeed with a node down",
    ok: ({ knobs }) => Number(knobs.n) > 1 && num(knobs, "w") < Number(knobs.n),
    message: () => "W equals N, so the moment one replica is down every write to its keys fails. Wait for a majority instead: with N = 3, two acks are enough.",
  },
  readsSurvive: {
    label: "Reads still succeed with a node down",
    ok: ({ knobs }) => Number(knobs.n) > 1 && num(knobs, "r") < Number(knobs.n),
    message: () => "R equals N, so one dead replica stalls every read of its keys. Ask a majority instead.",
  },
  repair: {
    label: "A node that missed writes gets repaired",
    ok: ({ knobs }) => knobs.heal === "read" || knobs.heal === "full",
    message: () => "The node came back with old values and nothing ever corrects them: reads at R = 1 keep returning stale data. Repair replicas when a read finds a disagreement.",
  },
  coldKeys: {
    label: "Keys nobody reads get repaired too",
    ok: ({ knobs }) => knobs.heal === "full",
    message: () =>
      "Read repair only fixes keys someone reads. A rarely-read key stays under-replicated, and if the other two copies fail you lose it. Hinted handoff replays missed writes, and Merkle-tree anti-entropy finds the rest.",
  },
  hot: {
    label: "One hot key can't melt its partition",
    ok: ({ knobs }) => knobs.hot === "split" || knobs.hot === "cache",
    message: () => "A single key lives on one partition's replicas, however many partitions you add. Spread it (sub-keys) or answer it before it gets there (a cache).",
  },
  hotCache: {
    label: "A cache is wired in front of the nodes",
    ok: ({ knobs, graph }) => knobs.hot !== "cache" || graph.nodes.some((n) => n.kind === "cache"),
    message: () => "You chose to cache the hot key but there is no cache on the canvas. Add one and wire the servers to it.",
  },
} satisfies Record<string, Rule>;

const rules = (...rs: Rule[]): Pick<StepData, "customChecks" | "customCheckLabels"> => ({
  customChecks: (c) => rs.map((r) => ({ label: r.label, ok: r.ok(c), message: r.message(c) })),
  customCheckLabels: rs.map((r) => r.label),
});

// ---------------------------------------------------------------- Flows

const get = (rps: number): Flow => ({
  id: "get",
  label: "Get a key",
  rps,
  route: route({ kind: "lb", optional: true }, { kind: "server" }, { kind: "cache", optional: true, cacheable: 0.9 }, { kind: "db" }),
});
const put = (rps: number): Flow => ({
  id: "put",
  label: "Put a key",
  rps,
  write: true,
  route: route({ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }),
});
const viral: Flow = {
  id: "viral",
  label: "Read the viral key",
  rps: 2_000,
  route: route({ kind: "lb", optional: true }, { kind: "server" }, { kind: "cache", optional: true, cacheable: 0.95 }, { kind: "db" }),
};

const ok99: Constraint = { type: "successRate", min: 0.99 };
const flowsMain = [get(GETS), put(PUTS)];

// ---------------------------------------------------------------- Steps

export const STEPS = {
  launch: {
    scenario: { label: "One node", load: NO_LOAD },
    flows: [get(2_000), put(400)],
    constraints: [ok99, { type: "p99", maxMs: 50 }, { type: "budget", maxUsd: 500 }],
  },
  partition: {
    scenario: { label: "Past one machine", load: NO_LOAD },
    flows: flowsMain,
    customKnobs: [PARTITION],
    ...rules(RULES.moves, RULES.even),
    constraints: [ok99, { type: "p99", maxMs: 50 }, { type: "budget", maxUsd: 2_200 }],
  },
  replicate: {
    scenario: { label: "A disk dies", load: NO_LOAD },
    flows: flowsMain,
    customKnobs: [PARTITION, REPLICAS],
    ...rules(RULES.moves, RULES.even, RULES.durable, RULES.capacity),
    constraints: [ok99, { type: "p99", maxMs: 50 }, { type: "budget", maxUsd: 3_200 }],
  },
  quorum: {
    scenario: { label: "Read what you wrote", load: NO_LOAD },
    flows: flowsMain,
    customKnobs: [PARTITION, REPLICAS, READ_Q, WRITE_Q],
    ...rules(RULES.moves, RULES.even, RULES.durable, RULES.capacity, RULES.fresh),
    constraints: [ok99, { type: "p99", maxMs: 50 }, { type: "budget", maxUsd: 3_200 }],
  },
  nodedown: {
    scenario: { label: "A node dies", load: NO_LOAD },
    flows: flowsMain,
    incident: { type: "down", kind: "server", label: "A storage node dies" },
    incidentText: "Five seconds in, a node's machine loses power. It was a coordinator and held one replica of a third of the keys.",
    customKnobs: [PARTITION, REPLICAS, READ_Q, WRITE_Q],
    ...rules(RULES.moves, RULES.even, RULES.durable, RULES.capacity, RULES.fresh, RULES.writesSurvive, RULES.readsSurvive),
    constraints: [{ type: "successRate", min: 0.97 }, { type: "recovery", maxSeconds: 5 }, { type: "budget", maxUsd: 3_600 }],
  },
  repair: {
    scenario: { label: "The node comes back", load: NO_LOAD },
    flows: flowsMain,
    incident: { type: "down", kind: "server", label: "A node dies and returns" },
    incidentText: "The node was down for ten minutes. It rejoins missing every write that happened meanwhile.",
    customKnobs: [PARTITION, REPLICAS, READ_Q, WRITE_Q, HEAL],
    ...rules(RULES.moves, RULES.even, RULES.durable, RULES.capacity, RULES.fresh, RULES.writesSurvive, RULES.readsSurvive, RULES.repair, RULES.coldKeys),
    constraints: [{ type: "successRate", min: 0.97 }, { type: "recovery", maxSeconds: 5 }, { type: "budget", maxUsd: 3_600 }],
  },
  hotkey: {
    scenario: { label: "A key goes viral", load: NO_LOAD },
    flows: [...flowsMain, viral],
    incident: { type: "spike", multiplier: 10, flows: ["viral"], seconds: 10, label: "One key goes viral" },
    incidentText: "A celebrity's profile key is read 20,000 times a second for ten seconds. It is one key, so it lives on one partition's three replicas.",
    customKnobs: [PARTITION, REPLICAS, READ_Q, WRITE_Q, HEAL, HOT],
    ...rules(
      RULES.moves,
      RULES.even,
      RULES.durable,
      RULES.capacity,
      RULES.fresh,
      RULES.writesSurvive,
      RULES.readsSurvive,
      RULES.repair,
      RULES.coldKeys,
      RULES.hot,
      RULES.hotCache,
    ),
    constraints: [ok99, { type: "p99", maxMs: 80 }, { type: "budget", maxUsd: 4_000 }],
  },
} satisfies Record<string, StepData>;

export type StepId = keyof typeof STEPS;

// ---------------------------------------------------------------- Reference graphs (used by tests)

export type Shape = { lb?: boolean; servers?: number; shards?: number; cache?: boolean; noDb?: boolean };

export function buildGraph(s: Shape): LabGraph {
  const nodes: LabNode[] = [{ id: "users", kind: "client", x: 0, y: 0 }];
  const edges: LabGraph["edges"] = [];
  const wire = (from: string, to: string) => edges.push({ id: `${from}>${to}`, from, to });
  const add = (id: string, kind: LabNode["kind"], extra: Partial<LabNode> = {}) => nodes.push({ id, kind, x: 0, y: 0, ...extra });
  const front = s.lb ? "lb" : "users";
  if (s.lb) {
    add("lb", "lb");
    wire("users", "lb");
  }
  if (!s.noDb) add("db", "db", { shards: s.shards ?? 1 });
  if (s.cache) add("redis", "cache");
  for (let i = 0; i < (s.servers ?? 1); i++) {
    const id = `node-${i}`;
    add(id, "server", { size: "m" });
    wire(front, id);
    if (!s.noDb) wire(id, "db");
    if (s.cache) wire(id, "redis");
  }
  return { nodes, edges };
}

export const GOOD_KNOBS = { partition: "vnodes", n: "3", r: "quorum", w: "quorum", heal: "full", hot: "cache" };

export const REFERENCE: Record<StepId, Shape> = {
  launch: { servers: 1 },
  partition: { lb: true, servers: 4, shards: 4 },
  replicate: { lb: true, servers: 4, shards: 6 },
  quorum: { lb: true, servers: 4, shards: 6 },
  nodedown: { lb: true, servers: 4, shards: 6 },
  repair: { lb: true, servers: 4, shards: 6 },
  hotkey: { lb: true, servers: 4, shards: 6, cache: true },
};
