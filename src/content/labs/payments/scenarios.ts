// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow, FlowIncident } from "../../../sim";
import type { CustomCheckContext, DesignStep, LabScenario } from "../../../lib/lab/types";
import type { Shape } from "./graph";

/**
 * Traffic, incidents and pass conditions for the canvas steps of the payments lab.
 * lab.test.ts proves each reference design passes and each tempting wrong one fails.
 */

const NONE = { reads: 0, writes: 0, attack: 0 };

const MISSING_Q = "Charges go through a queue so a slow provider can't stall checkout: wire the servers to a Queue.";
const MISSING_P = "Workers call the payment provider: wire them to it.";

const syncCharge = (rps: number): Flow => ({
  id: "charge",
  label: "Charge a card",
  rps,
  write: true,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }, { kind: "external", missing: "Charging a card means calling the payment provider: wire the servers to it." }],
});
const asyncCharge = (rps: number): Flow => ({
  id: "charge",
  label: "Charge a card",
  rps,
  write: true,
  workMs: 40,
  slaSeconds: 30,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }, { kind: "queue", missing: MISSING_Q }, { kind: "worker" }, { kind: "external", missing: MISSING_P }],
});
const dupes = (rps: number): Flow => ({
  id: "dupes",
  label: "Double taps and retries",
  rps,
  write: true,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }],
});
const events: Flow = {
  id: "events",
  label: "Publish payment events",
  rps: 80,
  write: true,
  workMs: 12,
  slaSeconds: 20,
  route: [{ kind: "server" }, { kind: "queue", missing: "Events travel through a queue: wire the servers to one." }, { kind: "worker" }, { kind: "db" }],
};
const settle: Flow = {
  id: "settle",
  label: "Post ledger entries",
  rps: 1_000,
  write: true,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }],
};
const recon: Flow = {
  id: "recon",
  label: "Reconcile with the provider",
  rps: 40,
  workMs: 160,
  slaSeconds: 120,
  route: [{ kind: "server" }, { kind: "queue", missing: "The reconciliation job runs off a queue: wire the servers to one." }, { kind: "worker" }, { kind: "db" }, { kind: "external" }],
};

const idemKnob: CustomKnob = {
  id: "dedupe",
  label: "Duplicate requests",
  help: "What the server does when the same payment request arrives twice.",
  default: "none",
  options: [
    { v: "none", label: "Treat as new", desc: "Each request is a new payment. A retry charges again." },
    { v: "button", label: "Disable the button", desc: "The app greys out Pay after a tap. Retries from the network layer still repeat it." },
    { v: "cache", label: "Key in Redis, 5 minutes", desc: "Remember the Idempotency-Key in memory for a while." },
    { v: "db", label: "Key in the database, unique", desc: "INSERT the key with the payment in one transaction. A second insert fails and returns the first result." },
  ],
};
const retryKnob: CustomKnob = {
  id: "retries",
  label: "When the provider fails",
  help: "How workers retry a charge that timed out or failed.",
  default: "immediate",
  options: [
    { v: "immediate", label: "Retry at once", desc: "Every failure comes straight back on top of new traffic.", values: { retries: 0.5 } },
    { v: "backoff", label: "Backoff + jitter", desc: "Wait 1s, 2s, 4s with random jitter, then park it for a human.", values: { retries: 0.1 } },
  ],
};
const eventsKnob: CustomKnob = {
  id: "publish",
  label: "Announcing a payment",
  help: "How 'payment succeeded' reaches the rest of the company.",
  default: "dual",
  options: [
    { v: "dual", label: "Write DB, then publish", desc: "Two separate steps. A crash between them loses the event." },
    { v: "outbox", label: "Outbox table + relay", desc: "Insert the event in the same transaction as the payment; a relay publishes it." },
  ],
};
const consumerKnob: CustomKnob = {
  id: "consumer",
  label: "Consumers of events",
  help: "What the receiver does with an event it has already seen.",
  default: "trust",
  options: [
    { v: "trust", label: "Process every delivery", desc: "Assume each event arrives exactly once." },
    { v: "dedupe", label: "Skip seen event ids", desc: "Record processed ids; a redelivery changes nothing." },
  ],
};
const ledgerKnob: CustomKnob = {
  id: "ledger",
  label: "Recording money",
  help: "How the system stores who owns what.",
  default: "balance",
  appliesTo: "db",
  options: [
    { v: "balance", label: "Balance column", desc: "UPDATE accounts SET balance = balance - x. One hot row per account, no history.", values: { skew: 0.9 } },
    { v: "append", label: "Append-only ledger", desc: "INSERT two entries, debit and credit, that sum to zero. Balance = SUM, history is permanent.", values: { skew: 0.0 } },
  ],
};
const reconKnob: CustomKnob = {
  id: "recon",
  label: "Checking your books",
  help: "How you find out your records disagree with the provider's.",
  default: "none",
  options: [
    { v: "none", label: "Trust the callbacks", desc: "If a webhook was lost, nobody ever knows." },
    { v: "manual", label: "Finance checks monthly", desc: "A person compares spreadsheets once a month." },
    { v: "nightly", label: "Nightly reconciliation job", desc: "Compare the provider's settlement file to the ledger every night; open a ticket for each mismatch." },
  ],
};

const ok99: Constraint = { type: "successRate", min: 0.99 };
const ND = { external: { cap: 1_500 } };

const checks = (c: CustomCheckContext, upto: number) =>
  [
    { label: "A repeated request never charges twice", ok: c.knobs.dedupe === "db", message: dedupeMsg(c.knobs.dedupe) },
    { label: "A retried charge is safe at the provider", ok: c.knobs.retries === "backoff" && c.knobs.dedupe === "db", message: "Backoff with jitter keeps retries gentle, and the idempotency key makes each one harmless. You need both." },
    { label: "No payment event is ever lost", ok: c.knobs.publish === "outbox", message: "Writing the row and publishing the event are two steps. A crash between them leaves a paid order nobody hears about. Put the event in an outbox table in the same transaction." },
    { label: "A redelivered event changes nothing", ok: c.knobs.consumer === "dedupe", message: "An outbox relay delivers at least once, so duplicates will come. Receivers must skip event ids they have already handled." },
    { label: "Money is never overwritten", ok: c.knobs.ledger === "append", message: "A balance column keeps no history and funnels every payment through one hot row. Append two ledger entries per payment instead." },
    { label: "Disagreements are found within a day", ok: c.knobs.recon === "nightly", message: "Webhooks get lost and providers make mistakes. A nightly job comparing settlement files to your ledger finds the gap while it is small." },
  ].slice(0, upto);

function dedupeMsg(k?: string) {
  if (k === "button") return "A disabled button stops a human, not a network retry, a double-submitted form or a second device. The server has to recognise the repeat.";
  if (k === "cache") return "Redis forgets on restart and after five minutes, so a late retry sails through. Store the key in the same database transaction as the payment, under a unique constraint.";
  return "Every request is treated as new, so a double tap bills twice. Send an Idempotency-Key and store it uniquely with the payment.";
}

type Def = {
  scenario: LabScenario;
  flows: Flow[];
  constraints: Constraint[];
  incident?: FlowIncident;
  incidentText?: string;
  nodeDefaults?: DesignStep["nodeDefaults"];
  customKnobs?: CustomKnob[];
  customChecks?: DesignStep["customChecks"];
  customCheckLabels?: string[];
};
const labels = (upto: number, from = 0) => checks({ knobs: {} } as CustomCheckContext, upto).slice(from).map((c) => c.label);

export const DESIGN = {
  launch: {
    scenario: { label: "First payments", load: NONE },
    flows: [syncCharge(40)],
    nodeDefaults: ND,
    constraints: [ok99, { type: "budget", maxUsd: 450 }],
  },
  idempotency: {
    scenario: { label: "Double taps", load: NONE },
    flows: [syncCharge(200), dupes(40)],
    nodeDefaults: ND,
    customKnobs: [idemKnob],
    customChecks: (c) => checks(c, 1),
    customCheckLabels: labels(1),
    constraints: [ok99, { type: "budget", maxUsd: 700 }],
  },
  timeouts: {
    scenario: { label: "Provider timeouts", load: NONE },
    flows: [asyncCharge(80), dupes(16)],
    incident: { type: "slow", kind: "external", ms: 900, failRate: 0.3, label: "Payment provider degrades" },
    incidentText: "The provider starts answering in 900 ms and failing three charges in ten. You cannot know whether a timed-out charge went through.",
    nodeDefaults: ND,
    customKnobs: [idemKnob, retryKnob],
    customChecks: (c) => checks(c, 2),
    customCheckLabels: labels(2),
    constraints: [{ type: "flowSuccess", flow: "charge", min: 0.98 }, { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 20 }, { type: "budget", maxUsd: 2_600 }],
  },
  outbox: {
    scenario: { label: "Lost events", load: NONE },
    flows: [asyncCharge(80), dupes(16), events],
    incident: { type: "down", kind: "server", label: "A server crashes mid-payment" },
    incidentText: "A server crashes between saving a payment and announcing it. Invoices, emails and the ledger all hang off that announcement.",
    nodeDefaults: ND,
    customKnobs: [idemKnob, retryKnob, eventsKnob, consumerKnob],
    customChecks: (c) => checks(c, 4),
    customCheckLabels: labels(4),
    constraints: [{ type: "recovery", maxSeconds: 5 }, { type: "asyncOnTime", min: 0.95 }, { type: "flowSuccess", flow: "events", min: 0.9 }, { type: "budget", maxUsd: 2_800 }],
  },
  ledger: {
    scenario: { label: "Payout day", load: NONE },
    flows: [asyncCharge(80), dupes(16), events, settle],
    incident: { type: "spike", multiplier: 10, flows: ["settle"], seconds: 12, label: "Organiser payouts" },
    incidentText: "At midnight Gatepass pays out every organiser. Ledger postings jump tenfold for twelve seconds.",
    nodeDefaults: ND,
    customKnobs: [idemKnob, retryKnob, eventsKnob, consumerKnob, ledgerKnob],
    customChecks: (c) => checks(c, 5),
    customCheckLabels: labels(5),
    constraints: [{ type: "everySecond", min: 0.97 }, { type: "flowSuccess", flow: "settle", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 3_200 }],
  },
  reconcile: {
    scenario: { label: "The books disagree", load: NONE },
    flows: [asyncCharge(80), dupes(16), events, settle, recon],
    nodeDefaults: ND,
    customKnobs: [idemKnob, retryKnob, eventsKnob, consumerKnob, ledgerKnob, reconKnob],
    customChecks: (c) => checks(c, 6),
    customCheckLabels: labels(6),
    constraints: [{ type: "flowSuccess", flow: "recon", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 3_400 }],
  },
} satisfies Record<string, Def>;

// ---------------------------------------------------------------- Reference designs (used by tests)

type Case = { shape: Shape; knobs?: Record<string, string>; healthChecks?: boolean };
export const KNOBS_ALL = { dedupe: "db", retries: "backoff", publish: "outbox", consumer: "dedupe", ledger: "append", recon: "nightly" };
const SYNC: Shape = { servers: 1, size: "s", external: true, directExternal: true };
const ASYNC: Shape = { lb: true, servers: 2, size: "m", queue: true, workers: 13, external: true };
const WITH_EVENTS: Shape = { ...ASYNC, workers: 14 };
const SHARDED: Shape = { ...WITH_EVENTS, shards: 2 };

export const REFERENCE: Record<keyof typeof DESIGN, { pass: Case; fail: { why: string; case: Case; failing: string[] }[] }> = {
  launch: {
    pass: { shape: SYNC },
    fail: [
      { why: "forgetting the provider means no payment ever completes", case: { shape: { servers: 1, size: "s" } }, failing: ["successRate"] },
      { why: "a big redundant stack is over budget for 40 payments a second", case: { shape: { ...ASYNC, servers: 4, size: "xl", shards: 3 } }, failing: ["budget"] },
    ],
  },
  idempotency: {
    pass: { shape: SYNC, knobs: { dedupe: "db" } },
    fail: [
      { why: "treating a repeat as new double-charges", case: { shape: SYNC, knobs: { dedupe: "none" } }, failing: ["custom"] },
      { why: "a disabled button does not stop network retries", case: { shape: SYNC, knobs: { dedupe: "button" } }, failing: ["custom"] },
      { why: "a Redis key is forgotten after five minutes", case: { shape: SYNC, knobs: { dedupe: "cache" } }, failing: ["custom"] },
    ],
  },
  timeouts: {
    pass: { shape: ASYNC, knobs: { dedupe: "db", retries: "backoff" } },
    fail: [
      { why: "calling the provider inline stalls checkout", case: { shape: SYNC, knobs: { dedupe: "db", retries: "backoff" } }, failing: ["flowSuccess"] },
      { why: "immediate retries pile onto a failing provider", case: { shape: ASYNC, knobs: { dedupe: "db", retries: "immediate" } }, failing: ["custom", "asyncOnTime"] },
      { why: "too few workers cannot absorb slow calls", case: { shape: { ...ASYNC, workers: 2 }, knobs: { dedupe: "db", retries: "backoff" } }, failing: ["asyncOnTime"] },
    ],
  },
  outbox: {
    pass: { shape: WITH_EVENTS, healthChecks: true, knobs: { dedupe: "db", retries: "backoff", publish: "outbox", consumer: "dedupe" } },
    fail: [
      { why: "write-then-publish loses events on a crash", case: { shape: WITH_EVENTS, healthChecks: true, knobs: { dedupe: "db", retries: "backoff", publish: "dual", consumer: "dedupe" } }, failing: ["custom"] },
      { why: "consumers must skip duplicate deliveries", case: { shape: WITH_EVENTS, healthChecks: true, knobs: { dedupe: "db", retries: "backoff", publish: "outbox", consumer: "trust" } }, failing: ["custom"] },
      { why: "a single server cannot recover from its own crash", case: { shape: { ...WITH_EVENTS, lb: false, servers: 1 }, healthChecks: true, knobs: { dedupe: "db", retries: "backoff", publish: "outbox", consumer: "dedupe" } }, failing: ["recovery"] },
    ],
  },
  ledger: {
    pass: { shape: SHARDED, knobs: { dedupe: "db", retries: "backoff", publish: "outbox", consumer: "dedupe", ledger: "append" } },
    fail: [
      { why: "a hot balance row throttles payouts no matter how many shards", case: { shape: { ...WITH_EVENTS, shards: 8 }, knobs: { dedupe: "db", retries: "backoff", publish: "outbox", consumer: "dedupe", ledger: "balance" } }, failing: ["custom", "flowSuccess"] },
      { why: "one database cannot post 6,000 entries a second", case: { shape: WITH_EVENTS, knobs: { dedupe: "db", retries: "backoff", publish: "outbox", consumer: "dedupe", ledger: "append" } }, failing: ["flowSuccess"] },
    ],
  },
  reconcile: {
    pass: { shape: SHARDED, knobs: KNOBS_ALL },
    fail: [
      { why: "trusting webhooks never finds lost payments", case: { shape: SHARDED, knobs: { ...KNOBS_ALL, recon: "none" } }, failing: ["custom"] },
      { why: "monthly spreadsheets find gaps too late", case: { shape: SHARDED, knobs: { ...KNOBS_ALL, recon: "manual" } }, failing: ["custom"] },
      { why: "the job needs a queue, worker and provider wired in", case: { shape: { servers: 2, size: "m", lb: true, shards: 2, external: true }, knobs: KNOBS_ALL }, failing: ["flowSuccess"] },
    ],
  },
};
