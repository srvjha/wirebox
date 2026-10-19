import { serverSize } from "../../../sim";
import type { DebriefContext } from "../../../lib/drill/types";

/** "Why it works" paragraphs, written from the learner's own passing design. */

const num = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${num(x)}`;

function parts(ctx: DebriefContext) {
  const { graph, result, configs } = ctx;
  const of = (k: string) => graph.nodes.filter((n) => n.kind === k);
  const servers = of("server");
  const db = of("db").find((d) => (d.role ?? "primary") === "primary");
  return {
    servers,
    size: serverSize(servers[0]?.size),
    shards: db?.shards ?? 1,
    workers: of("worker").length,
    cost: result.metrics.cost,
    knob: (id: string) => configs.custom?.[id],
  };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Your ${p.size.vcpu} vCPU server writes the payment, then calls the provider and waits for the answer. At 40 payments a second that is fine, and the whole thing costs ${usd(p.cost)} a month. The provider costs nothing to run but sets the pace: it is a 300 ms call you cannot speed up.`,
      "This design has two sleeping bugs. If the provider is slow, your server threads wait with it. And if the phone retries, nothing stops a second charge. The next steps wake them up one at a time.",
    ];
  },
  idempotency(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Every request carries an idempotency key, and you store it with the payment under a unique constraint, in the same transaction. A repeat inserts the same key, the database says no, and the server returns the first result instead of calling the provider again.`,
      "Disabling the button only helps humans. Network retries, proxies and a second open tab all bypass it. A Redis key helps for minutes and then forgets, so a retry after the cache expired would charge again. The database is the only place the key and the payment are written together.",
      `The cost is one unique index on ${p.shards > 1 ? `${p.shards} shards` : "one table"}: a few bytes per payment.`,
    ];
  },
  timeouts(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Checkout writes the payment as pending and puts a charge job on a queue. Your ${p.workers} workers do the slow call. When the provider takes 900 ms and fails three in ten, the queue absorbs it and web servers stay free.`,
      "Retries use exponential backoff with jitter, so failures spread out instead of coming back together as a retry storm. Combined with the idempotency key from the last step, a charge retried after a timeout is harmless: if the first call did go through, the provider returns that result.",
      `Slow calls hold a worker thread much longer, which is why a degraded provider needs many more workers than a healthy one. That is the ${usd(p.cost)} a month.`,
    ];
  },
  outbox(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      "The payment row and the event row are written in one transaction. Either both exist or neither does, so a crash between 'save' and 'announce' can no longer lose an event. A relay worker reads unpublished rows, publishes them, and marks them done.",
      "The relay can crash after publishing and before marking, so some events are delivered twice. That is why your consumers skip event ids they have already handled. At-least-once delivery plus idempotent consumers behaves like exactly-once.",
      `Health checks route around the crashed server, and the second of your ${p.servers.length} servers carries on. Cost: ${usd(p.cost)} a month.`,
    ];
  },
  ledger(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Every payment appends two ledger entries that sum to zero: a debit on one account, a credit on another. Nothing is ever updated. Because there is no single balance row to fight over, ${p.shards} shard${p.shards > 1 ? "s" : ""} share the writes evenly during the payout spike.`,
      "A balance column funnels every payment through one hot row per account. Adding shards cannot help, because all the contention is on one row, and the history of how it got there is gone. A ledger gives you history, audit and parallelism together.",
      `A balance is a query (SUM over entries) or a cached running total you can always rebuild. Total: ${usd(p.cost)} a month.`,
    ];
  },
  reconcile(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      "Every night a worker downloads the provider's settlement file and compares it with your ledger, payment by payment. The mismatches (a webhook that never arrived, a charge the provider made that you never recorded) become tickets while they are still small and findable.",
      "Even a perfect design has gaps: provider bugs, lost callbacks, a bad deploy. Reconciliation is the safety net that turns 'we think the books are right' into 'we checked'.",
      `The job is boring on purpose, ${p.workers} workers share the queue it uses, and the whole system costs ${usd(p.cost)} a month.`,
    ];
  },
};
