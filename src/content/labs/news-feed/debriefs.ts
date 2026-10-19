import type { FlowResult, Kind, NodeStat } from "../../../sim";
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
const flow = (ctx: DebriefContext, id: string) => (ctx.result.steady as FlowResult).flows.find((f) => f.id === id);

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const s = of(ctx, "server");
    return [
      `Two kinds of data, two homes: posts and follows are rows in ${ctx.dbLabel}; photos are files in object storage. Your single server runs at ${pct(s.busiest?.util ?? 0)}, and building a feed is a simple query: the latest posts by everyone I follow.`,
      `Total: ${usd(ctx.result.metrics.cost)} a month. That query is the one that will hurt later.`,
    ];
  },
  photos(ctx: DebriefContext) {
    const s = of(ctx, "server");
    const p = flow(ctx, "photo");
    return [
      `Photos are the heavy traffic: ${num(p?.offered ?? 0)} requests a second. Your CDN answered most from an edge near the viewer, leaving about ${num(s.load)} requests a second for your origin (${pct(s.busiest?.util ?? 0)} busy).`,
      "A photo never changes once posted, so it can be cached for a very long time. Give each upload a new key rather than overwriting, and you never have to invalidate anything.",
    ];
  },
  timelines(ctx: DebriefContext) {
    const db = of(ctx, "db");
    const w = of(ctx, "worker");
    const fan = ctx.configs.custom?.fanout ?? "push";
    return [
      fan === "pull"
        ? `Building each feed when it's read means every view runs several queries over the people you follow. ${ctx.dbLabel} took ${num(db.load)} reads a second.`
        : `You moved the work from read time to write time. When someone posts, a worker copies the post into each follower's timeline in Redis; opening the feed is then a single cache read. ${ctx.dbLabel} dropped to ${num(db.load)} operations a second, at ${pct(db.busiest?.util ?? 0)}.`,
      `Feeds are read far more often than anyone posts, so paying a little at write time (your ${w.count} workers, ${pct(w.busiest?.util ?? 0)} busy) saves a lot at read time. It's the classic trade: more storage and write work for fast, cheap reads.`,
    ];
  },
  celebrity(ctx: DebriefContext) {
    const w = of(ctx, "worker");
    return [
      `A normal user has a few hundred followers, so a post is a few hundred timeline writes. A celebrity with two million followers turns one post into two million writes, tying up workers for minutes and evicting other people's timelines from the cache.`,
      `Your hybrid keeps push for ordinary accounts and stores celebrity posts once, merging them into a feed when it's read. The queue's longest wait stayed at ${Math.round(ctx.result.metrics.queueLag ?? 0)} s with ${w.count} workers.`,
    ];
  },
  spike(ctx: DebriefContext) {
    const t = ctx.result.timeline;
    const s = of(ctx, "server");
    return [
      `When the celebrity posted, feed views and photo requests tripled for twelve seconds. Your worst second still served ${pct(t?.worst ?? 1)}: the CDN took the photos and the timeline cache took the feeds, so only a thin trickle reached ${s.count} origin servers.`,
      "Every request that skipped the origin or the database was one you didn't have to scale for. That's what makes a spike survivable: the hot content is the same for everyone, so you serve it from memory and from the edge.",
    ];
  },
};
