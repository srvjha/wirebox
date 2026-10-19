import type { FlowResult, FlowTimeline } from "../../../sim";
import type { DebriefContext } from "../../../lib/drill/types";

/** "Why it works" paragraphs, written from the learner's own passing design. */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${num(x)}`;

function parts(ctx: DebriefContext) {
  const steady = ctx.result.steady as FlowResult;
  const ws = ctx.graph.nodes.filter((n) => n.kind === "ws");
  const stats = ws.map((n) => steady.nodes[n.id]).filter(Boolean);
  const busiest = Math.max(0, ...stats.map((s) => s.util));
  const conns = Math.max(0, ...stats.map((s) => s.conns ?? 0));
  const total = stats.reduce((s, x) => s + (x.conns ?? 0), 0);
  const redis = ctx.graph.nodes.find((n) => n.kind === "cache");
  const pubsub = ctx.graph.nodes.find((n) => n.kind === "pubsub");
  return {
    steady,
    ws,
    busiest,
    conns,
    total,
    redisUtil: redis ? steady.nodes[redis.id]?.util ?? 0 : 0,
    pubsubLoad: pubsub ? steady.nodes[pubsub.id]?.load ?? 0 : 0,
    cost: ctx.result.metrics.cost,
    tl: ctx.result.timeline as FlowTimeline | null,
  };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const { total, cost, redisUtil } = parts(ctx);
    return [
      `One gateway holds all ${num(total)} open connections, and a heartbeat from each refreshes a key in Redis that expires if they go quiet (Redis is at ${pct(redisUtil)}). “Online” isn't something you store: it's the absence of a timeout.`,
      `That's the core trick of presence. Nobody tells you when a phone dies or a laptop closes, so you infer it from silence. Total ${usd(cost)} a month.`,
    ];
  },

  scale(ctx: DebriefContext) {
    const { ws, conns, busiest, cost } = parts(ctx);
    return [
      `The load balancer spreads connections across ${ws.length} gateways, about ${num(conns)} each (${pct(conns / 50_000)} of the 50,000 a gateway can hold). The limit that matters isn't requests per second but how many open sockets a machine can keep: ${pct(busiest)} is your busiest.`,
      `Gateways are stateful in a way API servers aren't: each user is pinned to one. That's what makes the next step (telling friends) interesting. Cost ${usd(cost)}.`,
    ];
  },

  fanout(ctx: DebriefContext) {
    const { ws, pubsubLoad, cost } = parts(ctx);
    return [
      `A friend can be connected to any of your ${ws.length} gateways, so when someone comes online the update has to reach all of them. The pub/sub broker is the switchboard: each gateway publishes once and every other gateway hears it, carrying ${num(pubsubLoad)} messages a second.`,
      `Without it, a gateway could only tell friends who happened to share its machine, about one in ${ws.length}. Each status change costs one publish plus a delivery per online friend, so fan-out, not heartbeats, sets the size of the broker. Cost ${usd(cost)}.`,
    ];
  },

  timeouts(ctx: DebriefContext) {
    const { redisUtil, cost } = parts(ctx);
    return [
      `A 60-second timeout (three missed 20-second pings) is a compromise both ways: long enough that a tunnel or a bad packet doesn't flip anyone offline, short enough that a closed app disappears within about a minute. Redis handles the pings at ${pct(redisUtil)}.`,
      `Tighter settings multiply cost and flicker; looser ones leave ghosts. There's no right number, only a tradeoff you chose on purpose. Cost ${usd(cost)}.`,
    ];
  },

  gateway(ctx: DebriefContext) {
    const { ws, tl, cost } = parts(ctx);
    return [
      `With ${ws.length} gateways, losing one leaves enough sockets for everyone, and health checks tell the balancer within seconds to stop routing to it${tl ? `. Recovery took ${tl.recovery ?? "?"} s` : ""}. Those connections' owners reconnect elsewhere.`,
      `Jittered backoff keeps ${num(300_000 / Math.max(1, ws.length))} users from knocking on the door in the same second. Total ${usd(cost)} a month for a region of 300,000 online users: multiply by ~70 regions for 100 million registered users with ~20 million online.`,
    ];
  },
};
