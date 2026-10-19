import { serverSize } from "../../../sim";
import type { DebriefContext } from "../../../lib/lab/types";

/** "Why it works" paragraphs, written from the learner's own passing design. */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${num(x)}`;

function parts(ctx: DebriefContext) {
  const { graph, result, configs } = ctx;
  const of = (k: string) => graph.nodes.filter((n) => n.kind === k);
  const servers = of("server");
  const db = of("db").find((d) => (d.role ?? "primary") === "primary");
  const size = serverSize(servers[0]?.size);
  const util = (id?: string) => (id ? result.steady.nodes[id]?.util ?? 0 : 0);
  const peak = Math.max(0, ...servers.map((s) => util(s.id)));
  return {
    servers,
    size,
    peak,
    shards: db?.shards ?? 1,
    dbUtil: util(db?.id),
    cache: of("cache")[0],
    workers: of("worker").length,
    cost: result.metrics.cost,
    knob: (id: string) => configs.custom?.[id],
    worst: result.metrics.worstSecond,
  };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Your one ${p.size.vcpu} vCPU server runs at ${pct(p.peak)} and the database at ${pct(p.dbUtil)}. A first gig is a few hundred people, so the boring design is the right one, and it costs ${usd(p.cost)} a month.`,
      "Nothing here can sell a seat twice yet, because nothing is concurrent yet. That is the trap: the bugs this lab is about only appear when many people want the same row.",
    ];
  },
  onsale(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Twenty times the traffic arrives for ten seconds. Your ${p.servers.length} servers share the browsing and holds behind the balancer, and Redis answers most seat-map reads so ${p.shards > 1 ? `${p.shards} database shards` : "the database"} only sees the misses and the writes.`,
      `The seat map is read far more than it is written, which is why caching it is cheap. Holds are writes and cannot be cached away: they are the part of the system that must scale for real. The whole design costs ${usd(p.cost)} a month.`,
      `The lesson is to size for the spike, not the average, but only for the ten seconds that matter. Autoscaling or a short-lived burst of capacity beats paying for peak all month.`,
    ];
  },
  waitroom(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Bots send 40,000 requests a second, ten times what real fans do. Your limiter at the front drops almost all of them before they reach your ${p.servers.length} servers, which then run at ${pct(p.peak)} instead of drowning.`,
      "Real fans are admitted from a virtual waiting room at a steady rate, so a person who is told 'you are number 3,200' stays and waits. A person shown an error refreshes, and a refresh is a new request.",
      "A waiting room protects the expensive part (holds and payments) and turns an unpredictable spike into a predictable stream.",
    ];
  },
  double(ctx: DebriefContext) {
    const p = parts(ctx);
    const k = p.knob("lock");
    const how =
      k === "redis"
        ? "Redis SET NX EX makes the claim one atomic call on a fast store, and the database only records the final booking."
        : "SELECT ... FOR UPDATE locks the seat row, so the second buyer waits for the first to finish and then sees the seat as taken.";
    return [
      `Your claim step is atomic. ${how} Two fans tapping F12 in the same millisecond now get one winner and one 'sorry, just taken'.`,
      "Optimistic versions look cheaper, but on a sale the best 200 seats attract thousands of racing claims. Almost all lose and retry, which multiplies traffic on exactly the hottest rows. Optimism works when conflicts are rare; here they are the norm.",
      `The unique constraint on bookings.seat_id is your safety net. Even if some future bug skips the lock, the database refuses the second booking. Total: ${usd(p.cost)} a month.`,
    ];
  },
  expiry(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Each hold lasts eight minutes: long enough to find a card, short enough that a fan who wandered off does not block the seat for an hour. A sweeper worker${p.workers > 1 ? "s" : ""} (you run ${p.workers}) release${p.workers > 1 ? "" : "s"} each seat the moment its time is up.`,
      "Releasing on read looks tempting and is wrong: a seat nobody views stays dark, and a page that says 'sold out' gets no refreshes to reveal the returned seats. Expiry is a time event, so a timer drives it, not traffic.",
      "The release job is idempotent: it frees a seat only if its held_until has passed and nobody paid. Running it twice does nothing the second time.",
    ];
  },
  payment(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `The provider slows to 800 ms and fails three charges in ten. Your ${p.workers} workers take charges off a queue, so checkout never waits on the provider, and a retry policy of backoff with jitter keeps failed attempts from piling onto an already struggling service.`,
      "Each charge carries the booking id as an idempotency key. A timeout does not mean the charge failed, so a retry could bill twice. With the key, the provider recognises the repeat and returns the first result.",
      `The seat stays held while a payment is pending, and the hold's expiry covers the worst case. Your payment path costs ${usd(p.cost)} a month in total, and the card is charged exactly once per seat.`,
    ];
  },
};
