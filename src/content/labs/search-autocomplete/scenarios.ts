// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow } from "../../../sim";
import type { CustomCheckContext, DesignStep, LabConfigs, LabGraph, LabNode } from "../../../lib/lab/types";
import { DEFAULT_CONFIGS } from "../../../lib/lab/run";

/**
 * Traffic, knobs, incidents and pass conditions for each canvas step of the search-autocomplete lab.
 * lab.test.ts proves every reference design passes and the tempting wrong ones fail.
 */

type StepData = Pick<
  DesignStep,
  "scenario" | "constraints" | "flows" | "incident" | "incidentText" | "customKnobs" | "customChecks" | "customCheckLabels" | "nodeDefaults"
>;

const EMPTY = { label: "", load: { reads: 0, writes: 0, attack: 0 } };
const ok = (min: number): Constraint => ({ type: "successRate", min });
const fast: Constraint = { type: "p99", maxMs: 50 };

// ---------------------------------------------------------------- Flows

/** One suggestion lookup. The edge, then a cache of finished answers, then the store. */
const suggest = (rps: number): Flow => ({
  id: "suggest",
  label: "Suggestions",
  rps,
  route: [
    { kind: "cdn", optional: true, cacheable: 0.85 },
    { kind: "lb", optional: true },
    { kind: "server" },
    { kind: "cache", optional: true, cacheable: 1 },
    { kind: "db" },
  ],
});

/** What people searched for, folded into the popularity counts. Order doesn't matter, so it's a pipeline. */
const logs = (rps: number): Flow => ({
  id: "logs",
  label: "Search log → counts",
  rps,
  write: true,
  workMs: 5,
  slaSeconds: 120,
  route: [
    { kind: "lb", optional: true },
    { kind: "server" },
    { kind: "queue", missing: "Counting searches is background work: put each log line on a Queue so the typing path never waits for it." },
    { kind: "worker" },
    { kind: "db" },
  ],
});

// ---------------------------------------------------------------- Knobs

const debounce: CustomKnob = {
  id: "debounce",
  label: "Typing in the search box",
  help: "When the browser sends a request while someone types.",
  default: "none",
  options: [
    { v: "none", label: "Every keystroke", desc: "Typing “indie night” sends ten requests, nine of them for words the person has already moved past." },
    { v: "debounce", label: "Wait 150 ms after the last key", desc: "A short pause means they've stopped. Most keystrokes send nothing, and the answers you do send are the ones that are read." },
    { v: "cancel", label: "Debounce + cancel the old request", desc: "As above, and a request still in flight is dropped when a new key arrives, so a slow answer can't overwrite a newer one." },
  ],
};

const index: CustomKnob = {
  id: "index",
  label: "Where completions come from",
  help: "How the top suggestions for a prefix are produced. A prefix nobody has asked about yet is a cache miss.",
  default: "scan",
  options: [
    { v: "scan", label: "Prefix query on the term table", desc: "WHERE term LIKE 'ind%' ORDER BY count DESC LIMIT 10, run on demand. Only prefixes that were asked recently are cached.", values: { hitRate: 0.5 } },
    { v: "search", label: "Search engine query per keystroke", desc: "Great ranking and typo tolerance. ~12 ms mean per query and a cluster you pay for, and still on demand: long prefixes miss the cache.", values: { hitRate: 0.5 } },
    { v: "precomputed", label: "Top 10 precomputed for every prefix", desc: "A job builds the answer for each prefix ahead of time. Serving is one key lookup, and almost nothing is a miss.", values: { hitRate: 0.99 } },
  ],
};

const refresh: CustomKnob = {
  id: "refresh",
  label: "Rebuilding the top 10s",
  help: "How new searches change what is suggested.",
  default: "nightly",
  options: [
    { v: "nightly", label: "Nightly batch", desc: "Recompute everything once a day. Cheap and simple, but yesterday's popularity is today's list." },
    { v: "rolling", label: "Rolling, every few minutes", desc: "The pipeline folds new counts in continuously. Trending terms surface within minutes." },
  ],
};

const edgeTtl: CustomKnob = {
  id: "edgeTtl",
  label: "Edge caching",
  help: "How long the CDN may reuse an answer before asking you again.",
  default: "hour",
  appliesTo: "cdn",
  options: [
    { v: "hour", label: "1 hour", desc: "Highest hit rate. A term that starts trending is invisible for up to an hour.", values: { hitRate: 0.97 } },
    { v: "short", label: "30 seconds", desc: "Short prefixes (“a”, “in”) have the same answer for everyone, so even 30 s absorbs most of the crowd.", values: { hitRate: 0.93 } },
  ],
};

// ---------------------------------------------------------------- Checks

const debounceCheck = ({ knobs }: CustomCheckContext) => [
  {
    label: "Typing doesn't fire a request per keystroke",
    ok: knobs.debounce !== "none",
    message:
      "Your sizing assumes about one request per pause. Without debouncing, a person typing “indie night” sends 10 requests instead of ~3, so the traffic you're building for is 3× larger. Make the browser wait until the typing stops.",
  },
];

const indexCheck = ({ knobs }: CustomCheckContext) => [
  {
    label: "Suggestions don't compute rankings on demand",
    ok: knobs.index === "precomputed",
    message:
      knobs.index === "search"
        ? "A search cluster answers in ~12 ms on average and has a p99 over 50 ms before any queueing, on every keystroke, and it costs $300 per node. Use it for the full search page; precompute the top 10 for typing."
        : "Ranking on demand means every uncached prefix scans and sorts matching terms. The long tail of prefixes misses the cache constantly. Build the answer ahead of time.",
  },
];

const refreshCheck = ({ knobs }: CustomCheckContext) => [
  {
    label: "A newly announced event can be suggested the same day",
    ok: knobs.refresh === "rolling",
    message: "A nightly rebuild means an event announced at noon isn't suggested until tomorrow, exactly when everyone is searching for it. Fold new searches in continuously.",
  },
];

const edgeCheck = ({ knobs, graph }: CustomCheckContext) => [
  {
    label: "Trending terms reach users within a minute",
    ok: !graph.nodes.some((n) => n.kind === "cdn") || knobs.edgeTtl === "short",
    message: "With an hour-long edge cache a term that just started trending can't be suggested for up to an hour. Shorten the edge TTL: short prefixes repeat so often that even 30 seconds absorbs most traffic.",
  },
];

// ---------------------------------------------------------------- Steps

const labelsAll = [
  "Typing doesn't fire a request per keystroke",
  "Suggestions don't compute rankings on demand",
  "A newly announced event can be suggested the same day",
];

export const DESIGN = {
  launch: {
    scenario: { ...EMPTY, label: "Launch week" },
    flows: [suggest(400)],
    constraints: [ok(0.999), fast, { type: "budget", maxUsd: 300 }],
  },
  cache: {
    scenario: { ...EMPTY, label: "Everyone searches at lunch" },
    flows: [suggest(36_000)],
    customKnobs: [debounce],
    customChecks: (ctx) => debounceCheck(ctx),
    customCheckLabels: ["Typing doesn't fire a request per keystroke"],
    constraints: [ok(0.999), fast, { type: "budget", maxUsd: 1_200 }],
  },
  topk: {
    scenario: { ...EMPTY, label: "The catalogue grows" },
    flows: [suggest(60_000)],
    customKnobs: [debounce, index],
    customChecks: (ctx) => [...debounceCheck(ctx), ...indexCheck(ctx)],
    customCheckLabels: labelsAll.slice(0, 2),
    constraints: [ok(0.999), fast, { type: "budget", maxUsd: 1_500 }],
  },
  fresh: {
    scenario: { ...EMPTY, label: "A headliner is announced" },
    flows: [suggest(60_000), logs(2_400)],
    customKnobs: [debounce, index, refresh],
    customChecks: (ctx) => [...debounceCheck(ctx), ...indexCheck(ctx), ...refreshCheck(ctx)],
    customCheckLabels: labelsAll,
    constraints: [ok(0.999), fast, { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 30 }, { type: "budget", maxUsd: 1_700 }],
  },
  spike: {
    scenario: { ...EMPTY, label: "Tickets go on sale" },
    flows: [suggest(60_000), logs(2_400)],
    customKnobs: [debounce, index, refresh, edgeTtl],
    customChecks: (ctx) => [...debounceCheck(ctx), ...indexCheck(ctx), ...refreshCheck(ctx), ...edgeCheck(ctx)],
    customCheckLabels: [...labelsAll, "Trending terms reach users within a minute"],
    incident: { type: "spike", multiplier: 3, flows: ["suggest"], seconds: 10, label: "On-sale rush" },
    incidentText: "A headline show goes on sale. For ten seconds three times as many people type the same three words, over and over.",
    constraints: [{ type: "everySecond", min: 0.99 }, { type: "recovery", maxSeconds: 3 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 1_600 }],
  },
} satisfies Record<string, StepData>;

export type StepId = keyof typeof DESIGN;

// ---------------------------------------------------------------- Reference designs (used by tests)

type Shape = { cdn?: boolean; servers?: number; size?: LabNode["size"]; cache?: boolean; queue?: boolean; workers?: number; search?: boolean };

/** users → (cdn →) lb → servers → cache + db; servers → queue → workers → db. */
export function buildGraph(s: Shape = {}): LabGraph {
  const nodes: LabNode[] = [{ id: "users", kind: "client", x: 0, y: 0 }];
  const edges: LabGraph["edges"] = [];
  const add = (id: string, kind: LabNode["kind"], extra: Partial<LabNode> = {}) => nodes.push({ id, kind, x: 0, y: 0, ...extra });
  const wire = (from: string, to: string) => edges.push({ id: `${from}>${to}`, from, to });
  const servers = s.servers ?? 1;
  const lb = servers > 1;
  let front = "users";
  if (s.cdn) {
    add("cdn", "cdn");
    wire("users", "cdn");
    front = "cdn";
  }
  if (lb) {
    add("lb", "lb");
    wire(front, "lb");
    front = "lb";
  }
  add("db", "db", { role: "primary" });
  if (s.cache) add("redis", "cache");
  if (s.search) add("es", "search");
  if (s.queue) add("queue", "queue");
  for (let i = 0; i < servers; i++) {
    const id = `srv${i}`;
    add(id, "server", { size: s.size ?? "m" });
    wire(front, id);
    wire(id, "db");
    if (s.cache) wire(id, "redis");
    if (s.search) wire(id, "es");
    if (s.queue) wire(id, "queue");
  }
  for (let i = 0; i < (s.workers ?? 0); i++) {
    add(`w${i}`, "worker");
    wire("queue", `w${i}`);
    wire(`w${i}`, "db");
  }
  return { nodes, edges };
}

export type Design = { graph: LabGraph; configs: LabConfigs };

export function configs(custom: Record<string, string> = {}): LabConfigs {
  return { ...structuredClone(DEFAULT_CONFIGS), custom };
}

type Case = { pass: Design; fail: { why: string; design: Design; failing: string[] }[] };

const GOOD = { debounce: "cancel", index: "precomputed", refresh: "rolling", edgeTtl: "short" };

export const REFERENCE: Record<StepId, Case> = {
  launch: {
    pass: { graph: buildGraph({ size: "s" }), configs: configs() },
    fail: [{ why: "a pile of servers is wasted money", design: { graph: buildGraph({ servers: 4, size: "l" }), configs: configs() }, failing: ["budget"] }],
  },
  cache: {
    pass: { graph: buildGraph({ servers: 4, cache: true }), configs: configs({ debounce: "debounce" }) },
    fail: [
      { why: "no cache: the database is at 100%", design: { graph: buildGraph({ servers: 4 }), configs: configs({ debounce: "debounce" }) }, failing: ["successRate"] },
      { why: "a cache but typing on every key", design: { graph: buildGraph({ servers: 4, cache: true }), configs: configs() }, failing: ["custom"] },
    ],
  },
  topk: {
    pass: { graph: buildGraph({ servers: 6, cache: true }), configs: configs({ debounce: "debounce", index: "precomputed" }) },
    fail: [
      { why: "ranking on demand: the long tail misses the cache", design: { graph: buildGraph({ servers: 6, cache: true }), configs: configs({ debounce: "debounce", index: "scan" }) }, failing: ["custom"] },
      { why: "a search cluster on every keystroke", design: { graph: buildGraph({ servers: 6, cache: true, search: true }), configs: configs({ debounce: "debounce", index: "search" }) }, failing: ["custom", "budget"] },
      { why: "on-demand ranking melts the database or the clock", design: { graph: buildGraph({ servers: 6, cache: true }), configs: configs({ debounce: "debounce", index: "scan" }) }, failing: ["p99"] },
    ],
  },
  fresh: {
    pass: { graph: buildGraph({ servers: 6, cache: true, queue: true, workers: 2 }), configs: configs({ debounce: "debounce", index: "precomputed", refresh: "rolling" }) },
    fail: [
      { why: "nightly rebuild", design: { graph: buildGraph({ servers: 6, cache: true, queue: true, workers: 2 }), configs: configs({ debounce: "debounce", index: "precomputed", refresh: "nightly" }) }, failing: ["custom"] },
      { why: "no pipeline for the search log", design: { graph: buildGraph({ servers: 6, cache: true }), configs: configs({ debounce: "debounce", index: "precomputed", refresh: "rolling" }) }, failing: ["successRate"] },
    ],
  },
  spike: {
    pass: { graph: buildGraph({ cdn: true, servers: 4, cache: true, queue: true, workers: 2 }), configs: configs(GOOD) },
    fail: [
      { why: "no edge: three times the people hit the origin", design: { graph: buildGraph({ servers: 4, cache: true, queue: true, workers: 2 }), configs: configs(GOOD) }, failing: ["everySecond"] },
      { why: "a long edge TTL hides trending terms", design: { graph: buildGraph({ cdn: true, servers: 4, cache: true, queue: true, workers: 2 }), configs: configs({ ...GOOD, edgeTtl: "hour" }) }, failing: ["custom"] },
    ],
  },
};
