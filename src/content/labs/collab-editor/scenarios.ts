// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow } from "../../../sim";
import type { DesignStep, LabGraph, LabNode } from "../../../lib/lab/types";

/**
 * Load, knobs, incidents and pass conditions for each canvas step of the
 * collaborative editor lab. lab.test.ts proves every reference design passes
 * and the tempting wrong ones fail for the intended reason.
 */

export type StepData = Pick<
  DesignStep,
  "scenario" | "constraints" | "flows" | "incident" | "incidentText" | "customKnobs" | "customChecks" | "customCheckLabels" | "nodeDefaults"
>;

const NO_LOAD = { reads: 0, writes: 0, attack: 0 };
const route = (...r: Flow["route"]) => r;

// ---------------------------------------------------------------- Knobs

export const ROUTING: CustomKnob = {
  id: "routing",
  label: "Route a doc's editors to",
  help: "Which server handles the live session of a document.",
  default: "any",
  options: [
    { v: "any", label: "Any server", desc: "Round robin. Two editors of one doc can land on different servers." },
    { v: "doc", label: "The doc's own server", desc: "Sticky by document id: one server owns a doc's session while it is open." },
  ],
};

export const MERGE: CustomKnob = {
  id: "merge",
  label: "When two edits collide",
  help: "How the system combines edits made at the same time.",
  default: "lww",
  options: [
    { v: "lww", label: "Last write wins", desc: "The newest save replaces the older one. Simple, and it throws edits away." },
    { v: "ot", label: "Operational transform", desc: "A server orders operations and rewrites each against the ones it missed." },
    { v: "crdt", label: "CRDT", desc: "Every character has a unique id; edits merge in any order, with no central referee." },
  ],
};

export const CADENCE: CustomKnob = {
  id: "cadence",
  label: "Take a snapshot",
  help: "How often the document is saved whole, next to the operation log.",
  default: "never",
  options: [
    { v: "never", label: "Never", desc: "Opening a doc replays its whole log." },
    { v: "500", label: "Every 500 operations", desc: "Open = latest snapshot + at most 500 operations." },
    { v: "1", label: "After every operation", desc: "Opens are instant, but every keystroke rewrites the whole document." },
  ],
};

export const PRESENCE: CustomKnob = {
  id: "presence",
  label: "Cursor positions live in",
  help: "Where a collaborator's cursor is kept.",
  default: "db",
  options: [
    { v: "db", label: "The database", desc: "Durable, and written many times a second per person." },
    { v: "pubsub", label: "Pub/sub only", desc: "Broadcast to the doc's other editors, never stored. A cursor is worthless in a minute." },
  ],
};

export const RETRIES: CustomKnob = {
  id: "retries",
  label: "After a dropped connection, clients reconnect",
  help: "What 60,000 browsers do when a gateway dies.",
  default: "immediate",
  options: [
    { v: "immediate", label: "At once", desc: "Everyone reconnects in the same second." },
    { v: "backoff", label: "With jittered backoff", desc: "A random, growing delay spreads the reconnects out." },
  ],
};

export const RESUME: CustomKnob = {
  id: "resume",
  label: "A reconnecting client",
  help: "How it catches up on what it missed.",
  default: "reload",
  options: [
    { v: "reload", label: "Reloads the document", desc: "Discards local state and fetches everything again, losing unsent typing." },
    { v: "resume", label: "Resumes from its last version", desc: "Replays unsent ops and fetches only the operations after the version it saw." },
  ],
};

// ---------------------------------------------------------------- Flows

const open = (rps: number): Flow => ({
  id: "open",
  label: "Open a document",
  rps,
  route: route({ kind: "lb", optional: true }, { kind: "server" }, { kind: "cache", optional: true, cacheable: 0.7 }, { kind: "db" }),
});

const save = (rps: number): Flow => ({
  id: "save",
  label: "Autosave",
  rps,
  write: true,
  route: route({ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }),
});

const type: Flow = {
  id: "type",
  label: "Edits while typing",
  rps: 12_000,
  connections: 90_000,
  fanout: 3,
  write: true,
  route: route({ kind: "lb", optional: true }, { kind: "ws" }, { kind: "server" }, { kind: "db" }, { kind: "pubsub", optional: true }),
};

const snapshot: Flow = {
  id: "snapshot",
  label: "Save a snapshot",
  rps: 240,
  workMs: 100,
  slaSeconds: 30,
  route: route({ kind: "lb", optional: true }, { kind: "ws" }, { kind: "server" }, { kind: "queue" }, { kind: "worker" }, { kind: "storage" }),
};

const cursor: Flow = {
  id: "cursor",
  label: "Cursor moves",
  rps: 25_000,
  fanout: 8,
  route: route({ kind: "lb", optional: true }, { kind: "ws" }, { kind: "pubsub" }),
};

const live = [open(300), type];
const withHistory = [open(800), type, snapshot];
const withPresence = [open(800), type, snapshot, cursor];

// ---------------------------------------------------------------- Checks


const sticky = (k: Record<string, string>) => k.routing === "doc";
const stickyCheck = {
  label: "One server owns each document's session",
  message: "Edits to one document are spread over several servers, so none of them can say what order edits happened in. Route by document id so one server owns each session.",
};
const lostEdits = (k: Record<string, string>) => k.merge === "ot" || k.merge === "crdt";

const MERGE_LABEL = "No edit is ever lost";
const mergeChecks = (k: Record<string, string>) => [
  {
    label: MERGE_LABEL,
    ok: lostEdits(k),
    message:
      "With last write wins, when Asha and Ben type in the same paragraph, the later save replaces the earlier one and Asha's sentence vanishes. Merge operations instead: operational transform or a CRDT.",
  },
  {
    label: "OT has one referee per document",
    ok: k.merge !== "ot" || sticky(k),
    message: "Operational transform needs one place that puts operations in order. Route each document to its own server.",
  },
];

const historyChecks = (k: Record<string, string>) => [
  {
    label: "Opening a long document stays fast",
    ok: k.cadence === "500" || k.cadence === "1",
    message: "With no snapshots, opening a 2-million-operation document replays every operation from the first keystroke. Take a snapshot every few hundred operations.",
  },
  {
    label: "Snapshots don't drown the workers",
    ok: k.cadence !== "1",
    message: "A snapshot after every keystroke rewrites the whole document 12,000 times a second. Snapshot every few hundred operations and replay the short tail.",
  },
];

const presenceCheck = (k: Record<string, string>) => ({
  label: "Cursor moves never touch the database",
  ok: k.presence === "pubsub",
  message: "Each of 25,000 cursor moves a second would become a database write, for data that is stale in a second. Publish cursors on pub/sub and don't store them.",
});

const failCheck = (k: Record<string, string>) => [
  {
    label: "A dropped client waits a different time each",
    ok: k.retries === "backoff",
    message: "Every disconnected browser reconnects in the same second and floods the surviving gateways. Add jittered backoff so reconnects spread out.",
  },
  {
    label: "A reconnecting client loses no typing",
    ok: k.resume === "resume",
    message: "Reloading the document throws away what the user typed while offline. Resume from the last version the client saw and replay its unsent operations.",
  },
];

// ---------------------------------------------------------------- Steps

const ok99: Constraint = { type: "successRate", min: 0.99 };

export const STEPS = {
  launch: {
    scenario: { label: "Launch week", load: NO_LOAD },
    flows: [open(40), save(60)],
    constraints: [ok99, { type: "p99", maxMs: 200 }, { type: "budget", maxUsd: 700 }],
  },
  live: {
    scenario: { label: "Everyone types at once", load: NO_LOAD },
    flows: live,
    constraints: [ok99, { type: "delivery", min: 0.99 }, { type: "p99", maxMs: 150 }, { type: "budget", maxUsd: 2_600 }],
  },
  sessions: {
    scenario: { label: "Same doc, two servers", load: NO_LOAD },
    flows: live,
    customKnobs: [ROUTING],
    customChecks: ({ knobs }) => [{ ...stickyCheck, ok: sticky(knobs) }],
    customCheckLabels: [stickyCheck.label],
    constraints: [ok99, { type: "delivery", min: 0.99 }, { type: "budget", maxUsd: 2_600 }],
  },
  conflict: {
    scenario: { label: "Asha and Ben type together", load: NO_LOAD },
    flows: live,
    customKnobs: [ROUTING, MERGE],
    customChecks: ({ knobs }) => [{ ...stickyCheck, ok: sticky(knobs) }, ...mergeChecks(knobs)],
    customCheckLabels: [stickyCheck.label, MERGE_LABEL, "OT has one referee per document"],
    constraints: [ok99, { type: "delivery", min: 0.99 }, { type: "budget", maxUsd: 2_600 }],
  },
  history: {
    scenario: { label: "A 2-million-edit document", load: NO_LOAD },
    flows: withHistory,
    customKnobs: [ROUTING, MERGE, CADENCE],
    customChecks: ({ knobs }) => [{ ...stickyCheck, ok: sticky(knobs) }, ...mergeChecks(knobs), ...historyChecks(knobs)],
    customCheckLabels: [stickyCheck.label, MERGE_LABEL, "OT has one referee per document", "Opening a long document stays fast", "Snapshots don't drown the workers"],
    constraints: [ok99, { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 10 }, { type: "budget", maxUsd: 3_200 }],
  },
  presence: {
    scenario: { label: "Cursors everywhere", load: NO_LOAD },
    flows: withPresence,
    customKnobs: [ROUTING, MERGE, CADENCE, PRESENCE],
    customChecks: ({ knobs }) => [
      { ...stickyCheck, ok: sticky(knobs) },
      ...mergeChecks(knobs),
      ...historyChecks(knobs),
      presenceCheck(knobs),
    ],
    customCheckLabels: [
      stickyCheck.label,
      MERGE_LABEL,
      "OT has one referee per document",
      "Opening a long document stays fast",
      "Snapshots don't drown the workers",
      "Cursor moves never touch the database",
    ],
    constraints: [ok99, { type: "delivery", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 4_200 }],
  },
  gateway: {
    scenario: { label: "A gateway dies", load: NO_LOAD },
    flows: withPresence,
    incident: { type: "down", kind: "ws", label: "A WebSocket gateway dies" },
    incidentText: "Five seconds in, one gateway loses its network. Every editor attached to it is disconnected and starts reconnecting.",
    customKnobs: [ROUTING, MERGE, CADENCE, PRESENCE, RETRIES, RESUME],
    customChecks: ({ knobs }) => [
      { ...stickyCheck, ok: sticky(knobs) },
      ...mergeChecks(knobs),
      ...historyChecks(knobs),
      presenceCheck(knobs),
      ...failCheck(knobs),
    ],
    customCheckLabels: [
      stickyCheck.label,
      MERGE_LABEL,
      "OT has one referee per document",
      "Opening a long document stays fast",
      "Snapshots don't drown the workers",
      "Cursor moves never touch the database",
      "A dropped client waits a different time each",
      "A reconnecting client loses no typing",
    ],
    constraints: [{ type: "successRate", min: 0.97 }, { type: "recovery", maxSeconds: 8 }, { type: "budget", maxUsd: 4_800 }],
  },
} satisfies Record<string, StepData>;

export type StepId = keyof typeof STEPS;

// ---------------------------------------------------------------- Reference graphs (used by tests)

export type Shape = {
  lb?: boolean;
  ws?: number;
  servers?: number;
  pubsub?: boolean;
  shards?: number;
  noDb?: boolean;
  cache?: boolean;
  queue?: boolean;
  workers?: number;
  storage?: boolean;
};

export function buildGraph(s: Shape): LabGraph {
  const nodes: LabNode[] = [{ id: "users", kind: "client", x: 0, y: 0 }];
  const edges: LabGraph["edges"] = [];
  const wire = (from: string, to: string) => edges.push({ id: `${from}>${to}`, from, to });
  const add = (id: string, kind: LabNode["kind"], extra: Partial<LabNode> = {}) => nodes.push({ id, kind, x: 0, y: 0, ...extra });
  const front = s.lb ? "lb" : "users";
  if (s.lb) {
    add("lb", "lb");
    wire("users", "lb");
  }
  const servers = Array.from({ length: s.servers ?? 1 }, (_, i) => `server-${i}`);
  const gateways = Array.from({ length: s.ws ?? 0 }, (_, i) => `ws-${i}`);
  servers.forEach((id) => add(id, "server", { size: "m" }));
  gateways.forEach((id) => add(id, "ws"));
  if (!s.noDb) add("db", "db", { shards: s.shards ?? 1 });
  if (s.cache) add("redis", "cache");
  if (s.pubsub) add("pubsub", "pubsub");
  if (s.queue) add("queue", "queue");
  if (s.storage) add("blobs", "storage");
  const workers = Array.from({ length: s.workers ?? 0 }, (_, i) => `worker-${i}`);
  workers.forEach((id) => add(id, "worker"));

  for (const g of gateways) {
    wire(front, g);
    if (s.pubsub) {
      wire(g, "pubsub");
      wire("pubsub", g);
    }
    for (const sv of servers) wire(g, sv);
  }
  for (const sv of servers) wire(front, sv);
  for (const sv of servers) {
    if (!s.noDb) wire(sv, "db");
    if (s.cache) wire(sv, "redis");
    if (s.pubsub) wire(sv, "pubsub");
    if (s.queue) wire(sv, "queue");
  }
  if (s.queue) for (const w of workers) wire("queue", w);
  if (s.storage) for (const w of workers) wire(w, "blobs");
  return { nodes, edges };
}

export const GOOD_KNOBS = { routing: "doc", merge: "ot", cadence: "500", presence: "pubsub", retries: "backoff", resume: "resume" };

export const REFERENCE: Record<StepId, Shape> = {
  launch: { servers: 1 },
  live: { lb: true, ws: 2, servers: 2, pubsub: true, shards: 2 },
  sessions: { lb: true, ws: 2, servers: 2, pubsub: true, shards: 2 },
  conflict: { lb: true, ws: 2, servers: 2, pubsub: true, shards: 2 },
  history: { lb: true, ws: 2, servers: 2, pubsub: true, shards: 2, queue: true, workers: 3, storage: true },
  presence: { lb: true, ws: 3, servers: 2, pubsub: true, shards: 2, queue: true, workers: 3, storage: true },
  gateway: { lb: true, ws: 4, servers: 2, pubsub: true, shards: 2, queue: true, workers: 3, storage: true },
};
