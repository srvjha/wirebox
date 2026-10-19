import type { FlowResult, FlowTimeline } from "../../../sim";
import type { DebriefContext } from "../../../lib/lab/types";

/** "Why it works" paragraphs, written from the learner's own passing design. */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${num(x)}`;

function parts(ctx: DebriefContext) {
  const steady = ctx.result.steady as FlowResult;
  const find = (k: string) => ctx.graph.nodes.find((n) => n.kind === k);
  const stat = (k: string) => steady.nodes[find(k)?.id ?? ""];
  const servers = ctx.graph.nodes.filter((n) => n.kind === "server");
  const busiest = Math.max(0, ...servers.map((s) => steady.nodes[s.id]?.util ?? 0));
  const suggest = steady.flows.find((f) => f.id === "suggest");
  return { steady, stat, servers, busiest, suggest, cost: ctx.result.metrics.cost, p99: ctx.result.metrics.p99, tl: ctx.result.timeline as FlowTimeline | null };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const { stat, p99, cost } = parts(ctx);
    return [
      `Each keystroke becomes one indexed prefix query. The ${ctx.dbLabel} sits at ${pct(stat("db")?.util ?? 0)} and the whole round trip takes ${p99} ms at p99, well inside the 50 ms budget, because there are only a few hundred requests a second.`,
      `Nothing clever is needed yet, and that's the point: at ${usd(cost)} a month, a prefix index is the right answer for a small catalogue. The design earns complexity as load shows up.`,
    ];
  },

  cache(ctx: DebriefContext) {
    const { stat, suggest, servers, busiest } = parts(ctx);
    const db = stat("db");
    return [
      `Typing is the most repetitive traffic there is: thousands of people type “in” or “ban” every minute. Redis answered most of the ${num(suggest?.offered ?? 0)} lookups a second, leaving ${num(db?.reads ?? 0)} for ${ctx.dbLabel} (${pct(db?.util ?? 0)}).`,
      `Your ${servers.length} servers run at ${pct(busiest)}, comfortable because debouncing means each person sends a request per pause, not per key. Without it the same typing would produce about three times the requests.`,
    ];
  },

  topk(ctx: DebriefContext) {
    const { stat, p99, cost } = parts(ctx);
    const db = stat("db");
    return [
      `Precomputing the top 10 for every prefix means a cache miss is rare: only ${num(db?.reads ?? 0)} reads a second reach ${ctx.dbLabel}, and each is a single key lookup instead of a search-and-sort. p99 is ${p99} ms.`,
      `Ranking is moved off the request path and into a background job, where it can take minutes without anyone waiting. A search engine would give you typo tolerance, but you'd pay its latency on every keystroke. Use it for the results page, not the dropdown. Cost ${usd(cost)} a month.`,
    ];
  },

  fresh(ctx: DebriefContext) {
    const { steady, stat, cost } = parts(ctx);
    const workers = ctx.graph.nodes.filter((n) => n.kind === "worker");
    return [
      `Search logs flow through a queue to ${workers.length} workers (${pct(stat("worker")?.util ?? 0)} busy, worst wait ${Math.round(steady.queueLagSeconds)} s) that fold them into the counts and refresh affected top 10s. A headliner announced at noon can be suggested within minutes.`,
      `Keeping the pipeline off the typing path matters: the log is the lowest-priority traffic you have, and it can lag without anyone noticing. Suggestions stay fast regardless. Cost ${usd(cost)}.`,
    ];
  },

  spike(ctx: DebriefContext) {
    const { stat, tl, cost } = parts(ctx);
    return [
      `The CDN absorbed ${num(stat("cdn")?.load ?? 0)} requests a second: short prefixes like “a” or “in” have the same answer for everyone, so a 30-second copy at the edge serves a crowd.${tl ? ` During the rush the worst second still served ${pct(tl.worst)}.` : ""}`,
      `Notice the layers: the browser debounces, the CDN answers shared prefixes, Redis answers precomputed ones, and the database barely hears about it. Each layer shields the next. Total ${usd(cost)} a month.`,
    ];
  },
};
