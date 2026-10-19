import type { DebriefContext } from "../../../lib/drill/types";

/** "Why it works" paragraphs, written from the learner's own passing design. */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");

function parts(ctx: DebriefContext) {
  const { graph, result } = ctx;
  const of = (kind: string) => graph.nodes.filter((n) => n.kind === kind);
  const util = (kind: string) => Math.max(0, ...of(kind).map((n) => result.steady.nodes[n.id]?.util ?? 0));
  const db = of("db")[0];
  const k = ctx.configs.custom ?? {};
  const n = Number(k.n ?? 1);
  return {
    servers: of("server").length,
    shards: db?.shards ?? 1,
    serverUtil: util("server"),
    dbUtil: util("db"),
    cost: result.metrics.cost,
    n,
    quorum: Math.floor(n / 2) + 1,
  };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `One node holds every key: ${pct(p.dbUtil)} database utilisation at 2,400 operations a second, for $${num(p.cost)} a month. A single machine is a fine key-value store until it isn't.`,
      "It has two limits that both end the same way: it can only hold what fits on one machine, and when that machine dies, so does every key.",
    ];
  },
  partition(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Your ${p.shards} partitions share 36,000 operations a second, each at about ${pct(p.dbUtil)}. Hashing the key spreads them evenly, whatever the keys look like.`,
      "A consistent-hash ring with many virtual nodes means a new node takes a few small slices from every existing node, instead of everything shuffling. Growing the cluster is a background copy of about 1/N of the data, not an outage.",
    ];
  },
  replicate(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Every key now lives on ${p.n} nodes. Each write is stored ${p.n} times, which is why you needed ${p.shards} partitions: the same 6,000 writes a second now cost ${num(6_000 * p.n)} stores a second, at ${pct(p.dbUtil)} utilisation.`,
      `That is the price of durability. With ${p.n} copies, ${p.n - 1} disks can die before a key is lost, and the copies sit on different nodes (and ideally racks and zones) so one failure can't take them all.`,
    ];
  },
  quorum(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `You set reads and writes so that R + W > N = ${p.n}. A write is on at least W nodes and a read asks at least R, so the two sets must overlap by at least one node, and that node has the newest value.`,
      `With N = ${p.n} and a majority of ${p.quorum}, the system tolerates ${p.n - p.quorum} failed replica${p.n - p.quorum === 1 ? "" : "s"} for both reads and writes. Lowering R or W makes things faster and weaker; raising them makes things slower and more fragile.`,
    ];
  },
  nodedown(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `When a node died, the load balancer's health check pulled it out within seconds and the remaining ${p.servers - 1} coordinators carried the traffic (they peaked at ${pct(p.serverUtil)} before the loss, so there was room). Keys it held were still on two other nodes.`,
      "Because you wait for a majority rather than all replicas, one dead node doesn't block anything. Choosing W = N would have turned a single failure into an outage for a third of the keys.",
    ];
  },
  repair() {
    return [
      "While the node was away, stand-in nodes held its writes as hints and handed them back when it returned (hinted handoff). Reads that saw it disagree with its neighbours wrote the right value back (read repair).",
      "A background pass compares Merkle trees, hashes of hashes over each key range, so two nodes can find exactly which keys differ without comparing every key. That catches the rarely-read keys neither of the other mechanisms touches.",
    ];
  },
  hotkey(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Adding partitions can't fix a hot key: all of its traffic lands on the one partition that owns it. Your answer takes the load before it gets there, so storage stayed at ${pct(p.dbUtil)}.`,
      "Partitioning evens out many keys; it does nothing for one key. Hot keys need their own treatment: a cache in front, or splitting the key into sub-keys that spread across partitions.",
    ];
  },
};
