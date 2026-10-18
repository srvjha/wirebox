/**
 * Flow engine: describe a product's traffic as data, let the learner's graph decide how it fares.
 *
 * A lab's design step declares flows (who sends what, through which kinds of components),
 * optional lab-defined knobs (design choices that change engine numbers), and optional custom
 * checks (correctness the throughput model can't see). No per-lab UI is needed.
 *
 * ```ts
 * const step: DesignStep = {
 *   // ...title, story, palette, knobs, hints, concepts, debrief as usual...
 *   scenario: { label: "On-sale", load: { reads: 0, writes: 0, attack: 0 } }, // unused for flow steps
 *
 *   flows: [
 *     {
 *       id: "browse", label: "Browse events", rps: 4_000,
 *       route: [
 *         { kind: "cdn", optional: true, cacheable: 0.8 },   // a CDN (if wired) answers 80% x its hit rate
 *         { kind: "lb", optional: true },                    // optional hops are skipped when not wired
 *         { kind: "server" },
 *         { kind: "cache", optional: true, cacheable: 0.9 }, // beside the server; misses go on to the db
 *         { kind: "db" },
 *       ],
 *     },
 *     {
 *       id: "book", label: "Book a seat", rps: 600, write: true,
 *       route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }],
 *     },
 *     {
 *       id: "sms", label: "Send ticket by SMS", rps: 600, slaSeconds: 30, workMs: 300,
 *       route: [
 *         { kind: "server" },
 *         { kind: "queue" },   // everything after a queue is asynchronous
 *         { kind: "worker" },
 *         { kind: "external", missing: "Texts go out through an SMS provider: wire the workers to it." },
 *       ],
 *     },
 *   ],
 *   nodeDefaults: { external: { cap: 1_500 }, cdn: { hitRate: 0.95 } },
 *
 *   // A knob shows up as a select in the inspector (on `appliesTo` nodes) or in the design panel.
 *   // The selected option's `values` feed the engine: skew (hot-shard share), hitRate, retries
 *   // (share of failures retried next second; "backoff" = 0.1, default 0.5), attackPass.
 *   customKnobs: [
 *     {
 *       id: "shardKey", label: "Shard by", help: "How rows are spread over shards.", default: "seat",
 *       appliesTo: "db",
 *       options: [
 *         { v: "event", label: "event id", desc: "One hot event lives on one shard.", values: { skew: 0.9 } },
 *         { v: "seat", label: "seat id", desc: "Spreads a single event evenly.", values: { skew: 0.0 } },
 *       ],
 *     },
 *     {
 *       id: "idempotency", label: "Duplicate taps", help: "What a double-submitted payment does.", default: "none",
 *       options: [
 *         { v: "none", label: "Charge twice", desc: "A retry is a new payment." },
 *         { v: "key", label: "Idempotency key", desc: "A retry returns the first result." },
 *       ],
 *     },
 *   ],
 *   customChecks: ({ knobs, graph, result }) => [
 *     { label: "A double tap never charges twice", ok: knobs.idempotency === "key",
 *       message: "Retries are new payments. Send an idempotency key with every charge." },
 *   ],
 *   customCheckLabels: ["A double tap never charges twice"],
 *
 *   constraints: [
 *     { type: "successRate", min: 0.99 },
 *     { type: "flowSuccess", flow: "book", min: 0.995 },
 *     { type: "asyncOnTime", min: 0.95 },
 *     { type: "maxQueueLag", seconds: 20 },
 *   ],
 *   incident: { type: "spike", multiplier: 20, flows: ["browse", "book"], seconds: 10 },
 *   incidentText: "Tickets go on sale: traffic jumps twentyfold for ten seconds.",
 * };
 * ```
 *
 * Route rules:
 * - Hops are walked in order from Users. `lb`, `limiter` and `cdn` are transparent: they carry
 *   traffic when wired and need no hop. Optional hops that aren't wired are skipped; a required hop
 *   that can't be reached fails the flow with an issue (override the text with `hop.missing`).
 * - Terminal kinds (cache, db, storage, external, search) are called by the node before them, so a
 *   route `[server, db, storage]` means the server calls both.
 * - `cacheable` on a hop: the share a cache or cdn standing in front of it can answer, times the
 *   node's hit rate (default 0.9; node setting > knob `hitRate` > nodeDefaults).
 * - After a `queue` the rest of the route is async: sync success means "reached the queue", and
 *   `asyncOnTime` is the share of jobs finished within `slaSeconds` (default 60).
 * - `fanout` multiplies ws and pubsub load. With more than one ws gateway and no pubsub wired
 *   between them, only 1/gateways of the deliveries reach their users. Put
 *   `{ kind: "pubsub", optional: true }` in the route so its capacity is counted.
 */
import { p99Of, type EvalResult, type NodeStat, type SimEdge, type SimNode } from "./evaluate";
import {
  ALLOWED_TARGETS,
  DB_WRITE_CAP,
  DB_WRITE_MS,
  HOT_UTIL,
  SPECS,
  TIMEOUT_MS,
  WORKER_THREADS,
  WS_CONN_CAP,
  monthlyCost,
  nodeCap,
  shardsOf,
  type Kind,
} from "./spec";

export type Hop = {
  kind: Kind;
  /** Skipped when the learner hasn't wired it. */
  optional?: boolean;
  /** 0..1 share of this hop's traffic a cache/cdn in front of it can absorb. */
  cacheable?: number;
  /** Issue text when this required hop can't be reached. */
  missing?: string;
};

export type Flow = {
  id: string;
  label: string;
  /** Requests (or messages) per second. */
  rps: number;
  /** false = abusive traffic: a limiter drops most of it and it doesn't count toward success. */
  legit?: boolean;
  route: Hop[];
  /** Database hops count as writes. */
  write?: boolean;
  /** Each message is delivered to N connections. */
  fanout?: number;
  /** Concurrent connections this flow holds on ws gateways. */
  connections?: number;
  /** Worker time per job in ms (default 16: 500 jobs/s per node). */
  workMs?: number;
  /** Async jobs must finish within this many seconds (default 60). */
  slaSeconds?: number;
};

export type CustomKnobOption = {
  v: string;
  label: string;
  desc: string;
  /** Numbers the engine reads: skew, hitRate, retries, attackPass. */
  values?: Record<string, number>;
};

export type CustomKnob = {
  id: string;
  label: string;
  help: string;
  options: CustomKnobOption[];
  default: string;
  /** Show in the inspector of nodes of this kind; otherwise in the design panel. */
  appliesTo?: Kind;
};

export type CustomCheckResult = { label: string; ok: boolean; message?: string };

/** Selected knob options: raw choices for labs, merged numeric values for the engine. */
export type FlowKnobs = { choices: Record<string, string>; values: Record<string, number> };

export type NodeConfig = Partial<Record<Kind, Record<string, number>>>;

export type FlowIncident =
  | { type: "down"; kind: Kind; label?: string }
  | {
      type: "spike";
      /** Multiplies the flows' rps. */
      multiplier: number;
      /** Flow ids; all flows when omitted. */
      flows?: string[];
      /** How long the spike lasts; the rest of the run when omitted. */
      seconds?: number;
      label?: string;
    }
  | { type: "slow"; kind: "external"; ms: number; failRate: number; label?: string };

export type SlowExternal = { ms: number; failRate: number };

export type FlowEvalInput = {
  nodes: SimNode[];
  edges: SimEdge[];
  flows: Flow[];
  nodeConfig?: NodeConfig;
  knobs?: FlowKnobs;
  /** Nodes that are dead right now. */
  down?: string[];
  /** Dead nodes a load balancer with health checks hasn't noticed yet. */
  undetected?: string[];
  healthChecks?: boolean;
  slow?: SlowExternal | null;
  /** Jobs waiting at each worker at the start of this second. Omit for a steady-state estimate. */
  backlog?: Record<string, number>;
  dbLabel?: string;
};

export type FlowStat = {
  id: string;
  label: string;
  legit: boolean;
  offered: number;
  /** Requests that completed their synchronous part, per second. */
  served: number;
  /** served / offered. */
  success: number;
  p99: number;
  /** Share of offered messages that reached every recipient (= success without a fanout). */
  delivered: number;
  fanout: boolean;
  /** Share of offered jobs finished within the SLA; null for flows without a queue. */
  asyncOnTime: number | null;
};

export type FlowResult = EvalResult & {
  flows: FlowStat[];
  /** Longest wait in any queue, in seconds. */
  queueLagSeconds: number;
  /** Jobs waiting after this second, per worker id. */
  backlog: Record<string, number>;
  /** Worst delivered share over legit flows with a fanout (1 if none). */
  delivered: number;
  /** Worst on-time share over legit flows with a queue (1 if none). */
  asyncOnTime: number;
};

export const FLOW_SECONDS = 30;
const NETWORK_HOP_MS = 0.5;
const TRANSPARENT = new Set<Kind>(["lb", "limiter", "cdn"]);
const DEFAULT_HIT = 0.9;
const DEFAULT_WORK_MS = (1000 * WORKER_THREADS) / SPECS.worker.cap;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Pick the selected option of every knob (defaults filled in) and merge their numeric values. */
export function resolveKnobs(defs: CustomKnob[] | undefined, selected: Record<string, string> | undefined): FlowKnobs {
  const out: FlowKnobs = { choices: {}, values: {} };
  for (const k of defs ?? []) {
    const wanted = selected?.[k.id];
    const opt = k.options.find((o) => o.v === wanted) ?? k.options.find((o) => o.v === k.default) ?? k.options[0];
    if (!opt) continue;
    out.choices[k.id] = opt.v;
    Object.assign(out.values, opt.values);
  }
  return out;
}

/** Share of failed requests clients retry the next second. */
export function retryShare(k: FlowKnobs | undefined, fallback = 0.5) {
  return k?.values.retries ?? (k?.choices.retries === "backoff" ? 0.1 : fallback);
}

type Acc = {
  served: number;
  asyncOffered: number;
  asyncDone: number;
  asyncOnTime: number;
  hasQueue: boolean;
  gateways: Set<string>;
  paths: { ids: string[]; rps: number }[];
};

type Pass = {
  load: Map<string, number>;
  reads: Map<string, number>;
  writes: Map<string, number>;
  conns: Map<string, number>;
  jobs: Map<string, number>;
  thread: Map<string, number>;
  edge: Record<string, number>;
  acc: Acc[];
  missing: Map<string, { flow: number; hop: number; from: SimNode }>;
};

type WorkerInfo = { arr: number; cap: number; over: number; backlog: number; next: number };
type Settled = { ok: Map<string, number>; workers: Map<string, WorkerInfo> };

const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

export function evaluateFlows(input: FlowEvalInput): FlowResult {
  const { nodes, edges, flows } = input;
  const cfg = input.nodeConfig ?? {};
  const kv = input.knobs ?? { choices: {}, values: {} };
  const dbLabel = input.dbLabel ?? "Postgres";
  const down = new Set(input.down ?? []);
  const undetected = new Set(input.undetected ?? []);
  const slow = input.slow ?? null;
  const steady = input.backlog === undefined;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const issues: string[] = [];
  const label = (k: Kind) => (k === "db" ? dbLabel : SPECS[k].label);

  const backoff = retryShare(kv) <= 0.2;
  const fail = slow?.failRate ?? 0;
  const attemptsMult = 1 + fail * (backoff ? 1 : 3);
  const asyncExtSuccess = backoff ? 1 - fail ** 4 : 1 - fail;
  const attackPass = kv.values.attackPass ?? 0.05;

  const outsOf = new Map<string, SimNode[]>();
  for (const n of nodes) {
    const list: SimNode[] = [];
    for (const e of edges) {
      if (e.from !== n.id) continue;
      const to = byId.get(e.to);
      if (!to) continue;
      if (ALLOWED_TARGETS[n.kind].includes(to.kind)) list.push(to);
      else issues.push(`${label(n.kind)} can't send requests to ${label(to.kind)}. That wire is ignored.`);
    }
    outsOf.set(n.id, list);
  }

  const capOf = (n: SimNode) => cfg[n.kind]?.cap ?? nodeCap(n);
  const hitRateOf = (n: SimNode) => n.hitRate ?? kv.values.hitRate ?? cfg[n.kind]?.hitRate ?? DEFAULT_HIT;
  const terminal = (k: Kind) => ALLOWED_TARGETS[k].length === 0;
  const pubsubWired =
    nodes.some((n) => n.kind === "pubsub" && !down.has(n.id)) &&
    edges.some((e) => byId.get(e.from)?.kind === "ws" && byId.get(e.to)?.kind === "pubsub") &&
    edges.some((e) => byId.get(e.from)?.kind === "pubsub" && byId.get(e.to)?.kind === "ws");

  const routeHasAsyncExternal = (f: Flow) => {
    const w = f.route.findIndex((h) => h.kind === "worker");
    return w >= 0 && f.route.findIndex((h, i) => i > w && h.kind === "external") > w;
  };
  const threadMs = (f: Flow) =>
    ((f.workMs ?? DEFAULT_WORK_MS) + (slow && routeHasAsyncExternal(f) ? slow.ms : 0)) *
    (slow && routeHasAsyncExternal(f) ? attemptsMult : 1);

  const onTimeShare = (S: Settled, id: string, sla: number) => {
    const w = S.workers.get(id);
    if (!w) return 1;
    if (w.cap <= 0) return w.arr > 0 ? 0 : 1;
    if (steady) return w.over > 0 ? Math.min(1, (sla * w.cap) / (w.over * FLOW_SECONDS)) : 1;
    return clamp01(1 + sla - (w.backlog + w.over) / w.cap);
  };

  const pick = (n: SimNode, h: number, flow: Flow): { targets: SimNode[]; j: number } | { fail: number } | "done" => {
    const outs = outsOf.get(n.id) ?? [];
    for (let j = h; j < flow.route.length; j++) {
      const hop = flow.route[j];
      const direct = outs.filter((o) => o.kind === hop.kind);
      if (direct.length) return { targets: direct, j };
      if (hop.optional) continue;
      const pass = outs.filter((o) => TRANSPARENT.has(o.kind));
      if (pass.length) return { targets: pass, j };
      return { fail: j };
    }
    return "done";
  };

  const run = (S: Settled): Pass => {
    const P: Pass = {
      load: new Map(),
      reads: new Map(),
      writes: new Map(),
      conns: new Map(),
      jobs: new Map(),
      thread: new Map(),
      edge: {},
      acc: flows.map(() => ({
        served: 0,
        asyncOffered: 0,
        asyncDone: 0,
        asyncOnTime: 0,
        hasQueue: false,
        gateways: new Set(),
        paths: [],
      })),
      missing: new Map(),
    };

    type Ctx = { fi: number; async: boolean; ot: number; w: number; path: string[] };

    const complete = (rps: number, c: Ctx) => {
      const acc = P.acc[c.fi];
      if (c.async) {
        acc.asyncDone += rps;
        acc.asyncOnTime += rps * c.ot;
      } else {
        acc.served += rps;
        acc.paths.push({ ids: c.path, rps });
      }
    };

    const depart = (n: SimNode, h: number, rps: number, c: Ctx) => {
      if (rps < 1e-9) return;
      const flow = flows[c.fi];
      const sel = pick(n, h, flow);
      if (sel === "done") return complete(rps, c);
      if ("fail" in sel) {
        P.missing.set(`${c.fi}:${sel.fail}`, { flow: c.fi, hop: sel.fail, from: n });
        return;
      }
      let targets = sel.targets;
      if (n.kind === "lb" && input.healthChecks) targets = targets.filter((t) => !down.has(t.id) || undetected.has(t.id));
      if (flow.write && flow.route[sel.j].kind === "db") {
        const primaries = targets.filter((t) => (t.role ?? "primary") === "primary");
        if (primaries.length) targets = primaries;
      }
      if (!targets.length) return;
      for (const t of targets) go(t, n, sel.j, rps / targets.length, { ...c, w: c.w / targets.length });
    };

    const go = (n: SimNode, from: SimNode, h: number, rps: number, c: Ctx) => {
      if (rps < 1e-9) return;
      const flow = flows[c.fi];
      const hop = flow.route[h];
      const isHop = !!hop && hop.kind === n.kind;
      const nh = isHop ? h + 1 : h;
      const mult = n.kind === "ws" || n.kind === "pubsub" ? (flow.fanout ?? 1) : 1;
      const path = [...c.path, n.id];
      const key = `${from.id}>${n.id}`;
      P.edge[key] = (P.edge[key] ?? 0) + rps;

      bump(P.load, n.id, rps * mult * (n.kind === "external" && c.async ? attemptsMult : 1));
      if (n.kind === "db") bump(flow.write ? P.writes : P.reads, n.id, rps);
      if (n.kind === "ws") {
        P.acc[c.fi].gateways.add(n.id);
        if (flow.connections && !c.async) bump(P.conns, n.id, flow.connections * c.w);
      }
      if (n.kind === "worker") {
        bump(P.jobs, n.id, rps);
        bump(P.thread, n.id, (rps * threadMs(flow)) / 1000);
      }

      const isDown = down.has(n.id);
      const bypass = isDown && (n.kind === "cache" || n.kind === "cdn");
      if (isDown && !bypass) return;

      let out = bypass ? rps : rps * (S.ok.get(n.id) ?? 1);
      let ot = c.ot;
      if (n.kind === "limiter" && flow.legit === false) out *= attackPass;
      if (n.kind === "external") {
        if (slow && slow.ms >= TIMEOUT_MS) out = 0;
        else out *= c.async ? asyncExtSuccess : 1 - fail;
      }
      if (n.kind === "worker") ot *= onTimeShare(S, n.id, flow.slaSeconds ?? 60);

      // Cache / CDN: answer the cacheable share and let the rest through.
      let cacheable = 0;
      if (isHop && (n.kind === "cdn" || n.kind === "cache")) cacheable = hop.cacheable ?? 1;
      else if (n.kind === "cdn") {
        cacheable = flow.route.slice(h).find((x) => x.cacheable !== undefined && x.kind !== "cdn" && x.kind !== "cache")?.cacheable ?? 0;
      }
      let next: Ctx = { ...c, ot, path };
      if (cacheable > 0 && !bypass) {
        const hit = out * cacheable * hitRateOf(n);
        complete(hit, next);
        out -= hit;
      }

      if (n.kind === "queue" && isHop) {
        const acc = P.acc[c.fi];
        acc.hasQueue = true;
        if (!c.async) {
          acc.served += out;
          acc.paths.push({ ids: path, rps: out });
        }
        acc.asyncOffered += out;
        next = { ...next, async: true };
      }

      // Terminal kinds are called by the node before them; the route carries on from there.
      if (isHop && terminal(n.kind)) return depart(from, nh, out, next);
      depart(n, nh, out, next);
    };

    flows.forEach((flow, fi) => {
      const client = nodes.find((n) => n.kind === "client");
      if (!client || flow.rps <= 0) return;
      depart(client, 0, flow.rps, { fi, async: false, ot: 1, w: 1, path: [client.id] });
    });
    return P;
  };

  const settle = (P: Pass): Settled => {
    const S: Settled = { ok: new Map(), workers: new Map() };
    for (const n of nodes) {
      if (n.kind === "client") {
        S.ok.set(n.id, 1);
        continue;
      }
      const dead = down.has(n.id);
      const load = P.load.get(n.id) ?? 0;
      let ok: number;
      if (n.kind === "db") {
        const shards = shardsOf(n);
        const hot = Math.max(1 / shards, Math.min(1, kv.values.skew ?? 1 / shards));
        const u1 = (P.reads.get(n.id) ?? 0) / SPECS.db.cap + (P.writes.get(n.id) ?? 0) / DB_WRITE_CAP;
        const hotU = u1 * hot;
        const coldU = shards > 1 ? (u1 * (1 - hot)) / (shards - 1) : 0;
        const f = (u: number) => (u > 1 ? 1 / u : 1);
        ok = hot * f(hotU) + (1 - hot) * f(coldU);
      } else if (n.kind === "ws") {
        const u = Math.max(load / capOf(n), (P.conns.get(n.id) ?? 0) / WS_CONN_CAP);
        ok = u > 1 ? 1 / u : 1;
      } else if (n.kind === "worker") {
        const jobs = P.jobs.get(n.id) ?? 0;
        const thread = P.thread.get(n.id) ?? 0;
        const cap = dead ? 0 : thread > 0 ? (jobs * WORKER_THREADS) / thread : SPECS.worker.cap;
        const backlog = input.backlog?.[n.id] ?? 0;
        const over = Math.max(0, jobs - cap);
        const processed = steady ? Math.min(cap, jobs) : Math.min(cap, jobs + backlog);
        S.workers.set(n.id, { arr: jobs, cap, over, backlog, next: steady ? over * FLOW_SECONDS : Math.max(0, backlog + jobs - cap) });
        ok = jobs > 0 ? processed / jobs : 1;
      } else {
        const cap = capOf(n);
        ok = load > cap ? cap / load : 1;
      }
      S.ok.set(n.id, dead ? 0 : ok);
    }
    return S;
  };

  // The graph is feed-forward, so each pass fixes one more tier of capacity limits.
  let S: Settled = { ok: new Map(nodes.map((n) => [n.id, down.has(n.id) ? 0 : 1])), workers: new Map() };
  let P = run(S);
  for (let i = 0; i < 9; i++) {
    S = settle(P);
    P = run(S);
  }
  S = settle(P);

  // ---- Per-node stats ----
  const stats: Record<string, NodeStat> = {};
  const svcMs = (n: SimNode) => (n.kind === "external" && slow ? SPECS.external.serviceMs + slow.ms : SPECS[n.kind].serviceMs);
  const backlogOut: Record<string, number> = {};
  for (const n of nodes) {
    const dead = down.has(n.id);
    const load = P.load.get(n.id) ?? 0;
    const st: NodeStat = { load, cap: capOf(n), util: 0, down: dead };
    if (n.kind === "db") {
      const shards = shardsOf(n);
      const reads = P.reads.get(n.id) ?? 0;
      const writes = P.writes.get(n.id) ?? 0;
      const hot = Math.max(1 / shards, Math.min(1, kv.values.skew ?? 1 / shards));
      st.reads = reads;
      st.writes = writes;
      st.load = reads + writes;
      st.shards = shards;
      st.hotUtil = (reads / SPECS.db.cap + writes / DB_WRITE_CAP) * hot;
      st.util = st.hotUtil;
      const ms = (SPECS.db.serviceMs * reads + DB_WRITE_MS * writes) / Math.max(1, reads + writes);
      st.p99 = p99Of(ms, st.util);
    } else if (n.kind === "ws") {
      st.conns = P.conns.get(n.id) ?? 0;
      st.connCap = WS_CONN_CAP;
      st.util = Math.max(load / st.cap, st.conns / WS_CONN_CAP);
      st.p99 = p99Of(SPECS.ws.serviceMs, st.util);
    } else if (n.kind === "worker") {
      const w = S.workers.get(n.id);
      st.load = w?.arr ?? 0;
      st.cap = w && w.arr > 0 ? w.cap : SPECS.worker.cap;
      st.util = dead ? 1 : w && w.arr > 0 ? w.arr / Math.max(1e-9, w.cap) : 0;
      st.backlog = w?.next ?? 0;
      backlogOut[n.id] = steady ? 0 : (w?.next ?? 0);
    } else if (n.kind !== "client") {
      st.util = load / st.cap;
      st.p99 = p99Of(svcMs(n), st.util);
    }
    stats[n.id] = st;
  }
  for (const n of nodes) {
    if (n.kind !== "queue") continue;
    stats[n.id].backlog = (outsOf.get(n.id) ?? []).filter((o) => o.kind === "worker").reduce((s, o) => s + (stats[o.id].backlog ?? 0), 0);
  }

  // ---- Issues from saturation ----
  const seen = new Set<string>();
  const once = (msg: string) => {
    if (!seen.has(msg)) {
      seen.add(msg);
      issues.push(msg);
    }
  };
  for (const n of nodes) {
    const st = stats[n.id];
    if (n.kind === "client" || st.down) continue;
    const u = st.util;
    const nm = label(n.kind);
    if (n.kind === "worker") {
      if (u >= 1) once(`Workers are at ${pct(u)}: jobs arrive faster than they finish, so the queue grows every second. Add workers.`);
      continue;
    }
    if (n.kind === "db" && u >= HOT_UTIL) {
      const shards = st.shards ?? 1;
      const hot = Math.max(1 / shards, Math.min(1, kv.values.skew ?? 1 / shards));
      if (shards > 1 && hot > (1 / shards) * 1.5) {
        once(
          `One ${nm} shard takes ${pct(hot)} of the traffic and sits at ${pct(u)} while the others idle. More shards won't fix a hot key: change how rows are spread.`,
        );
      } else {
        once(
          u >= 1
            ? `${nm} is at ${pct(u)}. One node handles ${fmt(SPECS.db.cap)} reads/s or ${fmt(DB_WRITE_CAP)} writes/s${shards > 1 ? " per shard" : ""}.`
            : `${nm} is at ${pct(u)}. Past ~${pct(HOT_UTIL)}, queries queue and latency climbs.`,
        );
      }
      continue;
    }
    if (n.kind === "ws" && u >= HOT_UTIL) {
      const byConns = (st.conns ?? 0) / WS_CONN_CAP >= st.load / st.cap;
      once(
        byConns
          ? `A WebSocket gateway holds ${fmt(st.conns ?? 0)} connections (${pct(u)} of its ${fmt(WS_CONN_CAP)}). Add gateways to hold more users.`
          : `A WebSocket gateway is pushing ${fmt(st.load)} messages a second (${pct(u)} of its ${fmt(st.cap)}). Add gateways to share the fan-out.`,
      );
      continue;
    }
    if (n.kind === "external" && u >= 1) {
      once(`The third-party API allows ${fmt(st.cap)} calls a second and is getting ${fmt(st.load)}. Queue the work and drain it at the provider's pace.`);
      continue;
    }
    if (u >= 1) once(`${nm === "API server" ? "An API server" : nm} is at ${pct(u)} of its ${fmt(st.cap)}/s, so ${pct(1 - 1 / u)} of what reaches it is dropped.`);
    else if (u >= HOT_UTIL) once(`${nm === "API server" ? "An API server" : nm} is at ${pct(u)}. Past ~${pct(HOT_UTIL)}, requests queue and tail latency climbs steeply.`);
  }
  for (const m of P.missing.values()) {
    const f = flows[m.flow];
    const hop = f.route[m.hop];
    once(
      hop.missing ??
        `"${f.label}" needs a ${label(hop.kind)}: wire ${m.from.kind === "client" ? "Users" : `the ${label(m.from.kind).toLowerCase()}`} to one.`,
    );
  }

  // ---- Flow results ----
  let anyQueueLag = 0;
  for (const w of S.workers.values()) {
    const lag = w.cap > 0 ? w.next / w.cap : w.arr > 0 || w.next > 0 ? 999 : 0;
    anyQueueLag = Math.max(anyQueueLag, lag);
  }
  if (anyQueueLag > 1) once(`Background jobs are waiting about ${Math.round(anyQueueLag)} s in the queue. The workers can't keep up with what's arriving.`);

  const flowStats: FlowStat[] = flows.map((f, fi) => {
    const acc = P.acc[fi];
    const success = f.rps > 0 ? clamp01(acc.served / f.rps) : 1;
    const gateways = acc.gateways.size;
    const spread = f.fanout && gateways > 1 && !pubsubWired ? 1 / gateways : 1;
    if (f.fanout && gateways > 1 && !pubsubWired && success > 0) {
      once(
        `"${f.label}" runs on ${gateways} gateways with nothing connecting them, so a message only reaches users on its own gateway (${pct(spread)} of recipients). Wire the gateways through a pub/sub broker.`,
      );
    }
    const asyncOnTime = acc.hasQueue ? clamp01(f.rps > 0 ? acc.asyncOnTime / f.rps : 1) : null;
    // Latency: slowest path that carries a real share of this flow.
    let p99 = 0;
    for (const p of acc.paths) {
      if (p.rps < 0.01 * Math.max(1, f.rps)) continue;
      const ms = p.ids.reduce((s, id) => {
        const nd = byId.get(id)!;
        if (nd.kind === "client") return s;
        const st = stats[id];
        const mix = nd.kind === "db" && f.write ? DB_WRITE_MS : svcMs(nd);
        return s + NETWORK_HOP_MS + p99Of(mix, st.util);
      }, NETWORK_HOP_MS);
      p99 = Math.max(p99, ms);
    }
    if (success < 0.99) p99 = TIMEOUT_MS;
    return {
      id: f.id,
      label: f.label,
      legit: f.legit !== false,
      offered: f.rps,
      served: acc.served,
      success,
      p99: Math.min(TIMEOUT_MS, Math.round(p99)),
      delivered: success * spread,
      fanout: !!f.fanout,
      asyncOnTime,
    };
  });

  const legitFlows = flowStats.filter((f) => f.legit);
  const legit = legitFlows.reduce((s, f) => s + f.offered, 0);
  const served = legitFlows.reduce((s, f) => s + Math.min(f.served, f.offered), 0);
  const attack = flowStats.filter((f) => !f.legit).reduce((s, f) => s + f.offered, 0);
  const anyLimiter = nodes.some((n) => n.kind === "limiter");
  const p99 = Math.max(0, ...legitFlows.filter((f) => f.offered >= 0.01 * Math.max(1, legit)).map((f) => f.p99));
  const edgesOut: Record<string, number> = P.edge;

  return {
    legit,
    served,
    stale: 0,
    wrong: 0,
    limitedLegit: 0,
    attack,
    limitedAttack: anyLimiter ? attack * (1 - attackPass) : 0,
    lagMs: 0,
    p99: legit > 0 ? p99 : TIMEOUT_MS,
    cost: monthlyCost(nodes),
    nodes: stats,
    edges: edgesOut,
    issues: [...new Set(issues)],
    flows: flowStats,
    queueLagSeconds: anyQueueLag,
    backlog: backlogOut,
    delivered: Math.min(1, ...legitFlows.filter((f) => f.fanout).map((f) => f.delivered)),
    asyncOnTime: Math.min(1, ...legitFlows.filter((f) => f.asyncOnTime !== null).map((f) => f.asyncOnTime as number)),
  };
}
