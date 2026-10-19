import type { Kind, NodeStat } from "../../../sim";
import type { DebriefContext } from "../../../lib/lab/types";

/** "Why it works" text, written from the learner's own passing design. */
const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${num(x)}`;

function of(ctx: DebriefContext, kind: Kind) {
  const nodes = ctx.graph.nodes.filter((n) => n.kind === kind);
  const stats: NodeStat[] = nodes.map((n) => ctx.result.steady.nodes[n.id]).filter(Boolean);
  const busiest = stats.reduce<NodeStat | undefined>((a, s) => (!a || s.util > a.util ? s : a), undefined);
  return { count: nodes.length, busiest, load: stats.reduce((s, x) => s + x.load, 0), writes: stats.reduce((s, x) => s + (x.writes ?? 0), 0) };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const s = of(ctx, "server");
    return [
      `A vote is a small increment, a front page is a sort. At launch both are trivial for one server (${pct(s.busiest?.util ?? 0)} busy) and one ${ctx.dbLabel}.`,
      `${usd(ctx.result.metrics.cost)} a month. Hold that thought: a vote is a write, and writes are the expensive kind.`,
    ];
  },
  votes(ctx: DebriefContext) {
    const db = of(ctx, "db");
    const c = of(ctx, "cache");
    return [
      `Thirty thousand votes a second would have been ${num(30000)} database writes, against a limit of ${num(8000)} per node. Redis counts votes in memory (${num(c.load)} operations a second, ${pct(c.busiest?.util ?? 0)} busy) and flushes totals to the database in batches, so ${ctx.dbLabel} saw only ${num(db.writes)} writes a second.`,
      "Nobody needs a vote count to be exact to the second. Trading a moment of staleness for a 98% cut in writes is the classic move for write-heavy counters. Sharding the counter across rows or nodes also works, but you pay for every extra shard.",
    ];
  },
  ranking(ctx: DebriefContext) {
    const db = of(ctx, "db");
    const w = of(ctx, "worker");
    return [
      `A good ranking weighs votes against age, so it can't be a plain ORDER BY votes. Computing it on each page view would be several expensive queries ${num(25000)} times a second. Instead a background job (${w.count} workers, ${pct(w.busiest?.util ?? 0)} busy) recomputes it every few seconds and writes the result to Redis.`,
      `Everyone sees the same front page, so one cached copy serves them all. ${ctx.dbLabel} handled ${num(db.load)} operations a second, ${pct(db.busiest?.util ?? 0)} of its capacity.`,
    ];
  },
  frontpage(ctx: DebriefContext) {
    const s = of(ctx, "server");
    const t = ctx.result.timeline;
    return [
      `When a post took off, front-page reads doubled for twelve seconds and your worst second still served ${pct(t?.worst ?? 1)}. The cached ranking absorbed the load; what was left landed on ${s.count} servers.`,
      "Ranking is a shared, slowly changing answer: the best kind of thing to cache. The staleness window (seconds) is a product decision, not a technical one: a few seconds is invisible to people, and it's worth orders of magnitude in capacity.",
    ];
  },
  brigade(ctx: DebriefContext) {
    const by = ctx.configs.custom?.limitBy ?? "ip";
    const attack = ctx.result.steady.attack;
    const blocked = attack ? ctx.result.steady.limitedAttack / attack : 0;
    return [
      `A brigade sent ${num(attack)} fake votes a second at one post. Your limiter, counting by ${by === "ip" ? "IP address" : by === "account" ? "account" : "account, account age and velocity"}, stopped ${pct(blocked)} of them before they reached a server, a cache, or the ranking.`,
      "Brigading is an arms race: bots adapt to whatever you count. Per-IP limits are the easiest to dodge and the most likely to hurt real users on shared networks. Combining who is voting, how old their account is, and how fast votes on one post are arriving keeps honest users untouched and the ranking meaningful.",
    ];
  },
};
