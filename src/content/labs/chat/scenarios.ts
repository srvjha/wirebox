// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow, FlowIncident, NodeConfig } from "../../../sim";
import type { CustomCheckContext } from "../../../lib/lab/types";
import type { Spec } from "./graph";

/**
 * Traffic, knobs, checks and pass conditions for each canvas step of the chat
 * lab, plus the reference designs lab.test.ts proves against them.
 */

const lb = { kind: "lb" as const, optional: true };
const pubsub = { kind: "pubsub" as const, optional: true };
const store = { kind: "db" as const, missing: "Messages must be saved before they're acknowledged: wire the gateway to a database." };

const send = (rps: number, over: Partial<Flow> = {}): Flow => ({
  id: "send",
  label: "Send a 1:1 message",
  rps,
  write: true,
  connections: 250_000,
  route: [lb, { kind: "ws", missing: "Phones hold WebSocket connections open: put a WebSocket gateway behind Users (or your load balancer)." }, store, pubsub],
  ...over,
});
const group = (rps: number): Flow => ({
  id: "group",
  label: "Send a group message",
  rps,
  write: true,
  fanout: 8,
  route: [lb, { kind: "ws" }, store, pubsub],
});
const offline = (rps: number): Flow => ({
  id: "offline",
  label: "Push to phones that are offline",
  rps,
  write: true,
  workMs: 40,
  slaSeconds: 30,
  route: [
    lb,
    { kind: "ws" },
    { kind: "server", missing: "Offline pushes are decided by app logic, not the gateway: wire the gateway to an API server." },
    { kind: "db", missing: "Messages for offline users must be stored until they reconnect." },
    { kind: "queue", missing: "Push providers are slow and rate-limited. Put a queue between your app and them." },
    { kind: "worker", missing: "Nothing is pulling pushes off the queue: wire the queue to workers." },
    { kind: "external", missing: "Push notifications go through Apple and Google: wire the workers to a third-party provider." },
  ],
});
const receipts = (rps: number): Flow => ({
  id: "receipts",
  label: "Delivered / read receipts",
  rps,
  write: true,
  route: [lb, { kind: "ws" }, { kind: "cache", optional: true, cacheable: 1 }, { kind: "db" }],
});

const ORDER: CustomKnob = {
  id: "order",
  label: "Message order",
  help: "How a conversation decides which message came first.",
  default: "arrival",
  options: [
    { v: "arrival", label: "Order of arrival at the server", desc: "Two gateways, two networks: the order they land in isn't the order people sent." },
    { v: "clock", label: "Sender's phone clock", desc: "Phone clocks disagree by seconds, so messages jump around." },
    { v: "sequence", label: "Per-conversation sequence number", desc: "One writer numbers each conversation's messages 1, 2, 3. Different conversations stay parallel." },
  ],
};
const STORE: CustomKnob = {
  id: "undelivered",
  label: "Messages for offline users",
  help: "What happens when the recipient has no connection.",
  default: "drop",
  options: [
    { v: "drop", label: "Drop them", desc: "If you aren't connected, you miss it." },
    { v: "store", label: "Store, push, and sync on reconnect", desc: "Save the message, nudge the phone, and deliver everything missed when it reconnects." },
  ],
};
const RECEIPTS: CustomKnob = {
  id: "receipts",
  label: "Receipts",
  help: "How delivered/read ticks are recorded.",
  default: "each",
  options: [
    { v: "each", label: "Write every receipt to the database", desc: "Simple, exact, and twice as many writes as messages.", values: { hitRate: 0 } },
    { v: "batch", label: "Collect in Redis, flush in batches", desc: "Only the latest state per message reaches the database; most receipts merge away.", values: { hitRate: 0.95 } },
  ],
};

type K = Record<string, string>;
const bad = (ok: boolean, label: string, message: string) => ({ label, ok, message });
const checks = {
  order: (k: K) => bad(k.order === "sequence", "Every conversation reads in the order it was sent", "Messages can land out of order. Number each conversation's messages with a sequence number and sort by it, not by arrival or by phone clocks."),
  store: (k: K) => bad(k.undelivered === "store", "A message for an offline user is never lost", "Dropped messages are the worst bug a chat app can have. Store the message and deliver it when the user reconnects."),
};
const chk = (...fns: ((k: K) => ReturnType<typeof bad>)[]) => (ctx: CustomCheckContext) => fns.map((f) => f(ctx.knobs));
const labels = (...fns: ((k: K) => ReturnType<typeof bad>)[]) => fns.map((f) => f({}).label);

const ok99: Constraint = { type: "successRate", min: 0.99 };
const delivery: Constraint = { type: "delivery", min: 0.99 };
const DOWN: FlowIncident = { type: "down", kind: "ws", label: "A gateway dies" };

export type StepDef = {
  flows: Flow[];
  constraints: Constraint[];
  customKnobs?: CustomKnob[];
  customChecks?: (ctx: CustomCheckContext) => ReturnType<typeof bad>[];
  customCheckLabels?: string[];
  incident?: FlowIncident;
  incidentText?: string;
  nodeDefaults?: NodeConfig;
  healthChecks?: boolean;
};


export const DESIGN = {
  launch: {
    flows: [send(500, { connections: 20_000 })],
    constraints: [ok99, { type: "p99", maxMs: 150 }, { type: "budget", maxUsd: 500 }],
  },
  scale: {
    flows: [send(4_000)],
    constraints: [ok99, { type: "budget", maxUsd: 1_300 }],
  },
  pubsub: {
    flows: [send(4_000, { fanout: 1 }), group(300)],
    constraints: [ok99, delivery, { type: "budget", maxUsd: 1_500 }],
  },
  ordering: {
    flows: [send(4_000, { fanout: 1 }), group(300)],
    customKnobs: [ORDER],
    customChecks: chk(checks.order),
    customCheckLabels: labels(checks.order),
    constraints: [ok99, delivery, { type: "budget", maxUsd: 1_500 }],
  },
  offline: {
    flows: [send(4_000, { fanout: 1 }), group(300), offline(800)],
    customKnobs: [ORDER, STORE],
    customChecks: chk(checks.order, checks.store),
    customCheckLabels: labels(checks.order, checks.store),
    constraints: [ok99, delivery, { type: "asyncOnTime", min: 0.95 }, { type: "flowSuccess", flow: "offline", min: 0.99 }, { type: "budget", maxUsd: 2_000 }],
  },
  receipts: {
    flows: [send(4_000, { fanout: 1 }), group(300), offline(800), receipts(8_000)],
    customKnobs: [ORDER, STORE, RECEIPTS],
    customChecks: chk(checks.order, checks.store),
    customCheckLabels: labels(checks.order, checks.store),
    constraints: [ok99, delivery, { type: "flowSuccess", flow: "receipts", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 2_200 }],
  },
  failure: {
    flows: [send(4_000, { fanout: 1 }), group(300), offline(800), receipts(8_000)],
    customKnobs: [ORDER, STORE, RECEIPTS],
    customChecks: chk(checks.order, checks.store),
    customCheckLabels: labels(checks.order, checks.store),
    incident: DOWN,
    incidentText: "Five seconds in, one WebSocket gateway's host fails. Its connections drop and the phones start reconnecting.",
    healthChecks: true,
    constraints: [{ type: "everySecond", min: 0.85 }, { type: "recovery", maxSeconds: 6 }, { type: "delivery", min: 0.98 }, { type: "budget", maxUsd: 2_700 }],
  },
} satisfies Record<string, StepDef>;

export type StepId = keyof typeof DESIGN;

// ---------------------------------------------------------------- Reference designs (used by tests)

export const GOOD_KNOBS = { order: "sequence", undelivered: "store", receipts: "batch" };

type Design = { spec: Spec; knobs?: Record<string, string>; healthChecks?: boolean };
type Case = { pass: Design; fail: { why: string; design: Design; failing: string[] }[] };

const gw = (n: number, extra: Spec = {}): Spec => ({ entry: "ws", lb: 1, ws: n, db: 1, ...extra });
const withPubsub = (n: number, extra: Spec = {}): Spec => gw(n, { pubsub: 1, ...extra });
const withPush = (n: number, workers: number, extra: Spec = {}): Spec => withPubsub(n, { server: 1, queue: 1, worker: workers, external: 1, ...extra });
const withReceipts = (n: number, workers: number, extra: Spec = {}): Spec => withPush(n, workers, { cache: 1, ...extra });

export const REFERENCE: Record<StepId, Case> = {
  launch: {
    pass: { spec: { entry: "ws", ws: 1, db: 1 } },
    fail: [{ why: "no database: messages aren't saved", design: { spec: { entry: "ws", ws: 1 } }, failing: ["successRate"] }],
  },
  scale: {
    pass: { spec: gw(6) },
    fail: [{ why: "one gateway can't hold 250k connections", design: { spec: { entry: "ws", ws: 1, db: 1 } }, failing: ["successRate"] }],
  },
  pubsub: {
    pass: { spec: withPubsub(6) },
    fail: [{ why: "gateways with nothing between them", design: { spec: gw(6) }, failing: ["delivery"] }],
  },
  ordering: {
    pass: { spec: withPubsub(6), knobs: { order: "sequence" } },
    fail: [
      { why: "order by arrival", design: { spec: withPubsub(6), knobs: { order: "arrival" } }, failing: ["custom"] },
      { why: "order by phone clock", design: { spec: withPubsub(6), knobs: { order: "clock" } }, failing: ["custom"] },
    ],
  },
  offline: {
    pass: { spec: withPush(6, 6), knobs: { order: "sequence", undelivered: "store" } },
    fail: [
      { why: "pushing inline, no queue", design: { spec: withPubsub(6, { server: 1, external: 1 }), knobs: { order: "sequence", undelivered: "store" } }, failing: ["flowSuccess"] },
      { why: "one push worker", design: { spec: withPush(6, 1), knobs: { order: "sequence", undelivered: "store" } }, failing: ["asyncOnTime"] },
      { why: "drops messages for offline users", design: { spec: withPush(6, 6), knobs: { order: "sequence", undelivered: "drop" } }, failing: ["custom"] },
    ],
  },
  receipts: {
    pass: { spec: withReceipts(6, 6), knobs: GOOD_KNOBS },
    fail: [
      { why: "every receipt hits the database", design: { spec: withReceipts(6, 6), knobs: { ...GOOD_KNOBS, receipts: "each" } }, failing: ["flowSuccess"] },
      { why: "batching knob on but no Redis wired", design: { spec: withPush(6, 6), knobs: GOOD_KNOBS }, failing: ["flowSuccess"] },
    ],
  },
  failure: {
    pass: { spec: withReceipts(7, 6), knobs: GOOD_KNOBS, healthChecks: true },
    fail: [
      { why: "no health checks: the balancer keeps feeding the dead gateway", design: { spec: withReceipts(7, 6), knobs: GOOD_KNOBS }, failing: ["recovery"] },
      { why: "no spare gateway: survivors can't hold the reconnects", design: { spec: withReceipts(6, 6), knobs: GOOD_KNOBS, healthChecks: true }, failing: ["everySecond"] },
    ],
  },
};
