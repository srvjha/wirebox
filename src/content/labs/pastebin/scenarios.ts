// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow, FlowIncident, Kind } from "../../../sim";
import type { CustomCheckContext, DesignStep, LabConfigs, LabGraph, LabNode } from "../../../lib/lab/types";
import { DEFAULT_CONFIGS } from "../../../lib/lab/run";

/**
 * Traffic, knobs, incidents and pass conditions for each canvas step of the pastebin lab.
 * lab.test.ts proves every reference design passes and the tempting wrong ones fail.
 */

type StepData = Pick<
  DesignStep,
  "scenario" | "constraints" | "flows" | "incident" | "incidentText" | "customKnobs" | "customChecks" | "customCheckLabels" | "nodeDefaults"
>;

const EMPTY = { label: "", load: { reads: 0, writes: 0, attack: 0 } };
const ok = (min: number): Constraint => ({ type: "successRate", min });

// ---------------------------------------------------------------- Flows

/** Creating a paste: metadata row in the database, the text itself in object storage. */
const create = (rps: number): Flow => ({
  id: "create",
  label: "Create a paste",
  rps,
  write: true,
  route: [
    { kind: "limiter", optional: true },
    { kind: "lb", optional: true },
    { kind: "server" },
    { kind: "db" },
    { kind: "storage", missing: "Paste text lives in object storage: wire the API server to Storage." },
  ],
});

/** Reading a paste: the CDN answers hot pastes; the rest check metadata, then fetch the text. */
const read = (rps: number): Flow => ({
  id: "read",
  label: "Read a paste",
  rps,
  route: [
    { kind: "cdn", optional: true, cacheable: 0.9 },
    { kind: "lb", optional: true },
    { kind: "server" },
    { kind: "db" },
    { kind: "storage", missing: "Paste text lives in object storage: wire the API server to Storage." },
  ],
});

/** The scheduled sweep that deletes expired pastes: a batch of independent jobs, so a queue and workers. */
const sweep = (rps: number): Flow => ({
  id: "sweep",
  label: "Expiry sweep (scheduled)",
  rps,
  workMs: 100,
  slaSeconds: 120,
  route: [
    { kind: "lb", optional: true },
    { kind: "server" },
    { kind: "queue", missing: "A sweep is thousands of small deletes. Put them on a Queue so workers can chew through them." },
    { kind: "worker" },
    { kind: "db" },
    { kind: "storage" },
  ],
});

/** Spam bots posting huge pastes. */
const spam = (rps: number): Flow => ({
  id: "spam",
  label: "Spam bots",
  rps,
  legit: false,
  write: true,
  route: [{ kind: "limiter", optional: true }, { kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }, { kind: "storage" }],
});

// ---------------------------------------------------------------- Knobs

const cdnTtl: CustomKnob = {
  id: "cdnTtl",
  label: "CDN caching",
  help: "How long the edge may keep a paste before asking you again.",
  default: "forever",
  appliesTo: "cdn",
  options: [
    { v: "forever", label: "Cache for a year", desc: "Highest hit rate, but a deleted or expired paste keeps being served from the edge.", values: { hitRate: 0.97 } },
    { v: "match", label: "Until the paste expires (max 1 h) + purge on delete", desc: "Slightly lower hit rate. Expired pastes disappear when they should.", values: { hitRate: 0.93 } },
  ],
};

const expiry: CustomKnob = {
  id: "expiry",
  label: "Expiry cleanup",
  help: "How expired pastes actually get removed.",
  default: "scan",
  options: [
    { v: "scan", label: "Nightly full-table scan", desc: "DELETE … WHERE expires_at < now() with no index. Reads every row, every night." },
    { v: "lazy", label: "Check on read only", desc: "Hide expired pastes when someone opens them. Nothing ever deletes the bytes." },
    { v: "index", label: "Indexed expiry + batched deletes", desc: "An index on expires_at finds exactly the expired rows; workers delete them in small batches." },
  ],
};

const sizeCap: CustomKnob = {
  id: "sizeCap",
  label: "Max paste size",
  help: "What the API accepts before storing anything.",
  default: "none",
  options: [
    { v: "none", label: "No limit", desc: "Anyone can upload a 2 GB log file, a thousand times." },
    { v: "512k", label: "512 KB per paste", desc: "Plenty for code and logs. Rejected with 413 before it touches storage." },
  ],
};

const limitBy: CustomKnob = {
  id: "limitBy",
  label: "Rate limit by",
  help: "What the limiter counts requests against.",
  default: "global",
  appliesTo: "limiter",
  options: [
    { v: "global", label: "Everyone together", desc: "One shared budget. A bot burns it and real visitors are rejected too.", values: { attackPass: 0.02 } },
    { v: "key", label: "API key", desc: "Precise, but anonymous visitors have no key to count.", values: { attackPass: 0.02 } },
    { v: "ip", label: "Client IP", desc: "Each address gets its own small budget. A bot is capped; a visitor never notices.", values: { attackPass: 0.05 } },
  ],
};

// ---------------------------------------------------------------- Checks

const has = (g: LabGraph, kind: Kind) => g.nodes.some((n) => n.kind === kind);

const cdnCheck = ({ knobs, graph }: CustomCheckContext) => [
  {
    label: "Expired and deleted pastes stop being served",
    ok: !has(graph, "cdn") || knobs.cdnTtl === "match",
    message: "With a year-long edge cache, a paste you deleted (or that expired) keeps loading from the CDN for months. Expire edge copies with the paste and purge on delete.",
  },
];

const expiryCheck = ({ knobs }: CustomCheckContext) => [
  {
    label: "Expired pastes are really deleted, without hurting reads",
    ok: knobs.expiry === "index",
    message:
      knobs.expiry === "lazy"
        ? "Hiding expired pastes on read never frees the bytes. Storage grows forever and you pay for pastes nobody can open."
        : "A full-table scan touches every row to find a few: it hogs the database for hours every night. Index expires_at and delete in small batches.",
  },
];

const abuseChecks = ({ knobs }: CustomCheckContext) => [
  {
    label: "Real visitors are never rate-limited",
    ok: knobs.limitBy === "ip",
    message:
      knobs.limitBy === "key"
        ? "Anonymous visitors have no API key, so there's nothing to count them against: they'd all share one bucket or be refused."
        : "A shared budget is gone in a second once a bot starts: real visitors get 429s. Count requests per client IP instead.",
  },
  {
    label: "Oversized pastes are rejected up front",
    ok: knobs.sizeCap === "512k",
    message: "Without a size limit one bot can fill storage with 2 GB uploads in minutes, and you pay for every byte. Cap each paste.",
  },
];

// ---------------------------------------------------------------- Steps

export const DESIGN = {
  launch: {
    scenario: { ...EMPTY, label: "Launch week" },
    flows: [create(60), read(600)],
    constraints: [ok(0.999), { type: "p99", maxMs: 250 }, { type: "budget", maxUsd: 500 }],
  },
  viral: {
    scenario: { ...EMPTY, label: "Front page of a tech site" },
    flows: [create(100), read(45_000)],
    nodeDefaults: { cdn: { hitRate: 0.95 } },
    constraints: [ok(0.999), { type: "p99", maxMs: 250 }, { type: "budget", maxUsd: 1_200 }],
  },
  expiry: {
    scenario: { ...EMPTY, label: "Pastes start expiring" },
    flows: [create(100), read(45_000), sweep(400)],
    nodeDefaults: { cdn: { hitRate: 0.95 } },
    customKnobs: [cdnTtl, expiry],
    customChecks: (ctx) => [...cdnCheck(ctx), ...expiryCheck(ctx)],
    customCheckLabels: ["Expired and deleted pastes stop being served", "Expired pastes are really deleted, without hurting reads"],
    constraints: [ok(0.999), { type: "flowSuccess", flow: "sweep", min: 0.99, label: "99% of expiry deletes run" }, { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 30 }, { type: "p99", maxMs: 250 }, { type: "budget", maxUsd: 1_800 }],
  },
  abuse: {
    scenario: { ...EMPTY, label: "A spam bot arrives" },
    flows: [create(100), read(45_000), sweep(400), spam(20_000)],
    nodeDefaults: { cdn: { hitRate: 0.95 } },
    customKnobs: [cdnTtl, expiry, sizeCap, limitBy],
    customChecks: (ctx) => [...cdnCheck(ctx), ...expiryCheck(ctx), ...abuseChecks(ctx)],
    customCheckLabels: [
      "Expired and deleted pastes stop being served",
      "Expired pastes are really deleted, without hurting reads",
      "Real visitors are never rate-limited",
      "Oversized pastes are rejected up front",
    ],
    constraints: [ok(0.999), { type: "asyncOnTime", min: 0.95 }, { type: "p99", maxMs: 250 }, { type: "budget", maxUsd: 2_000 }],
  },
  server: {
    scenario: { ...EMPTY, label: "A server dies" },
    flows: [create(100), read(45_000), sweep(400), spam(20_000)],
    nodeDefaults: { cdn: { hitRate: 0.95 } },
    customKnobs: [cdnTtl, expiry, sizeCap, limitBy],
    customChecks: (ctx) => [...cdnCheck(ctx), ...expiryCheck(ctx), ...abuseChecks(ctx)],
    customCheckLabels: [
      "Expired and deleted pastes stop being served",
      "Expired pastes are really deleted, without hurting reads",
      "Real visitors are never rate-limited",
      "Oversized pastes are rejected up front",
    ],
    incident: { type: "down", kind: "server", label: "An API server dies" } satisfies FlowIncident,
    incidentText: "Five seconds in, one API server's disk fails and the machine stops answering.",
    constraints: [{ type: "recovery", maxSeconds: 5 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 2_200 }],
  },
} satisfies Record<string, StepData>;

export type StepId = keyof typeof DESIGN;

// ---------------------------------------------------------------- Reference designs (used by tests)

type N = LabNode["kind"];
type Shape = {
  cdn?: boolean;
  limiter?: boolean;
  lb?: boolean;
  servers?: number;
  size?: LabNode["size"];
  storage?: boolean;
  queue?: boolean;
  workers?: number;
  cache?: boolean;
  replicas?: number;
};

/** users → (cdn | limiter) → lb → servers → db + storage; servers → queue → workers → db + storage. */
export function buildGraph(s: Shape = {}): LabGraph {
  const nodes: LabNode[] = [{ id: "users", kind: "client", x: 0, y: 0 }];
  const edges: LabGraph["edges"] = [];
  const add = (id: string, kind: N, extra: Partial<LabNode> = {}) => nodes.push({ id, kind, x: 0, y: 0, ...extra });
  const wire = (from: string, to: string) => edges.push({ id: `${from}>${to}`, from, to });
  const servers = s.servers ?? 1;
  const entry = s.lb ? "lb" : "srv0";
  if (s.lb) add("lb", "lb");
  if (s.cdn) {
    add("cdn", "cdn");
    wire("users", "cdn");
    wire("cdn", entry);
  }
  if (s.limiter) {
    add("limiter", "limiter");
    wire("users", "limiter");
    wire("limiter", entry);
  }
  if (!s.cdn && !s.limiter) wire("users", entry);
  add("db", "db", { role: "primary" });
  for (let i = 0; i < (s.replicas ?? 0); i++) add(`replica-${i}`, "db", { role: "replica" });
  if (s.storage !== false) add("storage", "storage");
  if (s.cache) add("redis", "cache");
  if (s.queue) add("queue", "queue");
  for (let i = 0; i < servers; i++) {
    const id = `srv${i}`;
    add(id, "server", { size: s.size ?? "s" });
    if (s.lb) wire("lb", id);
    wire(id, "db");
    for (let r = 0; r < (s.replicas ?? 0); r++) wire(id, `replica-${r}`);
    if (s.storage !== false) wire(id, "storage");
    if (s.cache) wire(id, "redis");
    if (s.queue) wire(id, "queue");
  }
  for (let i = 0; i < (s.workers ?? 0); i++) {
    add(`w${i}`, "worker");
    wire("queue", `w${i}`);
    wire(`w${i}`, "db");
    wire(`w${i}`, "storage");
  }
  return { nodes, edges };
}

export type Design = { graph: LabGraph; configs: LabConfigs };

export function configs(custom: Record<string, string> = {}, healthChecks = false): LabConfigs {
  const c = structuredClone(DEFAULT_CONFIGS);
  return { ...c, custom, resilience: { ...c.resilience, healthChecks } };
}

type Case = { pass: Design; fail: { why: string; design: Design; failing: string[] }[] };

const GOOD_KNOBS = { cdnTtl: "match", expiry: "index", sizeCap: "512k", limitBy: "ip" };
const edge = { cdn: true, limiter: true, lb: true, size: "m" as const };

export const REFERENCE: Record<StepId, Case> = {
  launch: {
    pass: { graph: buildGraph(), configs: configs() },
    fail: [
      { why: "no object storage: the text has nowhere to live", design: { graph: buildGraph({ storage: false }), configs: configs() }, failing: ["successRate"] },
      { why: "a bigger fleet is over budget", design: { graph: buildGraph({ lb: true, servers: 3, size: "m" }), configs: configs() }, failing: ["budget"] },
    ],
  },
  viral: {
    pass: { graph: buildGraph({ cdn: true, lb: true, servers: 2, size: "m" }), configs: configs() },
    fail: [
      { why: "no CDN: the database and storage melt", design: { graph: buildGraph({ lb: true, servers: 4, size: "m" }), configs: configs() }, failing: ["successRate"] },
      { why: "Redis alone can't save storage", design: { graph: buildGraph({ lb: true, servers: 4, size: "m", cache: true }), configs: configs() }, failing: ["successRate"] },
    ],
  },
  expiry: {
    pass: { graph: buildGraph({ cdn: true, lb: true, servers: 2, size: "m", queue: true, workers: 6 }), configs: configs({ cdnTtl: "match", expiry: "index" }) },
    fail: [
      { why: "no queue and workers for the sweep", design: { graph: buildGraph({ cdn: true, lb: true, servers: 2, size: "m" }), configs: configs({ cdnTtl: "match", expiry: "index" }) }, failing: ["flowSuccess"] },
      { why: "too few workers: the sweep lags", design: { graph: buildGraph({ cdn: true, lb: true, servers: 2, size: "m", queue: true, workers: 2 }), configs: configs({ cdnTtl: "match", expiry: "index" }) }, failing: ["asyncOnTime", "maxQueueLag"] },
      { why: "full scan and a forever edge cache", design: { graph: buildGraph({ cdn: true, lb: true, servers: 2, size: "m", queue: true, workers: 6 }), configs: configs({ cdnTtl: "forever", expiry: "scan" }) }, failing: ["custom"] },
    ],
  },
  abuse: {
    pass: { graph: buildGraph({ ...edge, servers: 2, queue: true, workers: 6 }), configs: configs(GOOD_KNOBS) },
    fail: [
      { why: "no limiter: bots overwhelm the database", design: { graph: buildGraph({ cdn: true, lb: true, servers: 2, size: "m", queue: true, workers: 6 }), configs: configs(GOOD_KNOBS) }, failing: ["successRate"] },
      { why: "a shared limit and no size cap", design: { graph: buildGraph({ ...edge, servers: 2, queue: true, workers: 6 }), configs: configs({ ...GOOD_KNOBS, limitBy: "global", sizeCap: "none" }) }, failing: ["custom"] },
    ],
  },
  server: {
    pass: { graph: buildGraph({ ...edge, servers: 3, queue: true, workers: 6 }), configs: configs(GOOD_KNOBS, true) },
    fail: [
      { why: "no health checks: the balancer keeps sending to the corpse", design: { graph: buildGraph({ ...edge, servers: 3, queue: true, workers: 6 }), configs: configs(GOOD_KNOBS, false) }, failing: ["recovery"] },
      { why: "health checks but no spare server", design: { graph: buildGraph({ ...edge, servers: 1, queue: true, workers: 6 }), configs: configs(GOOD_KNOBS, true) }, failing: ["recovery"] },
    ],
  },
};
