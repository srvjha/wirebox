import type { FlowResult, Kind, NodeStat } from "../../../sim";
import type { DebriefContext } from "../../../lib/drill/types";

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
    const w = of(ctx, "ws");
    return [
      `A WebSocket gateway keeps a connection open per phone and pushes messages down it, so nobody has to ask "anything new?". Yours holds ${num(20000)} connections and sits at ${pct(w.busiest?.util ?? 0)}.`,
      `Every message is saved before it's delivered, which is why the database is on the path. Total: ${usd(ctx.result.metrics.cost)} a month.`,
    ];
  },
  scale(ctx: DebriefContext) {
    const w = of(ctx, "ws");
    return [
      `One gateway holds about 50,000 connections, so 250,000 phones need at least five. You run ${w.count}, with the busiest at ${pct(w.busiest?.util ?? 0)} of its connection limit. The load balancer spreads new connections; after that, each phone stays on its gateway for hours.`,
      "That's the catch with WebSockets: unlike a normal request, a connection pins a user to a machine. Which creates a new problem, next.",
    ];
  },
  pubsub(ctx: DebriefContext) {
    const w = of(ctx, "ws");
    const d = ctx.result.metrics.delivered ?? 1;
    return [
      `When Asha sends a message, her gateway is rarely the one holding Ravi's connection. Your pub/sub broker lets the sender's gateway publish to the conversation and every gateway with a member subscribe, so ${pct(d)} of messages reached every recipient.`,
      `Without it, with ${w.count} gateways, a message would reach only the roughly 1 in ${w.count} recipients who happened to be on the same one. Group messages make it worse: one send fans out to eight deliveries.`,
    ];
  },
  ordering(ctx: DebriefContext) {
    return [
      "Messages from two people in one conversation travel different paths: different phones, different gateways. Arrival order isn't send order, and phone clocks are wrong by seconds.",
      `Your per-conversation sequence number fixes it: one writer numbers a conversation's messages 1, 2, 3, and every client sorts by that number. Different conversations number independently, so there's no global bottleneck. The design still costs ${usd(ctx.result.metrics.cost)} a month.`,
    ];
  },
  offline(ctx: DebriefContext) {
    const w = of(ctx, "worker");
    const f = flow(ctx, "offline");
    return [
      `A message for a phone that isn't connected is stored first, so it survives; then a push job goes on a queue. Your ${w.count} workers called the push provider at ${pct(w.busiest?.util ?? 0)} utilisation and ${pct(f?.asyncOnTime ?? 1)} of pushes went out in time.`,
      "The queue matters because Apple's and Google's push services have their own rate limits and bad days. Your app answers instantly and the workers retry at the provider's pace. When the phone reconnects, it asks for everything after its last seq and the stored messages arrive in order.",
    ];
  },
  receipts(ctx: DebriefContext) {
    const db = of(ctx, "db");
    return [
      `Every message produces about two receipts (delivered, read), which is twice the write traffic of the messages themselves. Writing each one would have pushed ${ctx.dbLabel} well past its ${num(8000)} writes a second.`,
      `Your Redis layer keeps the latest receipt state per message and flushes in batches, so the database saw ${num(db.writes)} writes a second in total, at ${pct(db.busiest?.util ?? 0)}. Receipts are the classic case for coalescing: nobody needs "delivered" and "read" stored as separate moments forever.`,
    ];
  },
  failure(ctx: DebriefContext) {
    const w = of(ctx, "ws");
    const t = ctx.result.timeline;
    return [
      `A gateway died with its ${num(250000 / Math.max(1, w.count))} connections. Health checks noticed after about three seconds, the balancer stopped routing to it, and the phones reconnected to the others. Recovery took ${t?.recovery ?? 0} s and the worst second still served ${pct(t?.worst ?? 1)}.`,
      `You kept a spare: with ${w.count} gateways, losing one leaves ${w.count - 1} holding 250,000 connections between them. That's the part people forget about WebSockets: reconnects arrive all at once, so the survivors need room for them.`,
    ];
  },
};
