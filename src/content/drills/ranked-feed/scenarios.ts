// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow, FlowIncident, NodeConfig } from "../../../sim";
import type { CustomCheckContext } from "../../../lib/drill/types";
import type { Spec } from "./graph";

/**
 * Traffic, knobs, checks and pass conditions for each canvas step of the ranked
 * feed drill, plus the reference designs drill.test.ts proves against them.
 */

const lb = { kind: "lb" as const, optional: true };
const server = { kind: "server" as const };
const dbs = (n: number) => Array.from({ length: n }, () => ({ kind: "db" as const, missing: "Ranking reads the vote counts: wire the API server to a database." }));

/** A vote. Redis can absorb most of them (it counts in memory and flushes in batches). */
const vote = (rps: number): Flow => ({
  id: "vote",
  label: "Cast a vote",
  rps,
  write: true,
  route: [lb, server, { kind: "cache", optional: true, cacheable: 0.98 }, { kind: "db", missing: "Votes must end up in a database: wire the API server to one." }],
});
/** Brigading: bots piling votes onto one post. */
const brigade = (rps: number): Flow => ({
  id: "brigade",
  label: "Vote brigade (bots)",
  rps,
  legit: false,
  write: true,
  route: [lb, server, { kind: "cache", optional: true, cacheable: 0.98 }, { kind: "db" }],
});
/** `reads`: database queries when the ranking has to be computed on the spot. */
const ranking = (rps: number, reads: number): Flow => ({
  id: "ranking",
  label: "Open the front page",
  rps,
  route: [lb, server, { kind: "cache", optional: true, cacheable: 0.95 }, ...dbs(reads)],
});
const recompute = (rps: number): Flow => ({
  id: "recompute",
  label: "Recompute the ranking",
  rps,
  workMs: 1_000,
  slaSeconds: 20,
  route: [
    lb,
    server,
    { kind: "queue", missing: "Re-ranking scans every recent post. Run it as a background job behind a queue, not inside a request." },
    { kind: "worker", missing: "Nothing is pulling ranking jobs off the queue: wire the queue to workers." },
    { kind: "db" },
    { kind: "cache" },
  ],
});

const COUNTER: CustomKnob = {
  id: "counter",
  label: "Vote counter layout",
  help: "How a post's vote count is stored in the database.",
  default: "row",
  appliesTo: "db",
  options: [
    { v: "row", label: "One row per post", desc: "UPDATE posts SET votes = votes + 1. A hot post's row gets every write and they queue behind each other.", values: { skew: 0.9 } },
    { v: "sharded", label: "Sharded counter: many rows per post", desc: "Each vote increments one of N rows for that post; reads add them up. Writes spread out.", values: { skew: 0 } },
  ],
};
const LIMIT: CustomKnob = {
  id: "limitBy",
  label: "Limit votes by",
  help: "What the rate limiter counts against.",
  default: "ip",
  options: [
    { v: "ip", label: "IP address", desc: "A botnet spreads over thousands of IPs, so each stays under the limit. A campus behind one IP gets blocked.", values: { attackPass: 0.6 } },
    { v: "account", label: "Account", desc: "Each fake account only gets a few votes a minute. Accounts are cheap to make, though.", values: { attackPass: 0.15 } },
    { v: "account-age", label: "Account + account age + velocity", desc: "New accounts get a tiny allowance, and a burst of fresh accounts voting for one post is held for review.", values: { attackPass: 0.03 } },
  ],
};

type K = Record<string, string>;
const bad = (ok: boolean, label: string, message: string) => ({ label, ok, message });
const jobWired = (ctx: Pick<CustomCheckContext, "graph">) => {
  const ids = (k: string) => ctx.graph.nodes.filter((n) => n.kind === k).map((n) => n.id);
  const workers = ids("worker");
  return workers.length > 0 && ids("queue").length > 0 && ctx.graph.edges.some((e) => workers.includes(e.from) && ids("cache").includes(e.to));
};
const rankCheck = (ctx: CustomCheckContext) =>
  bad(jobWired(ctx), "A background job keeps the ranking fresh", "Nothing recomputes the ranking. Run a queue and workers that read the votes and write the result to Redis.");
const fairCheck = (ctx: CustomCheckContext) =>
  bad((ctx.knobs as K).limitBy !== "ip", "Real voters behind shared IPs aren't blocked", "A per-IP limit that stops a botnet also locks out a whole campus or office behind one address. Count per account instead.");
const chk = (...fns: ((c: CustomCheckContext) => ReturnType<typeof bad>)[]) => (ctx: CustomCheckContext) => fns.map((f) => f(ctx));
const L = {
  rank: "A background job keeps the ranking fresh",
  fair: "Real voters behind shared IPs aren't blocked",
};

const ok99: Constraint = { type: "successRate", min: 0.99 };
const ND: NodeConfig = { cache: { hitRate: 1 } };
const RUSH: FlowIncident = { type: "spike", multiplier: 2, flows: ["ranking"], seconds: 12, label: "A post hits the front page" };

export type StepDef = {
  flows: Flow[];
  constraints: Constraint[];
  customKnobs?: CustomKnob[];
  customChecks?: (ctx: CustomCheckContext) => ReturnType<typeof bad>[];
  customCheckLabels?: string[];
  incident?: FlowIncident;
  incidentText?: string;
  nodeDefaults?: NodeConfig;
};

const oneRead = (rps: number) => ranking(rps, 1);

export const DESIGN = {
  launch: {
    flows: [{ ...vote(300), route: vote(300).route.filter((h) => h.kind !== "cache") }, oneRead(500)],
    constraints: [ok99, { type: "p99", maxMs: 250 }, { type: "budget", maxUsd: 500 }],
  },
  votes: {
    flows: [vote(30_000), oneRead(300)],
    customKnobs: [COUNTER],
    nodeDefaults: ND,
    constraints: [ok99, { type: "flowSuccess", flow: "vote", min: 0.99 }, { type: "budget", maxUsd: 1_300 }],
  },
  ranking: {
    flows: [vote(20_000), ranking(25_000, 6), recompute(5)],
    customKnobs: [COUNTER],
    customChecks: chk(rankCheck),
    customCheckLabels: [L.rank],
    nodeDefaults: ND,
    constraints: [ok99, { type: "flowSuccess", flow: "ranking", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 1_600 }],
  },
  frontpage: {
    flows: [vote(20_000), ranking(50_000, 6), recompute(5)],
    customKnobs: [COUNTER],
    customChecks: chk(rankCheck),
    customCheckLabels: [L.rank],
    nodeDefaults: ND,
    incident: RUSH,
    incidentText: "One post takes off and lands on everyone's front page: ranking reads double for twelve seconds.",
    constraints: [{ type: "everySecond", min: 0.97 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 2_200 }],
  },
  brigade: {
    flows: [vote(20_000), ranking(30_000, 6), recompute(5), brigade(120_000)],
    customKnobs: [COUNTER, LIMIT],
    customChecks: chk(rankCheck, fairCheck),
    customCheckLabels: [L.rank, L.fair],
    nodeDefaults: ND,
    constraints: [ok99, { type: "flowSuccess", flow: "vote", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 2_200 }],
  },
} satisfies Record<string, StepDef>;

export type StepId = keyof typeof DESIGN;

// ---------------------------------------------------------------- Reference designs (used by tests)

type Design = { spec: Spec; knobs?: Record<string, string> };
type Case = { pass: Design; fail: { why: string; design: Design; failing: string[] }[] };

const tier = (servers: number, extra: Spec = {}): Spec => ({ lb: 1, server: servers, db: 1, cache: 1, ...extra });
const ranked = (servers: number, extra: Spec = {}): Spec => tier(servers, { queue: 1, worker: 2, ...extra });

export const REFERENCE: Record<StepId, Case> = {
  launch: {
    pass: { spec: { server: 1, size: "s", db: 1 } },
    fail: [{ why: "no database: votes go nowhere", design: { spec: { server: 1 } }, failing: ["successRate"] }],
  },
  votes: {
    pass: { spec: tier(3) },
    fail: [
      { why: "one counter row, no buffer: the hot post's row melts", design: { spec: { lb: 1, server: 3, db: 1 } }, failing: ["flowSuccess"] },
      { why: "shard the database six ways instead: works, costs too much", design: { spec: { lb: 1, server: 3, db: 1, shards: 6 }, knobs: { counter: "sharded" } }, failing: ["budget"] },
    ],
  },
  ranking: {
    pass: { spec: ranked(4) },
    fail: [
      { why: "no cache: every front page view sorts in the database", design: { spec: { lb: 1, server: 4, db: 1, queue: 1, worker: 2 } }, failing: ["flowSuccess"] },
      { why: "cache but nothing recomputes the ranking", design: { spec: tier(4) }, failing: ["custom"] },
    ],
  },
  frontpage: {
    pass: { spec: ranked(8) },
    fail: [{ why: "sized for the average, not the rush", design: { spec: ranked(5) }, failing: ["everySecond"] }],
  },
  brigade: {
    pass: { spec: ranked(6, { limiter: 1 }), knobs: { limitBy: "account-age" } },
    fail: [
      { why: "no limiter: 120k bot votes a second reach the servers", design: { spec: ranked(6), knobs: { limitBy: "account-age" } }, failing: ["flowSuccess"] },
      { why: "limiting by IP lets the botnet through", design: { spec: ranked(6, { limiter: 1 }), knobs: { limitBy: "ip" } }, failing: ["custom"] },
    ],
  },
};
