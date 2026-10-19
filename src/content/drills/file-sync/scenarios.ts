// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow } from "../../../sim";
import type { DesignStep, DrillGraph, DrillNode } from "../../../lib/drill/types";

/**
 * Load, knobs, incidents and pass conditions for each canvas step of the file
 * sync drill. drill.test.ts proves every reference design passes and the tempting
 * wrong ones fail for the intended reason.
 */

export type StepData = Pick<
  DesignStep,
  "scenario" | "constraints" | "flows" | "incident" | "incidentText" | "customKnobs" | "customChecks" | "customCheckLabels" | "nodeDefaults"
>;

const NO_LOAD = { reads: 0, writes: 0, attack: 0 };
const route = (...r: Flow["route"]) => r;
type Knobs = Record<string, string>;
type Rule = { label: string; ok: (k: Knobs) => boolean; message: string };

// ---------------------------------------------------------------- Knobs

export const CHUNKING: CustomKnob = {
  id: "chunking",
  label: "Split files into",
  help: "How a file is cut up before it is hashed and uploaded.",
  default: "whole",
  options: [
    { v: "whole", label: "Whole files", desc: "One hash per file. Change one byte and the whole file goes up again.", values: { hitRate: 0.05 } },
    { v: "fixed", label: "Fixed 4 MB chunks", desc: "Unchanged chunks are skipped, but an insertion near the top shifts every later chunk.", values: { hitRate: 0.6 } },
    { v: "cdc", label: "Content-defined chunks", desc: "Chunk edges follow the content, so an insertion only changes the chunks around it.", values: { hitRate: 0.92 } },
  ],
};

export const HOME: CustomKnob = {
  id: "home",
  label: "Chunk bytes are stored in",
  help: "Where the actual file data lives, as opposed to the facts about it.",
  default: "db",
  options: [
    { v: "db", label: "The metadata database", desc: "One place for everything, but every row is megabytes." },
    { v: "blob", label: "Object storage", desc: "Chunks are blobs named by their hash. The database keeps only the list of hashes." },
  ],
};

export const NOTIFY: CustomKnob = {
  id: "notify",
  label: "Devices learn about changes by",
  help: "How a laptop finds out a file changed on the phone.",
  default: "poll",
  options: [
    { v: "poll", label: "Asking every few seconds", desc: "Simple. 200,000 idle devices ask a question whose answer is almost always no." },
    { v: "longpoll", label: "Long-polling", desc: "Ask, and the server holds the request until something changes (or 30 s pass)." },
    { v: "push", label: "A WebSocket per device", desc: "The server pushes a one-line “something changed” the moment it happens." },
  ],
};

export const COMMIT: CustomKnob = {
  id: "commit",
  label: "A device commits a new version",
  help: "What the server checks before accepting it.",
  default: "blind",
  options: [
    { v: "blind", label: "Just save it", desc: "The newest commit becomes the file, whatever it was based on." },
    { v: "cas", label: "Only if based on the latest version", desc: "The commit names the version it started from; a mismatch is rejected for the client to resolve." },
  ],
};

export const CONFLICT: CustomKnob = {
  id: "conflict",
  label: "When two devices edited the same version",
  help: "What happens to the loser of the race.",
  default: "overwrite",
  options: [
    { v: "overwrite", label: "Newest wins", desc: "The later commit replaces the earlier one." },
    { v: "lock", label: "Check files out", desc: "Whoever opens a file locks it; others are read-only until it is released." },
    { v: "copy", label: "Keep both as a conflict copy", desc: "The second commit is saved as “poster (Ben's conflicted copy).psd”, and the user decides." },
  ],
};

export const RESUME: CustomKnob = {
  id: "resume",
  label: "A dropped upload",
  help: "What a 2 GB upload does when the Wi-Fi blips at 90%.",
  default: "restart",
  options: [
    { v: "restart", label: "Starts over", desc: "Uploads the whole file again." },
    { v: "resume", label: "Resumes", desc: "Asks which chunks the server has and sends only the missing ones." },
  ],
};

export const RETRIES: CustomKnob = {
  id: "retries",
  label: "Failed chunk uploads are retried",
  help: "What clients do when the server says it's busy.",
  default: "immediate",
  options: [
    { v: "immediate", label: "At once", desc: "Every failure is retried right away." },
    { v: "backoff", label: "With exponential backoff", desc: "Wait longer after each failure, with a random jitter." },
  ],
};

// ---------------------------------------------------------------- Rules (correctness the throughput model can't see)

const R = {
  chunked: {
    label: "An edit doesn't re-upload the whole file",
    ok: (k) => k.chunking !== "whole",
    message: "Whole-file hashing means changing one slide re-sends all 400 MB of the deck. Split files into chunks and upload only the ones the server doesn't have.",
  },
  cdc: {
    label: "An insertion doesn't re-send the rest of the file",
    ok: (k) => k.chunking === "cdc",
    message:
      "Fixed 4 MB chunks are cut at fixed offsets, so adding one line near the top shifts every byte after it and every later chunk gets a new hash: the whole file goes up again. Cut chunks where the content says to (a rolling hash), so the edit only disturbs its neighbours.",
  },
  blob: {
    label: "File bytes never live in the database",
    ok: (k) => k.home === "blob",
    message: "Keeping 4 MB chunks in database rows bloats backups, evicts hot metadata from memory and makes every query slow. Store chunks in object storage by hash; the database keeps only the list.",
  },
  notify: {
    label: "Idle devices don't poll the metadata database",
    ok: (k) => k.notify === "longpoll" || k.notify === "push",
    message: "200,000 devices asking every 5 s is 40,000 queries a second that nearly all answer “nothing”. Hold a connection open and tell them when something changes.",
  },
  cas: {
    label: "A commit names the version it was based on",
    ok: (k) => k.commit === "cas",
    message: "Without a base version the server can't tell a normal save from a stale one, so a laptop that was offline for a day silently replaces everything done since.",
  },
  copy: {
    label: "No device's work is silently overwritten",
    ok: (k) => k.conflict === "copy",
    message:
      "Newest-wins quietly discards one person's edit. Locks make offline editing impossible: a laptop on a plane can't ask for the lock. Keep both versions, with the loser saved as a conflict copy.",
  },
  resume: {
    label: "A dropped upload resumes from the last chunk",
    ok: (k) => k.resume === "resume",
    message: "A flaky connection at 90% restarts a 2 GB upload from zero, and the retry adds to the load that's causing the failures. Ask which chunks exist and send only the rest.",
  },
  backoff: {
    label: "Retries back off",
    ok: (k) => k.retries === "backoff",
    message: "Immediate retries multiply the load on a server that is already struggling. Wait longer after each failure, with a random jitter.",
  },
} satisfies Record<string, Rule>;

const rules = (...rs: Rule[]): Pick<StepData, "customChecks" | "customCheckLabels"> => ({
  customChecks: ({ knobs }) => rs.map((r) => ({ label: r.label, ok: r.ok(knobs), message: r.message })),
  customCheckLabels: rs.map((r) => r.label),
});

// ---------------------------------------------------------------- Flows

const upload: Flow = {
  id: "upload",
  label: "Upload files",
  rps: 120,
  route: route({ kind: "lb", optional: true }, { kind: "server" }, { kind: "storage" }),
};
const list: Flow = {
  id: "list",
  label: "List files",
  rps: 300,
  route: route({ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }),
};
const chunks: Flow = {
  id: "chunks",
  label: "Upload chunks",
  rps: 54_000,
  route: route({ kind: "lb", optional: true }, { kind: "server" }, { kind: "cache", optional: true, cacheable: 1 }, { kind: "storage" }),
};
const commit: Flow = {
  id: "commit",
  label: "Commit a version",
  rps: 3_000,
  write: true,
  route: route({ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }),
};
const changes: Flow = {
  id: "changes",
  label: "Check for changes",
  rps: 9_000,
  route: route({ kind: "lb", optional: true }, { kind: "server" }, { kind: "cache", optional: true, cacheable: 0.7 }, { kind: "db" }),
};
const notify: Flow = {
  id: "notify",
  label: "Notify other devices",
  rps: 4_000,
  connections: 200_000,
  fanout: 2,
  route: route({ kind: "lb", optional: true }, { kind: "ws" }, { kind: "pubsub" }),
};
const scan: Flow = {
  id: "scan",
  label: "Scan and index new files",
  rps: 500,
  workMs: 40,
  slaSeconds: 30,
  route: route({ kind: "lb", optional: true }, { kind: "server" }, { kind: "queue" }, { kind: "worker" }, { kind: "db" }),
};

const ok99: Constraint = { type: "successRate", min: 0.99 };

// ---------------------------------------------------------------- Steps

export const STEPS = {
  launch: {
    scenario: { label: "Launch week", load: NO_LOAD },
    flows: [upload, list],
    constraints: [ok99, { type: "p99", maxMs: 400 }, { type: "budget", maxUsd: 600 }],
  },
  chunks: {
    scenario: { label: "Everyone edits big files", load: NO_LOAD },
    flows: [chunks, list],
    customKnobs: [CHUNKING],
    ...rules(R.chunked, R.cdc),
    nodeDefaults: {},
    constraints: [ok99, { type: "p99", maxMs: 300 }, { type: "budget", maxUsd: 1_800 }],
  },
  metadata: {
    scenario: { label: "Metadata and bytes, apart", load: NO_LOAD },
    flows: [chunks, commit, changes],
    customKnobs: [CHUNKING, HOME],
    ...rules(R.chunked, R.cdc, R.blob),
    constraints: [ok99, { type: "p99", maxMs: 300 }, { type: "budget", maxUsd: 2_200 }],
  },
  notify: {
    scenario: { label: "200,000 devices online", load: NO_LOAD },
    flows: [chunks, commit, changes, notify],
    customKnobs: [CHUNKING, HOME, NOTIFY],
    ...rules(R.chunked, R.cdc, R.blob, R.notify),
    constraints: [ok99, { type: "delivery", min: 0.99 }, { type: "budget", maxUsd: 3_200 }],
  },
  conflict: {
    scenario: { label: "Two devices, one file", load: NO_LOAD },
    flows: [chunks, commit, changes, notify],
    customKnobs: [CHUNKING, HOME, NOTIFY, COMMIT, CONFLICT],
    ...rules(R.chunked, R.cdc, R.blob, R.notify, R.cas, R.copy),
    constraints: [ok99, { type: "delivery", min: 0.99 }, { type: "budget", maxUsd: 3_200 }],
  },
  spike: {
    scenario: { label: "Festival photo dump", load: NO_LOAD },
    flows: [chunks, commit, changes, notify, scan],
    incident: { type: "spike", multiplier: 3, flows: ["scan"], seconds: 10, label: "Everyone uploads at once" },
    incidentText: "The college fest ends and 8,000 people upload their photos in the same ten seconds: the scan queue gets threefold the usual jobs.",
    customKnobs: [CHUNKING, HOME, NOTIFY, COMMIT, CONFLICT, RESUME, RETRIES],
    ...rules(R.chunked, R.cdc, R.blob, R.notify, R.cas, R.copy, R.resume, R.backoff),
    constraints: [{ type: "successRate", min: 0.95 }, { type: "flowSuccess", flow: "scan", min: 0.95 }, { type: "asyncOnTime", min: 0.9 }, { type: "maxQueueLag", seconds: 15 }, { type: "budget", maxUsd: 4_200 }],
  },
} satisfies Record<string, StepData>;

export type StepId = keyof typeof STEPS;

// ---------------------------------------------------------------- Reference graphs (used by tests)

export type Shape = {
  lb?: boolean;
  servers?: number;
  size?: DrillNode["size"];
  cache?: boolean;
  storage?: number;
  noDb?: boolean;
  shards?: number;
  ws?: number;
  pubsub?: boolean;
  queue?: boolean;
  workers?: number;
};

export function buildGraph(s: Shape): DrillGraph {
  const nodes: DrillNode[] = [{ id: "users", kind: "client", x: 0, y: 0 }];
  const edges: DrillGraph["edges"] = [];
  const wire = (from: string, to: string) => edges.push({ id: `${from}>${to}`, from, to });
  const add = (id: string, kind: DrillNode["kind"], extra: Partial<DrillNode> = {}) => nodes.push({ id, kind, x: 0, y: 0, ...extra });
  const ids = (p: string, n: number | undefined) => Array.from({ length: n ?? 0 }, (_, i) => `${p}-${i}`);
  const front = s.lb ? "lb" : "users";
  if (s.lb) {
    add("lb", "lb");
    wire("users", "lb");
  }
  const servers = ids("server", s.servers ?? 1);
  const gateways = ids("ws", s.ws);
  const stores = ids("blobs", s.storage ?? 1);
  const workers = ids("worker", s.workers);
  servers.forEach((id) => add(id, "server", { size: s.size ?? "m" }));
  gateways.forEach((id) => add(id, "ws"));
  stores.forEach((id) => add(id, "storage"));
  workers.forEach((id) => add(id, "worker"));
  if (!s.noDb) add("db", "db", { shards: s.shards ?? 1 });
  if (s.cache) add("redis", "cache");
  if (s.pubsub) add("pubsub", "pubsub");
  if (s.queue) add("queue", "queue");

  for (const sv of servers) {
    wire(front, sv);
    if (!s.noDb) wire(sv, "db");
    for (const st of stores) wire(sv, st);
    if (s.cache) wire(sv, "redis");
    if (s.queue) wire(sv, "queue");
  }
  for (const g of gateways) {
    wire(front, g);
    if (s.pubsub) {
      wire(g, "pubsub");
      wire("pubsub", g);
    }
  }
  for (const w of workers) {
    wire("queue", w);
    if (!s.noDb) wire(w, "db");
  }
  return { nodes, edges };
}

export const GOOD_KNOBS = { chunking: "cdc", home: "blob", notify: "push", commit: "cas", conflict: "copy", resume: "resume", retries: "backoff" };

export const REFERENCE: Record<StepId, Shape> = {
  launch: { servers: 1 },
  chunks: { lb: true, servers: 6, cache: true },
  metadata: { lb: true, servers: 6, cache: true },
  notify: { lb: true, servers: 6, cache: true, ws: 5, pubsub: true },
  conflict: { lb: true, servers: 6, cache: true, ws: 5, pubsub: true },
  spike: { lb: true, servers: 6, cache: true, ws: 5, pubsub: true, queue: true, workers: 8 },
};
