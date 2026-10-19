// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow, FlowIncident, NodeConfig } from "../../../sim";
import type { CustomCheckContext } from "../../../lib/lab/types";
import { build, type Spec } from "./graph";

/**
 * Traffic, knobs, checks and pass conditions for each canvas step of the video
 * platform lab, plus the reference designs lab.test.ts proves against them.
 */

const hop = {
  cdn: (cacheable = 0.95) => ({ kind: "cdn" as const, optional: true, cacheable }),
  lb: { kind: "lb" as const, optional: true },
  server: { kind: "server" as const },
};

const watch = (rps: number): Flow => ({
  id: "watch",
  label: "Open a video page",
  rps,
  route: [hop.lb, hop.server, { kind: "db", missing: "The video page needs its title and manifest address from a database." }],
});

const segments = (rps: number, cdn: boolean): Flow => ({
  id: "segments",
  label: "Stream video segments",
  rps,
  route: [
    ...(cdn ? [hop.cdn()] : []),
    hop.lb,
    hop.server,
    { kind: "storage", missing: "Segments are files. Wire the API server to object storage so it can read them." },
  ],
});

const upload = (rps: number, over: Partial<Flow> = {}): Flow => ({
  id: "upload",
  label: "Upload and process a video",
  rps,
  route: [
    hop.lb,
    hop.server,
    { kind: "storage", missing: "The original file has to land somewhere durable: wire the API server to object storage." },
    { kind: "queue", missing: "Transcoding takes minutes, far too long to do inside an upload request. Put a queue behind the API server." },
    { kind: "worker", missing: "Nothing is pulling jobs off the queue. Wire the queue to workers." },
    { kind: "storage", missing: "Workers write the finished renditions to object storage: wire them to it." },
  ],
  ...over,
});

const ACK: CustomKnob = {
  id: "ack",
  label: "Upload response",
  help: "What the phone hears when the last byte arrives.",
  default: "wait",
  options: [
    { v: "wait", label: "200 when transcoding is done", desc: "The request stays open for minutes." },
    { v: "accepted", label: "202 Accepted, process later", desc: "Answer at once; the video shows as 'processing' until it's ready." },
  ],
};

const PATH: CustomKnob = {
  id: "path",
  label: "Where the bytes go",
  help: "How a 2 GB file gets from the phone to storage.",
  default: "proxy",
  options: [
    { v: "proxy", label: "Through the API servers", desc: "Every upload streams through your app tier." },
    { v: "presigned", label: "Straight to storage (pre-signed URL)", desc: "The API hands out a short-lived URL; the phone uploads directly." },
  ],
};

const LADDER: CustomKnob = {
  id: "ladder",
  label: "Renditions",
  help: "Which versions of each video you make.",
  default: "single",
  options: [
    { v: "single", label: "One 1080p file", desc: "Cheap to make. A phone on 3G buffers forever." },
    { v: "ladder", label: "Ladder: 240p to 1080p + manifest", desc: "Players switch between sizes as the network changes." },
  ],
};

const SEGMENT: CustomKnob = {
  id: "segment",
  label: "Segment length",
  help: "How long each downloadable chunk of video is.",
  default: "6s",
  options: [
    { v: "2s", label: "2 seconds", desc: "Switches quality fast, but millions of tiny files; the CDN keeps few of them warm.", values: { hitRate: 0.6 } },
    { v: "6s", label: "6 seconds", desc: "The usual compromise.", values: { hitRate: 0.95 } },
    { v: "20s", label: "20 seconds", desc: "Few files and an excellent hit rate, but playback waits for a big first chunk.", values: { hitRate: 0.96 } },
  ],
};

const bad = (ok: boolean, label: string, message: string) => ({ label, ok, message });

const checks = {
  ack: (k: Record<string, string>) =>
    bad(k.ack === "accepted", "Uploads answer 202 and finish in the background", "The request waits for transcoding, so phones time out and retry. Answer 202 Accepted and show 'processing'."),
  path: (k: Record<string, string>) =>
    bad(k.path === "presigned", "Upload bytes skip the API servers", "Gigabytes stream through your app tier, tying up connections. Hand out a pre-signed URL and let storage take the bytes."),
  ladder: (k: Record<string, string>) =>
    bad(k.ladder === "ladder", "Slow networks can keep playing (adaptive bitrate)", "One big file means a phone on a weak signal stalls. Make a ladder of renditions and a manifest so the player can step down."),
  segment: (k: Record<string, string>) =>
    bad(k.segment !== "20s", "Playback starts in under 3 seconds", "A 20-second first segment is a long download before anything plays. Use 2 to 6 second segments."),
};

const chk = (...fns: ((k: Record<string, string>) => ReturnType<typeof bad>)[]) => (ctx: CustomCheckContext) => fns.map((f) => f(ctx.knobs));
const labels = (...fns: ((k: Record<string, string>) => ReturnType<typeof bad>)[]) => fns.map((f) => f({}).label);

const ok99: Constraint = { type: "successRate", min: 0.99 };
const SPIKE: FlowIncident = { type: "spike", multiplier: 6, flows: ["segments", "watch"], seconds: 15, label: "A video goes viral" };

export type StepDef = {
  flows: Flow[];
  constraints: Constraint[];
  customKnobs?: CustomKnob[];
  customChecks?: (ctx: CustomCheckContext) => ReturnType<typeof bad>[];
  customCheckLabels?: string[];
  incident?: FlowIncident;
  incidentText?: string;
  nodeDefaults?: NodeConfig;
};

const ND: NodeConfig = { cdn: { hitRate: 0.95 } };

export const DESIGN = {
  launch: {
    flows: [watch(40), segments(300, false), { ...upload(1), route: upload(1).route.slice(0, 3) }],
    constraints: [ok99, { type: "p99", maxMs: 250 }, { type: "budget", maxUsd: 600 }],
  },
  pipeline: {
    flows: [watch(60), segments(400, false), upload(2, { workMs: 12_000, slaSeconds: 300 })],
    customKnobs: [ACK, PATH],
    customChecks: chk(checks.ack, checks.path),
    customCheckLabels: labels(checks.ack, checks.path),
    constraints: [ok99, { type: "flowSuccess", flow: "upload", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 60 }, { type: "budget", maxUsd: 1_200 }],
  },
  cdn: {
    flows: [watch(500), segments(60_000, true), upload(2, { workMs: 12_000, slaSeconds: 300 })],
    customKnobs: [ACK, PATH],
    customChecks: chk(checks.ack, checks.path),
    customCheckLabels: labels(checks.ack, checks.path),
    nodeDefaults: ND,
    constraints: [ok99, { type: "flowSuccess", flow: "segments", min: 0.99 }, { type: "flowSuccess", flow: "upload", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 1_800 }],
  },
  ladder: {
    flows: [watch(500), segments(60_000, true), upload(2, { workMs: 40_000, slaSeconds: 300 })],
    customKnobs: [ACK, PATH, LADDER, SEGMENT],
    customChecks: chk(checks.ack, checks.path, checks.ladder, checks.segment),
    customCheckLabels: labels(checks.ack, checks.path, checks.ladder, checks.segment),
    nodeDefaults: ND,
    constraints: [ok99, { type: "asyncOnTime", min: 0.95 }, { type: "maxQueueLag", seconds: 60 }, { type: "budget", maxUsd: 2_200 }],
  },
  viral: {
    flows: [watch(1_000), segments(30_000, true), upload(2, { workMs: 40_000, slaSeconds: 300 })],
    customKnobs: [ACK, PATH, LADDER, SEGMENT],
    customChecks: chk(checks.ack, checks.path, checks.ladder, checks.segment),
    customCheckLabels: labels(checks.ack, checks.path, checks.ladder, checks.segment),
    nodeDefaults: ND,
    incident: SPIKE,
    incidentText: "A creator's video is shared everywhere: for fifteen seconds, plays and segment requests jump sixfold.",
    constraints: [{ type: "everySecond", min: 0.97 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 2_800 }],
  },
} satisfies Record<string, StepDef>;

export type StepId = keyof typeof DESIGN;

// ---------------------------------------------------------------- Reference designs (used by tests)

export const GOOD_KNOBS = { ack: "accepted", path: "presigned", ladder: "ladder", segment: "6s" };

type Design = { spec: Spec; knobs?: Record<string, string> };
type Case = { pass: Design; fail: { why: string; design: Design; failing: string[] }[] };

const core = { lb: 1, db: 1, storage: 1 };
const small: Spec = { ...core, server: 1, size: "s" };
const piped = (workers: number, extra: Spec = {}): Spec => ({ ...core, server: 1, queue: 1, worker: workers, ...extra });
const edge = (workers: number, servers: number, extra: Spec = {}): Spec => ({ ...core, cdn: 1, server: servers, queue: 1, worker: workers, ...extra });

export const REFERENCE: Record<StepId, Case> = {
  launch: {
    pass: { spec: { ...small, lb: 0 } },
    fail: [
      { why: "no object storage: the files have nowhere to live", design: { spec: { server: 1, db: 1 } }, failing: ["successRate"] },
    ],
  },
  pipeline: {
    pass: { spec: piped(4), knobs: { ack: "accepted", path: "presigned" } },
    fail: [
      { why: "transcoding inside the upload request (no queue)", design: { spec: { ...core, server: 1 }, knobs: { ack: "accepted", path: "presigned" } }, failing: ["successRate", "flowSuccess"] },
      { why: "one worker can't keep up", design: { spec: piped(1), knobs: { ack: "accepted", path: "presigned" } }, failing: ["asyncOnTime", "maxQueueLag"] },
      { why: "holds the upload open until transcoding ends", design: { spec: piped(4), knobs: { ack: "wait", path: "presigned" } }, failing: ["custom"] },
      { why: "proxies bytes through the API", design: { spec: piped(4), knobs: { ack: "accepted", path: "proxy" } }, failing: ["custom"] },
    ],
  },
  cdn: {
    pass: { spec: edge(4, 1), knobs: { ack: "accepted", path: "presigned" } },
    fail: [
      { why: "no CDN: 60k segments a second hit the origin", design: { spec: piped(4, { server: 4 }), knobs: { ack: "accepted", path: "presigned" } }, failing: ["successRate", "flowSuccess"] },
    ],
  },
  ladder: {
    pass: { spec: edge(12, 1), knobs: GOOD_KNOBS },
    fail: [
      { why: "single rendition", design: { spec: edge(4, 1), knobs: { ...GOOD_KNOBS, ladder: "single" } }, failing: ["custom"] },
      { why: "ladder but the same four workers", design: { spec: edge(4, 1), knobs: GOOD_KNOBS }, failing: ["asyncOnTime"] },
      { why: "20 second segments", design: { spec: edge(12, 1), knobs: { ...GOOD_KNOBS, segment: "20s" } }, failing: ["custom"] },
    ],
  },
  viral: {
    pass: { spec: edge(12, 3), knobs: GOOD_KNOBS },
    fail: [
      { why: "one origin server melts under the spike", design: { spec: edge(12, 1), knobs: GOOD_KNOBS }, failing: ["everySecond"] },
      { why: "2-second segments: low hit rate sends the spike to the origin", design: { spec: edge(12, 3), knobs: { ...GOOD_KNOBS, segment: "2s" } }, failing: ["everySecond"] },
    ],
  },
};
