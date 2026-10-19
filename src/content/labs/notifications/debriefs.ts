import type { FlowResult, FlowTimeline } from "../../../sim";
import type { DebriefContext } from "../../../lib/lab/types";

/** "Why it works" paragraphs, written from the learner's own passing design. */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${num(x)}`;

function parts(ctx: DebriefContext) {
  const steady = ctx.result.steady as FlowResult;
  const workers = ctx.graph.nodes.filter((n) => n.kind === "worker");
  const queues = ctx.graph.nodes.filter((n) => n.kind === "queue");
  const servers = ctx.graph.nodes.filter((n) => n.kind === "server");
  const provider = ctx.graph.nodes.find((n) => n.kind === "external");
  const workerUtil = Math.max(0, ...workers.map((w) => steady.nodes[w.id]?.util ?? 0));
  const total = steady.flows.reduce((s, f) => s + f.offered, 0);
  return { steady, workers, queues, servers, provider, workerUtil, total, cost: ctx.result.metrics.cost, tl: ctx.result.timeline as FlowTimeline | null };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const { steady, provider, cost } = parts(ctx);
    return [
      `Each confirmation is one call to the provider, made from inside the request. At ${num(steady.flows[0]?.offered ?? 0)} a second the provider is at ${pct(steady.nodes[provider?.id ?? ""]?.util ?? 0)} of its limit, and the API's p99 of ${ctx.result.metrics.p99} ms is almost entirely time spent waiting on someone else's servers.`,
      `That's fine today, and it costs ${usd(cost)} a month. Note what's hidden in it: the fan's request can't finish until the email provider answers, so their speed and their bad days are yours.`,
    ];
  },

  blast(ctx: DebriefContext) {
    const { steady, workers, workerUtil, total, cost } = parts(ctx);
    return [
      `The API now just writes a message to the queue and returns, so p99 dropped to ${ctx.result.metrics.p99} ms no matter how slow the provider is. ${num(total)} messages a second are drained by ${workers.length} workers at ${pct(workerUtil)} busy.`,
      `The queue is a shock absorber: when the announcement lands faster than the provider can take it, messages wait instead of failing. Worst queue wait in the run was ${Math.round(steady.queueLagSeconds)} s. Cost ${usd(cost)} a month.`,
    ];
  },

  slow(ctx: DebriefContext) {
    const { workers, tl, cost } = parts(ctx);
    const sel = ctx.configs.custom?.retries ?? "backoff";
    return [
      `When the provider slowed and began failing a quarter of its calls, each worker spent longer per message, so your ${workers.length} workers kept up only because you gave them headroom. The queue absorbed the rest${tl ? ` (worst wait ${Math.round(tl.worstQueueLag)} s)` : ""}.`,
      `Retries are what made the failures disappear, and ${sel === "backoff" ? "backoff is what kept them from making things worse: waiting longer after each failure gives the provider room to recover instead of piling more calls on it" : "how you retry matters as much as whether you do"}. Cost ${usd(cost)} a month.`,
    ];
  },

  lanes(ctx: DebriefContext) {
    const { queues, workers, tl, cost } = parts(ctx);
    return [
      `You split delivery into ${queues.length} queues with ${workers.length} workers between them. A flood on the bulk lane can fill its queue and make it wait minutes; the login-code lane doesn't feel it, so codes still arrive in seconds${tl ? ` (worst second: ${pct(tl.worst)} served)` : ""}.`,
      `Marketing mail is “eventually”, a login code is “now”. Mixing them in one first-in-first-out line makes the urgent one wait for the slow one. Priority is just separate queues with separate capacity. Cost ${usd(cost)}.`,
    ];
  },

  once(ctx: DebriefContext) {
    const { workers, cost } = parts(ctx);
    const claim = ctx.configs.custom?.dedup === "claim";
    return [
      `Because retries make delivery at-least-once, your ${workers.length} workers each record the message id in ${ctx.dbLabel} ${claim ? "before sending, under a unique constraint" : "to remember what it sent"}. When a job is retried or two workers race for it, only one can claim the id; the other sees it taken and stops.`,
      `That's what “exactly-once” really is: at-least-once delivery plus an idempotent receiver. The wire can repeat itself; the effect can't. Your final design costs ${usd(cost)} a month.`,
    ];
  },
};
