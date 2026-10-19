import type { FlowResult, NodeStat } from "../../../sim";
import type { DebriefContext, DrillNode } from "../../../lib/drill/types";

/** "Why it works" paragraphs, written from the learner's own passing design. */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${num(x)}`;

function parts(ctx: DebriefContext) {
  const steady = ctx.result.steady as FlowResult;
  const stat = (n: DrillNode | undefined): NodeStat | undefined => (n ? steady.nodes[n.id] : undefined);
  const first = (kind: DrillNode["kind"]) => ctx.graph.nodes.find((n) => n.kind === kind);
  const servers = ctx.graph.nodes.filter((n) => n.kind === "server");
  const busiest = servers.map((n) => stat(n)).sort((a, b) => (b?.util ?? 0) - (a?.util ?? 0))[0];
  const flow = (id: string) => steady.flows.find((f) => f.id === id);
  return { steady, stat, first, servers, busiest, flow, cost: ctx.result.metrics.cost, p99: ctx.result.metrics.p99 };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const { stat, first, flow, cost, p99 } = parts(ctx);
    const reads = flow("read");
    return [
      `Each paste is two things: a small row in ${ctx.dbLabel} (id, expiry, where the text lives) and the text itself in object storage. Reads peaked at ${num(reads?.offered ?? 0)} a second and the database sat at ${pct(stat(first("db"))?.util ?? 0)}.`,
      `Object storage costs a fraction of database space per gigabyte and never runs out, so the database stays small enough to keep its indexes in memory. p99 is ${p99} ms, mostly the storage fetch, and the bill is ${usd(cost)} a month.`,
    ];
  },

  viral(ctx: DebriefContext) {
    const { stat, first, flow, steady, busiest, cost } = parts(ctx);
    const cdn = stat(first("cdn"));
    const origin = steady.flows.find((f) => f.id === "read");
    const absorbed = cdn && origin ? 1 - (stat(first("db"))?.reads ?? 0) / Math.max(1, origin.offered) : 0;
    return [
      `The CDN took ${num(cdn?.load ?? 0)} requests a second and answered about ${pct(absorbed)} of them itself, so only ${num(stat(first("db"))?.reads ?? 0)} reads a second reached your servers and database. Your busiest server runs at ${pct(busiest?.util ?? 0)}.`,
      `A paste is the ideal CDN object: it never changes after it's created, so one copy at the edge serves everyone near it. Hot pastes are exactly the ones that would hammer your origin, and exactly the ones the CDN keeps. ${num(flow("read")?.offered ?? 0)} reads a second for ${usd(cost)} a month.`,
    ];
  },

  expiry(ctx: DebriefContext) {
    const { steady, stat, first } = parts(ctx);
    const workers = ctx.graph.nodes.filter((n) => n.kind === "worker");
    const util = Math.max(0, ...workers.map((w) => stat(w)?.util ?? 0));
    return [
      `The sweep is a batch of independent deletes, so it goes on a queue and ${workers.length} workers drain it at ${pct(util)} utilisation with a worst wait of ${Math.round(steady.queueLagSeconds)} s. Readers never feel it: the work happens beside the request path, not on it.`,
      `An index on expires_at lets the job find expired rows without reading the table, and deleting in small batches keeps ${ctx.dbLabel} responsive (it's at ${pct(stat(first("db"))?.util ?? 0)}). The CDN copy now dies with the paste, so “expired” means expired everywhere.`,
    ];
  },

  abuse(ctx: DebriefContext) {
    const { steady, flow, stat, first } = parts(ctx);
    const spam = flow("spam");
    return [
      `${num(spam?.offered ?? 0)} spam posts a second arrived, and the limiter counted each client IP separately, so the bots ran out of budget while ordinary visitors never noticed. The database saw ${num(stat(first("db"))?.writes ?? 0)} writes a second instead of ${num((spam?.offered ?? 0) + (flow("create")?.offered ?? 0))}.`,
      `The size cap is the other half: rate limits bound how often, size limits bound how much. Together they bound what an attacker can cost you, and the paste size you recorded in the schema is what lets you audit it. Total ${usd(steady.cost)} a month.`,
    ];
  },

  server(ctx: DebriefContext) {
    const { servers, steady } = parts(ctx);
    const tl = ctx.result.timeline;
    return [
      `With ${servers.length} servers, losing one still leaves capacity for the whole load. Health checks tell the balancer within a few seconds to stop sending requests to the dead one${tl ? `, and the worst second still served ${pct(tl.worst)}` : ""}.`,
      `The CDN carried the reads while it happened; only cache misses and writes ever needed an origin. Final design: ${usd(steady.cost)} a month, with a CDN for hot pastes, object storage for the text, a queue and workers for expiry, and a limiter for abuse.`,
    ];
  },
};
