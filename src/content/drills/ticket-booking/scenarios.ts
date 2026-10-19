// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow, FlowIncident, Kind } from "../../../sim";
import type { CustomCheckContext, DesignStep, DrillGraph, DrillScenario } from "../../../lib/drill/types";
import type { Shape } from "./graph";

/**
 * Traffic, incidents and pass conditions for the canvas steps of the ticket-booking drill.
 * drill.test.ts proves each reference design passes and each tempting wrong one fails.
 */

const NONE = { reads: 0, writes: 0, attack: 0 };
const wired = (g: DrillGraph, from: Kind, to: Kind) =>
  g.edges.some((e) => g.nodes.find((n) => n.id === e.from)?.kind === from && g.nodes.find((n) => n.id === e.to)?.kind === to);
const has = (g: DrillGraph, k: Kind) => g.nodes.some((n) => n.kind === k);

const browse = (rps: number): Flow => ({
  id: "browse",
  label: "Browse the seat map",
  rps,
  route: [{ kind: "cdn", optional: true, cacheable: 0.7 }, { kind: "lb", optional: true }, { kind: "server" }, { kind: "cache", optional: true, cacheable: 0.9 }, { kind: "db" }],
});
const hold = (rps: number): Flow => ({
  id: "hold",
  label: "Hold a seat",
  rps,
  write: true,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }],
});
const bots: Flow = {
  id: "bots",
  label: "Reseller bots",
  rps: 40_000,
  legit: false,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }],
};
const expire: Flow = {
  id: "expire",
  label: "Release abandoned holds",
  rps: 200,
  write: true,
  workMs: 12,
  slaSeconds: 20,
  route: [{ kind: "server" }, { kind: "queue" }, { kind: "worker" }, { kind: "db" }],
};
const pay = (rps: number): Flow => ({
  id: "pay",
  label: "Take payment",
  rps,
  workMs: 40,
  slaSeconds: 30,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "queue", missing: "Payments go through a queue so a slow provider can't stall checkout: wire the servers to a Queue." }, { kind: "worker" }, { kind: "external", missing: "Workers charge the card through the payment provider: wire them to it." }],
});

const spike = (flows: string[]): FlowIncident => ({ type: "spike", multiplier: 20, flows, seconds: 10, label: "Tickets go on sale" });
const SPIKE_TEXT = "At 8 p.m. sharp the Arijit Singh tour goes on sale: browsing and holds jump twentyfold for ten seconds.";

const lockKnob: CustomKnob = {
  id: "lock",
  label: "Taking a seat",
  help: "How the database decides who wins when two buyers want the same seat.",
  default: "none",
  options: [
    { v: "none", label: "No lock", desc: "Read the seat, see it is free, write it. Two buyers can both read “free”." },
    { v: "optimistic", label: "Optimistic version", desc: "UPDATE ... WHERE version = n. The loser gets zero rows and must retry." },
    { v: "forupdate", label: "SELECT ... FOR UPDATE", desc: "Lock the seat row, check it, write it, release. Others wait their turn." },
    { v: "redis", label: "Redis hold with TTL", desc: "SET seat:42 buyer NX EX 480. One atomic call; Postgres only records the final booking." },
  ],
};
const ttlKnob: CustomKnob = {
  id: "ttl",
  label: "Hold lifetime",
  help: "How long a held seat stays reserved while the buyer pays.",
  default: "8m",
  options: [
    { v: "1m", label: "1 minute", desc: "Seats come back fast, but slow typists lose them mid-checkout." },
    { v: "8m", label: "8 minutes", desc: "Long enough to find a card, short enough that abandoned seats return." },
    { v: "60m", label: "60 minutes", desc: "Nobody loses a seat, and abandoned ones stay dark for an hour." },
  ],
};
const releaseKnob: CustomKnob = {
  id: "release",
  label: "Releasing expired holds",
  help: "What turns an expired hold back into an available seat.",
  default: "never",
  options: [
    { v: "never", label: "Nothing", desc: "Expired holds stay held until someone fixes the row by hand." },
    { v: "lazy", label: "Check when read", desc: "A seat is treated as free only when someone looks at it." },
    { v: "sweeper", label: "Worker sweeps on TTL", desc: "A background job releases each hold the moment it expires." },
  ],
};
const admitKnob: CustomKnob = {
  id: "admission",
  label: "Over the limit",
  help: "What a fan sees when the system can only let so many in.",
  default: "reject",
  options: [
    { v: "reject", label: "Error page (429)", desc: "Everyone over the limit is bounced. Real fans hit refresh and make it worse." },
    { v: "room", label: "Virtual waiting room", desc: "Fans get a place in line and are admitted at a steady rate." },
  ],
};
const retryKnob: CustomKnob = {
  id: "retries",
  label: "When the provider fails",
  help: "How the payment workers retry a charge that timed out.",
  default: "immediate",
  options: [
    { v: "immediate", label: "Retry at once", desc: "Every failure comes straight back, on top of fresh traffic.", values: { retries: 0.5 } },
    { v: "backoff", label: "Backoff + jitter", desc: "Wait 1s, 2s, 4s... with random jitter, a few tries then park it.", values: { retries: 0.1 } },
  ],
};
const idemKnob: CustomKnob = {
  id: "idem",
  label: "Charge requests",
  help: "What a retried charge does at the payment provider.",
  default: "plain",
  options: [
    { v: "plain", label: "Plain charge", desc: "A retry after a timeout can charge the card a second time." },
    { v: "key", label: "Idempotency key", desc: "The booking id rides along; the provider returns the first result for a repeat." },
  ],
};

const ok99: Constraint = { type: "successRate", min: 0.99 };
const fast: Constraint = { type: "p99", maxMs: 200 };

type Def = {
  scenario: DrillScenario;
  flows: Flow[];
  constraints: Constraint[];
  incident?: FlowIncident;
  incidentText?: string;
  nodeDefaults?: DesignStep["nodeDefaults"];
  customKnobs?: CustomKnob[];
  customChecks?: DesignStep["customChecks"];
  customCheckLabels?: string[];
};

const ND = { external: { cap: 1_500 }, cdn: { hitRate: 0.95 } };
const lockChecks = (c: CustomCheckContext) => [
  {
    label: "No seat is ever sold twice",
    ok: c.knobs.lock !== "none",
    message: "With no lock, two buyers read “free” at the same instant and both write. Pick a way to make the claim atomic.",
  },
  {
    label: "Hot seats don't thrash",
    ok: c.knobs.lock !== "optimistic",
    message: "On a sale the best 200 seats draw thousands of simultaneous claims. Optimistic versions make all but one lose and retry, which multiplies the traffic on exactly the rows that are already hot.",
  },
  {
    label: "A Redis hold has Redis behind it",
    ok: c.knobs.lock !== "redis" || wired(c.graph, "server", "cache"),
    message: "You chose Redis holds, but no server is wired to a Redis node. Add one.",
  },
];
const roomChecks = (c: CustomCheckContext) => [
  {
    label: "Fans in line are never bounced",
    ok: c.knobs.admission === "room" && has(c.graph, "limiter"),
    message: has(c.graph, "limiter")
      ? "A 429 page sends fans straight back to refresh. Admit them from a waiting room at a steady rate instead."
      : "Put a limiter at the front, and queue fans in a waiting room rather than bouncing them.",
  },
];
const expiryChecks = (c: CustomCheckContext) => [
  ...lockChecks(c),
  {
    label: "Holds outlive a checkout, not a coffee break",
    ok: c.knobs.ttl === "8m",
    message: c.knobs.ttl === "1m" ? "One minute is shorter than finding a card; buyers lose seats mid-payment." : "An hour-long hold lets abandoned carts block real buyers while the show shows sold out.",
  },
  {
    label: "Expired seats go back on sale",
    ok: c.knobs.release === "sweeper",
    message: c.knobs.release === "never" ? "Nothing releases expired holds, so every abandoned cart removes a seat for good." : "Checking on read means a seat nobody looks at stays dark, and a sold-out page that nobody refreshes never reveals the returned seats. Release them with a worker.",
  },
];
const payChecks = (c: CustomCheckContext) => [
  ...expiryChecks(c),
  {
    label: "A retried charge never bills twice",
    ok: c.knobs.idem === "key",
    message: "A timeout does not mean the charge failed. A plain retry can bill the card twice. Send the booking id as an idempotency key.",
  },
];

export const DESIGN = {
  launch: {
    scenario: { label: "First gig", load: NONE },
    flows: [browse(150), hold(15)],
    constraints: [ok99, fast, { type: "budget", maxUsd: 450 }],
  },
  onsale: {
    scenario: { label: "On-sale spike", load: NONE },
    flows: [browse(1_500), hold(300)],
    incident: spike(["browse", "hold"]),
    incidentText: SPIKE_TEXT,
    nodeDefaults: ND,
    constraints: [{ type: "everySecond", min: 0.97 }, { type: "flowSuccess", flow: "hold", min: 0.99 }, { type: "budget", maxUsd: 2_200 }],
  },
  waitroom: {
    scenario: { label: "Bots arrive", load: NONE },
    flows: [browse(1_500), hold(300), bots],
    incident: spike(["browse", "hold"]),
    incidentText: SPIKE_TEXT + " Resellers' bots start hammering the hold endpoint at 40,000 requests a second.",
    nodeDefaults: ND,
    customKnobs: [admitKnob],
    customChecks: roomChecks,
    customCheckLabels: ["Fans in line are never bounced"],
    constraints: [{ type: "everySecond", min: 0.97 }, { type: "flowSuccess", flow: "hold", min: 0.99 }, { type: "budget", maxUsd: 2_600 }],
  },
  double: {
    scenario: { label: "Same seat, same instant", load: NONE },
    flows: [browse(1_500), hold(300), bots],
    incident: spike(["browse", "hold"]),
    incidentText: SPIKE_TEXT + " Twelve hundred fans go for the same 200 front-row seats.",
    nodeDefaults: ND,
    customKnobs: [admitKnob, lockKnob],
    customChecks: (c) => [...roomChecks(c), ...lockChecks(c)],
    customCheckLabels: ["Fans in line are never bounced", "No seat is ever sold twice", "Hot seats don't thrash", "A Redis hold has Redis behind it"],
    constraints: [{ type: "everySecond", min: 0.97 }, { type: "flowSuccess", flow: "hold", min: 0.99 }, { type: "budget", maxUsd: 2_800 }],
  },
  expiry: {
    scenario: { label: "Abandoned carts", load: NONE },
    flows: [browse(1_500), hold(300), bots, expire],
    incident: spike(["browse", "hold"]),
    incidentText: SPIKE_TEXT + " Half the holds are never paid for, and each must come back on sale.",
    nodeDefaults: ND,
    customKnobs: [admitKnob, lockKnob, ttlKnob, releaseKnob],
    customChecks: (c) => [...roomChecks(c), ...expiryChecks(c)],
    customCheckLabels: ["Fans in line are never bounced", "No seat is ever sold twice", "Hot seats don't thrash", "A Redis hold has Redis behind it", "Holds outlive a checkout, not a coffee break", "Expired seats go back on sale"],
    constraints: [{ type: "everySecond", min: 0.97 }, { type: "flowSuccess", flow: "hold", min: 0.99 }, { type: "flowSuccess", flow: "expire", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 3_400 }],
  },
  payment: {
    scenario: { label: "The provider slows down", load: NONE },
    flows: [browse(1_500), hold(300), bots, expire, pay(60)],
    incident: { type: "slow", kind: "external", ms: 800, failRate: 0.3, label: "Payment provider degrades" },
    incidentText: "Mid-sale the payment provider starts answering in 800 ms and failing three charges in ten.",
    nodeDefaults: ND,
    customKnobs: [admitKnob, lockKnob, ttlKnob, releaseKnob, retryKnob, idemKnob],
    customChecks: (c) => [...roomChecks(c), ...payChecks(c)],
    customCheckLabels: ["Fans in line are never bounced", "No seat is ever sold twice", "Hot seats don't thrash", "A Redis hold has Redis behind it", "Holds outlive a checkout, not a coffee break", "Expired seats go back on sale", "A retried charge never bills twice"],
    constraints: [{ type: "flowSuccess", flow: "pay", min: 0.98 }, { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 20 }, { type: "budget", maxUsd: 4_200 }],
  },
} satisfies Record<string, Def>;

// ---------------------------------------------------------------- Reference designs (used by tests)

const GOOD_KNOBS = { admission: "room", lock: "forupdate", ttl: "8m", release: "sweeper", retries: "backoff", idem: "key" };

type Case = { shape: Shape; knobs?: Record<string, string> };
export const REFERENCE: Record<keyof typeof DESIGN, { pass: Case; fail: { why: string; case: Case; failing: string[] }[] }> = {
  launch: {
    pass: { shape: { servers: 1, size: "s" } },
    fail: [{ why: "a big, fancy stack is a budget bust for a 400-seat gig", case: { shape: { lb: true, servers: 3, size: "xl", cache: true } }, failing: ["budget"] }],
  },
  onsale: {
    pass: { shape: { lb: true, servers: 4, size: "m", cache: true, shards: 2 } },
    fail: [
      { why: "one small server and one database melt under 20x", case: { shape: { servers: 1, size: "s" } }, failing: ["everySecond", "flowSuccess"] },
      { why: "scaling servers alone leaves the database to take every seat-map read", case: { shape: { lb: true, servers: 4, size: "m" } }, failing: ["flowSuccess"] },
    ],
  },
  waitroom: {
    pass: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2 }, knobs: { admission: "room" } },
    fail: [
      { why: "no limiter: bots eat the servers", case: { shape: { lb: true, servers: 4, size: "m", cache: true, shards: 2 }, knobs: { admission: "room" } }, failing: ["flowSuccess"] },
      { why: "limiter that bounces fans with 429s", case: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2 }, knobs: { admission: "reject" } }, failing: ["custom"] },
    ],
  },
  double: {
    pass: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2 }, knobs: { admission: "room", lock: "forupdate" } },
    fail: [
      { why: "no lock double-books", case: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2 }, knobs: { admission: "room", lock: "none" } }, failing: ["custom"] },
      { why: "optimistic versions thrash on hot seats", case: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2 }, knobs: { admission: "room", lock: "optimistic" } }, failing: ["custom"] },
    ],
  },
  expiry: {
    pass: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2, queue: true, workers: 1 }, knobs: { admission: "room", lock: "forupdate", ttl: "8m", release: "sweeper" } },
    fail: [
      { why: "expired holds never release", case: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2, queue: true, workers: 1 }, knobs: { admission: "room", lock: "forupdate", ttl: "8m", release: "never" } }, failing: ["custom"] },
      { why: "no queue or worker to release holds", case: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2 }, knobs: { admission: "room", lock: "forupdate", ttl: "8m", release: "sweeper" } }, failing: ["flowSuccess"] },
      { why: "a 60-minute hold blocks real buyers", case: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2, queue: true, workers: 1 }, knobs: { admission: "room", lock: "forupdate", ttl: "60m", release: "sweeper" } }, failing: ["custom"] },
    ],
  },
  payment: {
    pass: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2, queue: true, workers: 12, external: true }, knobs: GOOD_KNOBS },
    fail: [
      { why: "immediate retries hammer a failing provider", case: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2, queue: true, workers: 12, external: true }, knobs: { ...GOOD_KNOBS, retries: "immediate" } }, failing: ["asyncOnTime"] },
      { why: "a plain retry can bill twice", case: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2, queue: true, workers: 12, external: true }, knobs: { ...GOOD_KNOBS, idem: "plain" } }, failing: ["custom"] },
      { why: "too few workers can't keep up with a slow provider", case: { shape: { limiter: true, lb: true, servers: 4, size: "m", cache: true, shards: 2, queue: true, workers: 2, external: true }, knobs: GOOD_KNOBS }, failing: ["asyncOnTime"] },
    ],
  },
};
