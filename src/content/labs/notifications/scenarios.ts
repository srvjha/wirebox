// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow } from "../../../sim";
import type { CustomCheckContext, DesignStep, LabConfigs, LabGraph, LabNode } from "../../../lib/lab/types";
import { DEFAULT_CONFIGS } from "../../../lib/lab/run";

/**
 * Traffic, knobs, incidents and pass conditions for each canvas step of the notification lab.
 * lab.test.ts proves every reference design passes and the tempting wrong ones fail.
 */

type StepData = Pick<
  DesignStep,
  "scenario" | "constraints" | "flows" | "incident" | "incidentText" | "customKnobs" | "customChecks" | "customCheckLabels" | "nodeDefaults"
>;

const EMPTY = { label: "", load: { reads: 0, writes: 0, attack: 0 } };
const ok = (min: number): Constraint => ({ type: "successRate", min });
/** The email/SMS provider's contract: 1,500 sends a second. */
const PROVIDER = { external: { cap: 1_500 } };

// ---------------------------------------------------------------- Flows

/** Launch: the API calls the provider and waits for it. */
const inlineSend = (rps: number): Flow => ({
  id: "tickets",
  label: "Ticket confirmations",
  rps,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "external", missing: "Emails go out through a provider: wire the API server to the Third-party API." }],
});

const queued = (id: string, label: string, rps: number, sla: number, dedup = false): Flow => ({
  id,
  label,
  rps,
  slaSeconds: sla,
  workMs: 20,
  route: [
    { kind: "lb", optional: true },
    { kind: "server" },
    { kind: "queue", missing: "Sending is slow and rate-limited. Put each message on a Queue and let workers deliver it." },
    { kind: "worker" },
    ...(dedup ? [{ kind: "db" as const, missing: "Workers need somewhere to record what they've already sent: wire them to the database." }] : []),
    { kind: "external", missing: "Workers deliver through the provider: wire them to the Third-party API." },
  ],
  write: dedup || undefined,
});

const tickets = (rps: number, dedup = false) => queued("tickets", "Ticket confirmations", rps, 30, dedup);
const blast = (rps: number, dedup = false) => queued("blast", "Festival announcement", rps, 300, dedup);
const codes = (rps: number, dedup = false) => queued("codes", "Login codes and door alerts", rps, 5, dedup);

// ---------------------------------------------------------------- Knobs

const retries: CustomKnob = {
  id: "retries",
  label: "When a send fails",
  help: "What a worker does when the provider errors or times out.",
  default: "none",
  appliesTo: "worker",
  options: [
    { v: "none", label: "Drop it", desc: "Log the error and move on. Some messages are simply lost.", values: { retries: 0.5 } },
    { v: "immediate", label: "Retry immediately", desc: "Try again at once, up to five times. A struggling provider gets everything twice.", values: { retries: 0.5 } },
    { v: "backoff", label: "Retry with exponential backoff", desc: "Wait 1 s, 2 s, 4 s … with a little random jitter. Gives the provider room to recover.", values: { retries: 0.1 } },
  ],
};

const dedup: CustomKnob = {
  id: "dedup",
  label: "Duplicate protection",
  help: "What stops a retried job from sending the same message twice.",
  default: "none",
  appliesTo: "worker",
  options: [
    { v: "none", label: "Nothing", desc: "A retry is a brand-new send." },
    { v: "lookup", label: "Look up, then send", desc: "Check “already sent?” and send if not. Two workers can both see “no” at the same moment." },
    { v: "claim", label: "Claim the message id first", desc: "Insert the id under a unique constraint before sending. Only one worker can win the insert." },
  ],
};

// ---------------------------------------------------------------- Checks

const queues = (g: LabGraph) => g.nodes.filter((n) => n.kind === "queue");
const workersOf = (g: LabGraph, queue: LabNode) =>
  g.edges.filter((e) => e.from === queue.id && g.nodes.find((n) => n.id === e.to)?.kind === "worker").map((e) => e.to);

const lanes = ({ graph }: CustomCheckContext) => {
  const qs = queues(graph);
  const sets = qs.map((q) => workersOf(graph, q));
  const shared = sets.some((a, i) => sets.some((b, j) => i !== j && a.some((w) => b.includes(w))));
  return [
    {
      label: "Login codes have their own lane",
      ok: qs.length >= 2 && sets.every((s) => s.length > 0) && !shared,
      message:
        qs.length < 2
          ? "Login codes and the festival blast share one queue: a code sits behind a million announcements. Add a second queue with its own workers for urgent messages."
          : shared
            ? "Both queues feed the same workers, so a backlog still delays codes. Give each queue its own workers."
            : "Each queue needs at least one worker of its own.",
    },
  ];
};

const delivery = ({ knobs }: CustomCheckContext) => [
  {
    label: "No message is lost to a failed send",
    ok: knobs.retries === "backoff" || knobs.retries === "immediate",
    message: "A failed send is dropped. The provider has bad minutes; without retries, a few percent of ticket confirmations simply never arrive.",
  },
];

const duplicates = ({ knobs }: CustomCheckContext) => [
  {
    label: "A retried message is never sent twice",
    ok: knobs.dedup === "claim",
    message:
      knobs.dedup === "lookup"
        ? "Look-then-send has a gap: two workers (or a retry after a timeout the provider actually completed) can both see “not sent” and both send. Claim the id atomically before sending."
        : "Retries are new sends. A timeout after the provider already delivered means the fan gets the same text twice, or ten times.",
  },
];

// ---------------------------------------------------------------- Steps

const slow = { type: "slow", kind: "external", ms: 60, failRate: 0.25, label: "Provider degraded" } as const;

export const DESIGN = {
  launch: {
    scenario: { ...EMPTY, label: "Launch week" },
    flows: [inlineSend(40)],
    nodeDefaults: PROVIDER,
    constraints: [ok(0.999), { type: "p99", maxMs: 1_700 }, { type: "budget", maxUsd: 250 }],
  },
  blast: {
    scenario: { ...EMPTY, label: "Festival announcement" },
    flows: [tickets(100), blast(450)],
    nodeDefaults: PROVIDER,
    constraints: [ok(0.999), { type: "p99", maxMs: 300 }, { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 20 }, { type: "budget", maxUsd: 700 }],
  },
  slow: {
    scenario: { ...EMPTY, label: "Provider has a bad day" },
    flows: [tickets(100), blast(450)],
    nodeDefaults: PROVIDER,
    customKnobs: [retries],
    customChecks: (ctx) => delivery(ctx),
    customCheckLabels: ["No message is lost to a failed send"],
    incident: slow,
    incidentText: "Five seconds in, the email and SMS provider degrades: every call takes longer and a quarter of them fail.",
    constraints: [ok(0.999), { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 30 }, { type: "budget", maxUsd: 1_200 }],
  },
  lanes: {
    scenario: { ...EMPTY, label: "A campaign meets the login codes" },
    flows: [codes(150), tickets(100), blast(450)],
    nodeDefaults: PROVIDER,
    customKnobs: [retries],
    customChecks: (ctx) => [...delivery(ctx), ...lanes(ctx)],
    customCheckLabels: ["No message is lost to a failed send", "Login codes have their own lane"],
    incident: { type: "spike", multiplier: 2, flows: ["blast"], seconds: 10, label: "Marketing sends the big campaign" },
    incidentText: "Marketing launches an early-bird campaign: the bulk flow doubles for ten seconds, just as fans log in to buy.",
    constraints: [ok(0.999), { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 12 }, { type: "budget", maxUsd: 1_400 }],
  },
  once: {
    scenario: { ...EMPTY, label: "Retries meet the provider's timeouts" },
    flows: [codes(150, true), tickets(100, true), blast(450, true)],
    nodeDefaults: PROVIDER,
    customKnobs: [retries, dedup],
    customChecks: (ctx) => [...delivery(ctx), ...lanes(ctx), ...duplicates(ctx)],
    customCheckLabels: ["No message is lost to a failed send", "Login codes have their own lane", "A retried message is never sent twice"],
    incident: slow,
    incidentText: "The provider degrades again. Some sends succeed on its side but the reply times out, so your worker retries a message that was already delivered.",
    constraints: [ok(0.999), { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 20 }, { type: "budget", maxUsd: 1_800 }],
  },
} satisfies Record<string, StepData>;

export type StepId = keyof typeof DESIGN;

// ---------------------------------------------------------------- Reference designs (used by tests)

type Shape = { servers?: number; inline?: boolean; queues?: number; workers?: number; db?: boolean };

/** users → lb → servers → (queues → workers →) provider; workers → db when recording sends. */
export function buildGraph(s: Shape = {}): LabGraph {
  const nodes: LabNode[] = [{ id: "users", kind: "client", x: 0, y: 0 }];
  const edges: LabGraph["edges"] = [];
  const add = (id: string, kind: LabNode["kind"], extra: Partial<LabNode> = {}) => nodes.push({ id, kind, x: 0, y: 0, ...extra });
  const wire = (from: string, to: string) => edges.push({ id: `${from}>${to}`, from, to });
  const servers = s.servers ?? 1;
  const lb = servers > 1;
  if (lb) {
    add("lb", "lb");
    wire("users", "lb");
  }
  add("provider", "external");
  if (s.db) add("db", "db", { role: "primary" });
  for (let i = 0; i < (s.queues ?? 0); i++) add(`queue${i}`, "queue");
  for (let i = 0; i < servers; i++) {
    const id = `srv${i}`;
    add(id, "server", { size: "m" });
    wire(lb ? "lb" : "users", id);
    if (s.inline) wire(id, "provider");
    for (let q = 0; q < (s.queues ?? 0); q++) wire(id, `queue${q}`);
  }
  for (let q = 0; q < (s.queues ?? 0); q++) {
    for (let i = 0; i < (s.workers ?? 0); i++) {
      const id = `w${q}-${i}`;
      add(id, "worker");
      wire(`queue${q}`, id);
      wire(id, "provider");
      if (s.db) wire(id, "db");
    }
  }
  return { nodes, edges };
}

export type Design = { graph: LabGraph; configs: LabConfigs };

export function configs(custom: Record<string, string> = {}): LabConfigs {
  return { ...structuredClone(DEFAULT_CONFIGS), custom };
}

type Case = { pass: Design; fail: { why: string; design: Design; failing: string[] }[] };

const GOOD = { retries: "backoff", dedup: "claim" };

export const REFERENCE: Record<StepId, Case> = {
  launch: {
    pass: { graph: buildGraph({ inline: true }), configs: configs() },
    fail: [{ why: "nothing reaches the provider", design: { graph: buildGraph({}), configs: configs() }, failing: ["successRate"] }],
  },
  blast: {
    pass: { graph: buildGraph({ servers: 2, queues: 1, workers: 2 }), configs: configs() },
    fail: [
      { why: "sending inline: the provider's pace becomes the API's latency", design: { graph: buildGraph({ servers: 2, inline: true }), configs: configs() }, failing: ["p99"] },
      { why: "one worker can't drain the blast", design: { graph: buildGraph({ servers: 2, queues: 1, workers: 1 }), configs: configs() }, failing: ["asyncOnTime"] },
    ],
  },
  slow: {
    pass: { graph: buildGraph({ servers: 2, queues: 1, workers: 8 }), configs: configs({ retries: "backoff" }) },
    fail: [
      { why: "immediate retries hammer the struggling provider", design: { graph: buildGraph({ servers: 2, queues: 1, workers: 8 }), configs: configs({ retries: "immediate" }) }, failing: ["asyncOnTime"] },
      { why: "dropping failures loses messages", design: { graph: buildGraph({ servers: 2, queues: 1, workers: 8 }), configs: configs({ retries: "none" }) }, failing: ["custom"] },
      { why: "too few workers once every call is slower", design: { graph: buildGraph({ servers: 2, queues: 1, workers: 3 }), configs: configs({ retries: "backoff" }) }, failing: ["maxQueueLag"] },
    ],
  },
  lanes: {
    pass: { graph: buildGraph({ servers: 2, queues: 2, workers: 4 }), configs: configs({ retries: "backoff" }) },
    fail: [
      { why: "one shared queue", design: { graph: buildGraph({ servers: 2, queues: 1, workers: 8 }), configs: configs({ retries: "backoff" }) }, failing: ["custom"] },
      { why: "two lanes, one worker each", design: { graph: buildGraph({ servers: 2, queues: 2, workers: 1 }), configs: configs({ retries: "backoff" }) }, failing: ["asyncOnTime"] },
    ],
  },
  once: {
    pass: { graph: buildGraph({ servers: 2, queues: 2, workers: 5, db: true }), configs: configs(GOOD) },
    fail: [
      { why: "no record of what was sent", design: { graph: buildGraph({ servers: 2, queues: 2, workers: 5 }), configs: configs(GOOD) }, failing: ["asyncOnTime"] },
      { why: "retries with no duplicate guard", design: { graph: buildGraph({ servers: 2, queues: 2, workers: 5, db: true }), configs: configs({ ...GOOD, dedup: "none" }) }, failing: ["custom"] },
      { why: "look-then-send races", design: { graph: buildGraph({ servers: 2, queues: 2, workers: 5, db: true }), configs: configs({ ...GOOD, dedup: "lookup" }) }, failing: ["custom"] },
    ],
  },
};
