// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Constraint, CustomKnob, Flow, FlowIncident, NodeConfig } from "../../../sim";
import type { CustomCheckContext } from "../../../lib/lab/types";
import type { Spec } from "./graph";

/**
 * Traffic, knobs, checks and pass conditions for each canvas step of the photo
 * feed lab, plus the reference designs lab.test.ts proves against them.
 */

const lb = { kind: "lb" as const, optional: true };
const server = { kind: "server" as const };
const q = (n: number) => Array.from({ length: n }, () => ({ kind: "db" as const, missing: "A feed needs the posts of everyone you follow: wire the API server to a database." }));

const photo = (rps: number, cdn = true): Flow => ({
  id: "photo",
  label: "View a photo",
  rps,
  route: [...(cdn ? [{ kind: "cdn" as const, optional: true, cacheable: 0.95 }] : []), lb, server, { kind: "storage", missing: "Photos are files. Wire the API server to object storage." }],
});
/** `reads` = database queries a feed view costs when nothing is precomputed. */
const feed = (rps: number, reads: number): Flow => ({
  id: "feed",
  label: "Open the feed",
  rps,
  route: [lb, server, { kind: "cache", optional: true, cacheable: 1 }, ...q(reads)],
});
const post = (rps: number, over: Partial<Flow> = {}): Flow => ({
  id: "post",
  label: "Post a photo",
  rps,
  write: true,
  workMs: 100,
  slaSeconds: 30,
  route: [
    lb,
    server,
    { kind: "storage", missing: "The photo itself goes to object storage." },
    { kind: "db", missing: "A post is a row too: wire the API server to a database." },
    { kind: "queue", optional: true },
    { kind: "worker", optional: true },
    { kind: "cache", optional: true },
  ],
  ...over,
});
const celebrity = (rps: number): Flow => ({
  id: "celebrity",
  label: "A celebrity posts",
  rps,
  write: true,
  workMs: 300_000,
  slaSeconds: 60,
  route: [
    lb,
    server,
    { kind: "db", missing: "A post is a row too: wire the API server to a database." },
    { kind: "cache", optional: true, cacheable: 1 },
    { kind: "queue", optional: true },
    { kind: "worker", optional: true },
    { kind: "cache", optional: true },
  ],
});

const FANOUT_BASIC: CustomKnob = {
  id: "fanout",
  label: "Build timelines",
  help: "When a feed gets assembled.",
  default: "pull",
  options: [
    { v: "pull", label: "On read (pull)", desc: "Each feed view queries the posts of everyone you follow, then merges them.", values: { hitRate: 0.5 } },
    { v: "push", label: "On write (push)", desc: "When someone posts, a worker copies the post into each follower's timeline. A feed view is one cache read.", values: { hitRate: 0.97 } },
  ],
};
const FANOUT_FULL: CustomKnob = {
  id: "fanout",
  label: "Build timelines",
  help: "When a feed gets assembled.",
  default: "push",
  options: [
    { v: "pull", label: "On read (pull)", desc: "Each feed view queries the posts of everyone you follow.", values: { hitRate: 0.5 } },
    { v: "push", label: "On write for everyone (push)", desc: "Copy every post into every follower's timeline, including the celebrity's 2 million followers. Those copies churn the cache.", values: { hitRate: 0.9 } },
    { v: "hybrid", label: "Hybrid: push, except celebrities", desc: "Push for normal accounts; celebrity posts are kept once and merged into feeds when they're read.", values: { hitRate: 0.98 } },
  ],
};

const bad = (ok: boolean, label: string, message: string) => ({ label, ok, message });
export const pushWired = (ctx: Pick<CustomCheckContext, "graph">) => {
  const ids = (k: string) => ctx.graph.nodes.filter((n) => n.kind === k).map((n) => n.id);
  const workers = ids("worker");
  const caches = ids("cache");
  return ids("queue").length > 0 && workers.length > 0 && ctx.graph.edges.some((e) => workers.includes(e.from) && caches.includes(e.to));
};
const timelineCheck = (ctx: CustomCheckContext) =>
  bad(
    ctx.knobs.fanout !== "push" && ctx.knobs.fanout !== "hybrid" ? true : pushWired(ctx),
    "Pushed timelines are actually filled by workers",
    "You chose to build timelines on write, but nothing fills them: add a queue and workers, and wire the workers to the timeline cache.",
  );
const chk = (...fns: ((c: CustomCheckContext) => ReturnType<typeof bad>)[]) => (ctx: CustomCheckContext) => fns.map((f) => f(ctx));
const label = (s: string) => s;

const ok99: Constraint = { type: "successRate", min: 0.99 };
const ND: NodeConfig = { cdn: { hitRate: 0.95 } };
const SPIKE: FlowIncident = { type: "spike", multiplier: 3, flows: ["feed", "photo"], seconds: 12, label: "A celebrity posts" };

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

export const DESIGN = {
  launch: {
    flows: [photo(100, false), feed(150, 1), post(10, { route: post(10).route.slice(0, 4) })],
    constraints: [ok99, { type: "p99", maxMs: 250 }, { type: "budget", maxUsd: 500 }],
  },
  photos: {
    flows: [photo(60_000), feed(300, 1), post(10, { route: post(10).route.slice(0, 4) })],
    nodeDefaults: ND,
    constraints: [ok99, { type: "flowSuccess", flow: "photo", min: 0.99 }, { type: "budget", maxUsd: 1_500 }],
  },
  timelines: {
    flows: [photo(8_000), feed(20_000, 5), post(100)],
    customKnobs: [FANOUT_BASIC],
    customChecks: chk(timelineCheck),
    customCheckLabels: [label("Pushed timelines are actually filled by workers")],
    nodeDefaults: ND,
    constraints: [ok99, { type: "flowSuccess", flow: "feed", min: 0.99 }, { type: "asyncOnTime", min: 0.95 }, { type: "budget", maxUsd: 2_200 }],
  },
  celebrity: {
    flows: [photo(8_000), feed(20_000, 5), post(100), celebrity(2)],
    customKnobs: [FANOUT_FULL],
    customChecks: chk(timelineCheck),
    customCheckLabels: [label("Pushed timelines are actually filled by workers")],
    nodeDefaults: ND,
    constraints: [ok99, { type: "maxQueueLag", seconds: 30 }, { type: "budget", maxUsd: 2_200 }],
  },
  spike: {
    flows: [photo(8_000), feed(20_000, 5), post(100), celebrity(2)],
    customKnobs: [FANOUT_FULL],
    customChecks: chk(timelineCheck),
    customCheckLabels: [label("Pushed timelines are actually filled by workers")],
    nodeDefaults: ND,
    incident: SPIKE,
    incidentText: "The celebrity posts and everyone opens the app: feed views and photo requests jump threefold for twelve seconds.",
    constraints: [{ type: "everySecond", min: 0.97 }, { type: "maxQueueLag", seconds: 30 }, { type: "budget", maxUsd: 2_600 }],
  },
} satisfies Record<string, StepDef>;

export type StepId = keyof typeof DESIGN;

// ---------------------------------------------------------------- Reference designs (used by tests)

type Design = { spec: Spec; knobs?: Record<string, string> };
type Case = { pass: Design; fail: { why: string; design: Design; failing: string[] }[] };

const base: Spec = { lb: 1, server: 2, db: 1, storage: 1 };
const pushed = (servers: number, workers: number, extra: Spec = {}): Spec => ({ cdn: 1, lb: 1, server: servers, db: 1, storage: 1, cache: 1, queue: 1, worker: workers, ...extra });

export const REFERENCE: Record<StepId, Case> = {
  launch: {
    pass: { spec: { server: 1, size: "s", db: 1, storage: 1 } },
    fail: [{ why: "no storage for photos", design: { spec: { server: 1, db: 1 } }, failing: ["successRate"] }],
  },
  photos: {
    pass: { spec: { cdn: 1, lb: 1, server: 1, db: 1, storage: 1 } },
    fail: [{ why: "no CDN: every photo hits the origin", design: { spec: { ...base, server: 5 } }, failing: ["flowSuccess"] }],
  },
  timelines: {
    pass: { spec: pushed(3, 3), knobs: { fanout: "push" } },
    fail: [
      { why: "pull: every feed view fans out to the database", design: { spec: pushed(3, 3), knobs: { fanout: "pull" } }, failing: ["flowSuccess"] },
      { why: "choose push but never wire the workers", design: { spec: { cdn: 1, lb: 1, server: 3, db: 1, storage: 1, cache: 1 }, knobs: { fanout: "push" } }, failing: ["custom"] },
    ],
  },
  celebrity: {
    pass: { spec: pushed(3, 3), knobs: { fanout: "hybrid" } },
    fail: [{ why: "push everything: the celebrity's copies swamp the workers", design: { spec: pushed(3, 3), knobs: { fanout: "push" } }, failing: ["maxQueueLag"] }],
  },
  spike: {
    pass: { spec: pushed(5, 3), knobs: { fanout: "hybrid" } },
    fail: [{ why: "three servers can't take the post-time rush", design: { spec: pushed(3, 3), knobs: { fanout: "hybrid" } }, failing: ["everySecond"] }],
  },
};
