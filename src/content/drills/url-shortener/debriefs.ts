import { BOT_IPS, IP_PROFILE, SERVER_SIZES, TIMELINE, serverSize, type NodeStat } from "../../../sim";
import type { DebriefContext, DrillNode } from "../../../lib/drill/types";

/**
 * "Why it works" paragraphs, written from the learner's own passing design:
 * their machine sizes, their utilisation, their cost, their config.
 */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${num(x)}`;

function parts(ctx: DebriefContext) {
  const { graph, result } = ctx;
  const stat = (n: DrillNode | undefined): NodeStat | undefined => (n ? result.steady.nodes[n.id] : undefined);
  const servers = graph.nodes.filter((n) => n.kind === "server");
  const busiest = servers.map((n) => ({ n, s: stat(n) })).sort((a, b) => (b.s?.util ?? 0) - (a.s?.util ?? 0))[0];
  const dbs = graph.nodes.filter((n) => n.kind === "db");
  const primary = dbs.find((d) => (d.role ?? "primary") === "primary") ?? dbs[0];
  const replicas = dbs.filter((d) => d !== primary);
  const cache = graph.nodes.find((n) => n.kind === "cache");
  const sizes = [...new Set(servers.map((s) => serverSize(s.size).id))];
  const sizeText =
    sizes.length === 1
      ? `${servers.length} ${serverSize(servers[0]?.size).vcpu} vCPU server${servers.length === 1 ? "" : "s"}`
      : `${servers.length} servers of mixed sizes`;
  return { stat, servers, busiest, primary, replicas, cache, sizeText, cost: result.metrics.cost, p99: result.metrics.p99 };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const { busiest, primary, stat, cost, p99 } = parts(ctx);
    return [
      `Your one ${serverSize(busiest?.n.size).vcpu} vCPU server peaked at ${pct(busiest?.s?.util ?? 0)} and ${ctx.dbLabel} at ${pct(stat(primary)?.util ?? 0)}. With that much headroom nothing waits in a queue, so p99 stays at ${p99} ms.`,
      `It costs ${usd(cost)} a month. At launch that's the right answer: the cheapest design that meets the goals wins, because every extra box is one more thing to pay for, patch and debug at 3 a.m.`,
    ];
  },

  vertical(ctx: DebriefContext) {
    const { busiest, cost } = parts(ctx);
    const size = serverSize(busiest?.n.size);
    const small = SERVER_SIZES[0];
    return [
      `Your ${size.vcpu} vCPU server handles ${num(size.cap)} requests a second where the small one managed ${num(small.cap)}. At this step's peak it runs at ${pct(busiest?.s?.util ?? 0)}, under the ~85% line where queues start to form.`,
      `Scaling up needed no new parts and no code changes, which is why it's the first move. But read the price list again: twice the cores never buys twice the capacity, and the biggest machine stops at ${num(SERVER_SIZES[SERVER_SIZES.length - 1].cap)} req/s. Total: ${usd(cost)} a month.`,
    ];
  },

  horizontal(ctx: DebriefContext) {
    const { servers, busiest, sizeText, cost } = parts(ctx);
    const xl = SERVER_SIZES.find((s) => s.id === "xl")!;
    return [
      `Your load balancer splits traffic across ${sizeText}, so each sees about 1/${servers.length} of it and the busiest sits at ${pct(busiest?.s?.util ?? 0)}.`,
      `Compare the one big box: an ${xl.vcpu} vCPU machine alone costs ${usd(xl.monthlyUsd)}. Your whole tier, balancer included, costs ${usd(cost)} a month, and you can add one more server whenever traffic grows.`,
      "This only works because your servers are stateless: any server can answer any redirect, since the data lives in the database, not in the server's memory.",
    ];
  },

  cache(ctx: DebriefContext) {
    const { cache, primary, stat, cost } = parts(ctx);
    const c = stat(cache);
    const db = stat(primary);
    return [
      `Your key ${ctx.configs.cache.key || "(empty)"} gives every slug its own entry holding just ${ctx.configs.cache.value}, which is all a redirect needs. Redis took ${num(c?.load ?? 0)} lookups a second at ${pct(c?.util ?? 0)} of its capacity.`,
      `Because a few viral links get most clicks, most reads never reach ${ctx.dbLabel}: it handled ${num(db?.reads ?? 0)} reads a second, at ${pct(db?.util ?? 0)}. Adding replicas to absorb the same load would cost far more than one Redis box; your design runs at ${usd(cost)} a month.`,
    ];
  },

  scraper(ctx: DebriefContext) {
    const { rate, by } = ctx.configs.limiter;
    const bot = ctx.result.steady.attack / BOT_IPS;
    const busiestReal = IP_PROFILE[IP_PROFILE.length - 1];
    const blocked = ctx.result.steady.attack ? ctx.result.steady.limitedAttack / ctx.result.steady.attack : 0;
    return [
      `Your limiter counts requests per ${by === "ip" ? "IP address" : by} and allows ${num(rate)} a second. The busiest real source, ${busiestReal.label}, sends about ${busiestReal.perIp} a second, so nobody real is turned away.`,
      `The scraper spreads ${num(ctx.result.steady.attack)} requests over ${BOT_IPS} IPs, about ${num(bot)} a second each, far above your limit: ${pct(blocked)} of its traffic got a 429 at the edge, before costing a server, a cache lookup or a database query.`,
      "Random slugs miss the cache by design, so without the limiter every bot request would have landed on the database.",
    ];
  },

  stampede(ctx: DebriefContext) {
    const t = ctx.result.timeline;
    return [
      `When Redis came back empty, every hot slug missed at once. With coalescing on, concurrent misses for the same key wait for one database read instead of each firing their own, so ${ctx.dbLabel} saw a few hundred refill queries instead of tens of thousands.`,
      `Your worst second still served ${pct(t?.worst ?? 1)}, and the cache was warm again ${t?.recovery ? `within ${t.recovery} s` : "almost immediately"}. Without coalescing, the flood of misses overloads the database, failed requests get retried, and the retries make it worse: a thundering herd.`,
    ];
  },

  server(ctx: DebriefContext) {
    const { servers, sizeText } = parts(ctx);
    const t = ctx.result.timeline;
    const cap = serverSize(servers[0]?.size).cap;
    const load = ctx.result.steady.legit;
    return [
      `When one server died, health checks noticed after ${TIMELINE.detectSeconds} failed pings and the balancer stopped sending it traffic. Until then, about 1 in ${servers.length} requests failed, which is why recovery took ${t?.recovery ?? 0} s rather than zero.`,
      `Your ${sizeText} can lose one and still carry the load: ${servers.length - 1} × ${num(cap)} req/s is above the ${num(load)} req/s peak. That spare is called N+1 redundancy, and it's cheaper than the outage it prevents.`,
    ];
  },

  primary(ctx: DebriefContext) {
    const t = ctx.result.timeline;
    return [
      `When the primary ${ctx.dbLabel} lost power, your replica already had a copy of every link. Failover promoted it after about ${TIMELINE.failoverSeconds} s (time to be sure the primary is really gone, not just slow) and writes resumed on the new primary.`,
      `Back to normal after ${t?.recovery ?? 0} s. Redirects kept working through most of it because hot slugs came from Redis. Without a replica you'd be restoring from backup: hours, and every link created since the last backup lost.`,
    ];
  },

  freshness(ctx: DebriefContext) {
    const lag = ctx.result.steady.lagMs;
    const viaCache = ctx.configs.cache.writeThrough;
    return [
      `Your replica runs about ${num(lag)} ms behind the primary. A link shared the second it's created would be looked up before it has reached the replica, and the reader would get a 404.`,
      viaCache
        ? "With write-through, every new link goes into Redis the moment it's saved, so its first clicks are cache hits and never touch the lagging replica."
        : "Reading from the primary means every lookup sees the latest data. It costs you the extra read capacity the replica provided, which is fine here because Redis absorbs most reads anyway.",
      "This guarantee is called read-your-writes: whoever just made something can see it immediately.",
    ];
  },
};
