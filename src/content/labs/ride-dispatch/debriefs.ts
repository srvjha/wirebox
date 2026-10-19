import { serverSize } from "../../../sim";
import type { DebriefContext } from "../../../lib/lab/types";

/** "Why it works" paragraphs, written from the learner's own passing design. */

const num = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${num(x)}`;

function parts(ctx: DebriefContext) {
  const { graph, result } = ctx;
  const of = (k: string) => graph.nodes.filter((n) => n.kind === k);
  const servers = of("server");
  const db = of("db").find((d) => (d.role ?? "primary") === "primary");
  return {
    servers,
    size: serverSize(servers[0]?.size),
    shards: db?.shards ?? 1,
    workers: of("worker").length,
    gateways: of("ws").length,
    cost: result.metrics.cost,
    dbUtil: db ? Math.round((result.steady.nodes[db.id]?.util ?? 0) * 100) : 0,
  };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Two thousand drivers pinging every four seconds is 500 writes a second, and one ${p.size.vcpu} vCPU server and a database handle that comfortably for ${usd(p.cost)} a month. Writing each ping straight to the database is the simplest design that works.`,
      "It will not survive growth. A driver's position is worthless seconds after it is written, yet this design pays for durability on every single ping.",
    ];
  },
  updates(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Pings now land in a Redis geo index and most never reach the database: only about one in ten, as periodic checkpoints. Your ${p.servers.length} servers take the 50,000 updates a second and the database sits at ${p.dbUtil}% instead of melting.`,
      "A location is the most perishable data in the system. Keeping it in memory trades durability you do not need for speed you do. If Redis restarts, drivers repopulate it within four seconds simply by pinging again.",
      `That asymmetry (write-heavy, short-lived, fast to rebuild) is what makes an in-memory index the right tool. It costs ${usd(p.cost)} a month.`,
    ];
  },
  geo(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Drivers are filed under their geohash, and a search reads the rider's cell plus its eight neighbours, then sorts that handful by real distance. Instead of 200,000 distance calculations you do a few dozen, so ${p.servers.length} servers handle 1,500 searches a second.`,
      "The neighbours matter. Two points metres apart can sit on opposite sides of a cell border with completely different prefixes, so a single-cell lookup misses the closest car. A quadtree adapts to density, but rebalancing it for 50,000 moving points a second costs more than it saves; a prefix lookup does not care that things move.",
    ];
  },
  matching(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Ride requests go on a queue and ${p.workers} matching workers pick the nearest available driver. A rider is never stuck on an HTTP call waiting for an answer, and a burst of requests becomes a short wait instead of an error.`,
      "Claiming the driver is one atomic step. Two workers can pick the same nearest car in the same millisecond; with SET NX exactly one wins and the other moves to the next-nearest. Read-then-assign would promise one driver to two riders.",
      `The matching tier adds a queue and workers for ${usd(p.cost)} a month in total.`,
    ];
  },
  cities(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Trips are sharded by city, then by geohash prefix within hot cities, across ${p.shards} shards. Mumbai's 60% share is spread over several shards instead of crushing one, and a nearby search still touches only one or two.`,
      "Sharding by city alone fails exactly when it matters: a hot city is a hot shard, and more shards cannot split a single key. Sharding by driver id balances perfectly but turns every search into a scatter-gather across all shards.",
      `The compromise is a key that keeps neighbours together and still splits big cities. Total: ${usd(p.cost)} a month.`,
    ];
  },
  tracking(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `A hundred and fifty thousand riders keep a WebSocket open, spread over ${p.gateways} gateways of 50,000 connections each. Every position update reaches the right gateway through pub/sub, so a rider connected to gateway 3 sees a driver whose update arrived at gateway 1.`,
      "Polling would have asked every rider's phone to call your servers every few seconds, most of the time to hear 'nothing changed'. A held-open connection costs memory but turns it into push.",
      `The whole system costs ${usd(p.cost)} a month: an in-memory index, a matching service, city-based shards and live push.`,
    ];
  },
};
