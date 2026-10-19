import type { DebriefContext } from "../../../lib/lab/types";

/** "Why it works" paragraphs, written from the learner's own passing design. */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");

function parts(ctx: DebriefContext) {
  const { graph, result } = ctx;
  const of = (kind: string) => graph.nodes.filter((n) => n.kind === kind);
  const util = (kind: string) => Math.max(0, ...of(kind).map((n) => result.steady.nodes[n.id]?.util ?? 0));
  const db = of("db")[0];
  return {
    gateways: of("ws").length,
    servers: of("server").length,
    workers: of("worker").length,
    shards: db?.shards ?? 1,
    wsUtil: util("ws"),
    dbUtil: util("db"),
    conns: Math.max(0, ...of("ws").map((n) => result.steady.nodes[n.id]?.conns ?? 0)),
    cost: result.metrics.cost,
    knob: (id: string) => ctx.configs.custom?.[id],
  };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `One server and one database carried ${num(100)} requests a second at ${pct(p.dbUtil)} database utilisation. Saving the whole document every few seconds is wasteful, but at this size it is the simplest thing that works, and simple is the right start.`,
      `It costs $${num(p.cost)} a month. The trouble is the model: two people saving the whole document will overwrite each other. The next steps fix that.`,
    ];
  },
  live(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Your ${p.gateways} gateways each hold about ${num(p.conns)} of the 50,000 connections they can take, and sit at ${pct(p.wsUtil)} of their message capacity. One gateway can't hold 90,000 sockets, so users are spread across several.`,
      `Because Asha and Ben may be attached to different gateways, an edit has to cross between them. The pub/sub broker is that bridge: each gateway subscribes to the documents its users have open. Without it only the people on the sender's gateway would see anything.`,
      `The operation log takes 12,000 writes a second, which is why the database is split into ${p.shards} shards by document id at ${pct(p.dbUtil)} each: one document always lands on one shard, so its log stays ordered.`,
    ];
  },
  sessions(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Routing by document id means one of your ${p.servers} servers owns each open document. It holds the document in memory and hands out sequence numbers, so every edit gets exactly one place in the order, with no distributed lock.`,
      `The cost is that a hot document can't spread over servers. That is usually acceptable: even a 5,000-person all-hands doc produces fewer operations than one server can order.`,
    ];
  },
  conflict(ctx: DebriefContext) {
    const merge = parts(ctx).knob("merge");
    return [
      merge === "crdt"
        ? "Each character got a unique id, so Asha's and Ben's inserts commute: applied in either order, every replica ends up identical. No server had to referee, which is also why CRDTs work for offline editing."
        : "The server turned Ben's operation into one that makes sense after Asha's: if she inserted three characters before his cursor, his insert shifts right by three. Every edit survives and everyone converges.",
      "Last write wins would have kept one paragraph and thrown the other away. That is the failure users never forgive in a document tool, because they don't notice it until the text is gone.",
    ];
  },
  history(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Every edit is appended to the log, and ${p.workers} background workers write a snapshot every 500 operations to object storage. Opening a document loads the latest snapshot and replays at most 500 operations, instead of two million.`,
      "Snapshots run off a queue, so typing never waits for one. The log stays the source of truth: it gives version history and undo, and a snapshot can always be rebuilt from it.",
    ];
  },
  presence(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Cursor moves skip the database entirely: they go gateway to pub/sub to the other editors. At 25,000 moves a second, each shown to eight people, they add a lot of fan-out, so your ${p.gateways} gateways run at ${pct(p.wsUtil)}.`,
      "A cursor is worthless a minute later, so losing one costs nothing. Spending a durable write on it would cost a lot. The rule: persist what users would grieve over, broadcast what they only glance at.",
    ];
  },
  gateway(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `With ${p.gateways} gateways, losing one leaves ${p.gateways - 1} to take over its ~${num(p.conns)} connections, and the load balancer's health check stops sending new users to the dead one within seconds.`,
      "Jittered backoff keeps 30,000 reconnects from landing in the same second. Resuming from the last version means a returning client replays only the operations it missed (and re-sends what it hadn't managed to send) instead of reloading and losing typing.",
    ];
  },
};
