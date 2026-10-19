import { describe, expect, it } from "vitest";
import { describe as describeConstraint } from "../../sim";
import { DEFAULT_CONFIGS, runDesign } from "./run";
import { describeDesign, describeResult, describeScenario } from "./serialize";
import type { DesignStep, Drill, DrillConfigs, DrillGraph, DrillNode } from "./types";

/**
 * A tiny ticketing drill, written the way real drills will be: pure data on top of the flow engine.
 * Not registered anywhere; it proves a full design step evaluates and grades.
 */
const step: DesignStep = {
  id: "on-sale",
  type: "design",
  title: "Tickets go on sale",
  minutes: 5,
  story: "Browsing, booking and SMS confirmations all hit you at once.",
  scenario: { label: "On-sale", load: { reads: 0, writes: 0, attack: 0 } },
  palette: ["cdn", "lb", "server", "cache", "db", "queue", "worker", "external"],
  knobs: ["size", "shards", "hitRate"],
  hints: [],
  concepts: [],
  debrief: () => ["It works."],
  flows: [
    {
      id: "browse",
      label: "Browse events",
      rps: 6_000,
      route: [{ kind: "cdn", optional: true, cacheable: 0.8 }, { kind: "lb", optional: true }, { kind: "server" }, { kind: "cache", optional: true, cacheable: 0.9 }, { kind: "db" }],
    },
    { id: "book", label: "Book a seat", rps: 400, write: true, route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }] },
    {
      id: "sms",
      label: "SMS confirmation",
      rps: 400,
      workMs: 50,
      slaSeconds: 20,
      route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "queue" }, { kind: "worker" }, { kind: "external" }],
    },
  ],
  nodeDefaults: { external: { cap: 3_000 }, cdn: { hitRate: 0.95 } },
  incident: { type: "spike", multiplier: 4, flows: ["browse", "book"], seconds: 8, label: "On-sale rush" },
  incidentText: "Tickets go on sale: browsing and booking jump fourfold for eight seconds.",
  customKnobs: [
    {
      id: "idempotency",
      label: "Double taps",
      help: "What happens when a phone retries a booking.",
      default: "none",
      options: [
        { v: "none", label: "Book again", desc: "A retry books a second seat." },
        { v: "key", label: "Idempotency key", desc: "A retry returns the first booking." },
      ],
    },
    {
      id: "shardKey",
      label: "Shard by",
      help: "How rows are spread over shards.",
      default: "event",
      appliesTo: "db",
      options: [
        { v: "event", label: "event id", desc: "One hot event lives on one shard.", values: { skew: 0.9 } },
        { v: "seat", label: "seat id", desc: "Spreads one event evenly." },
      ],
    },
  ],
  customChecks: ({ knobs }) => [
    {
      label: "A double tap never books two seats",
      ok: knobs.idempotency === "key",
      message: "A retried booking is treated as a new one. Send an idempotency key with each booking.",
    },
  ],
  customCheckLabels: ["A double tap never books two seats"],
  constraints: [
    { type: "successRate", min: 0.99 },
    { type: "flowSuccess", flow: "book", min: 0.99 },
    { type: "asyncOnTime", min: 0.9 },
    { type: "maxQueueLag", seconds: 15 },
    { type: "budget", maxUsd: 4_000 },
  ],
};

const drill: Drill = {
  slug: "example",
  version: 1,
  title: "Example",
  product: "Tickets",
  intro: null,
  requirements: [],
  estimates: [],
  cacheParam: "id",
  cacheValues: [],
  related: { lessons: [], drills: [] },
  steps: [step],
};

type Spec = { cdn?: boolean; servers?: number; cache?: boolean; shards?: number; workers?: number; queue?: boolean; external?: boolean };

function build(s: Spec): DrillGraph {
  const nodes: DrillNode[] = [{ id: "users", kind: "client", x: 0, y: 0 }];
  const edges: DrillGraph["edges"] = [];
  const wire = (from: string, to: string) => edges.push({ id: `${from}>${to}`, from, to });
  const add = (id: string, kind: DrillNode["kind"], extra: Partial<DrillNode> = {}) => nodes.push({ id, kind, x: 0, y: 0, ...extra });
  let front = "users";
  if (s.cdn) {
    add("cdn", "cdn");
    wire(front, "cdn");
    front = "cdn";
  }
  add("lb", "lb");
  wire(front, "lb");
  add("db", "db", { shards: s.shards ?? 1 });
  if (s.cache) add("redis", "cache");
  if (s.queue) add("q", "queue");
  if (s.external !== false) add("sms", "external");
  for (let i = 0; i < (s.servers ?? 2); i++) {
    const id = `srv${i}`;
    add(id, "server", { size: "m" });
    wire("lb", id);
    wire(id, "db");
    if (s.cache) wire(id, "redis");
    if (s.queue) wire(id, "q");
  }
  for (let i = 0; i < (s.workers ?? 0); i++) {
    add(`w${i}`, "worker");
    wire("q", `w${i}`);
    wire(`w${i}`, "sms");
  }
  return { nodes, edges };
}

const configs = (custom: Record<string, string> = {}): DrillConfigs => ({ ...structuredClone(DEFAULT_CONFIGS), custom });
const run = (graph: DrillGraph, custom?: Record<string, string>) =>
  runDesign(drill, step, { graph, configs: configs(custom), api: {}, schema: { engine: null, tables: [] } }).result;
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => (c.constraint.type === "custom" ? "custom" : c.constraint.type));

const GOOD = { idempotency: "key", shardKey: "seat" };
const good = () => build({ cdn: true, servers: 4, cache: true, shards: 2, queue: true, workers: 4 });

describe("example flow drill: a full design step evaluates and grades", () => {
  it("a sound design passes every constraint and the custom check", () => {
    const r = run(good(), GOOD);
    expect(failing(r)).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.checks.map((c) => c.label)).toContain("A double tap never books two seats");
    expect(r.timeline).not.toBeNull();
    expect(r.steady.nodes.cdn.load).toBeGreaterThan(5_000);
  });

  it("a correctness bug the throughput model can't see fails the custom check only", () => {
    const r = run(good(), { ...GOOD, idempotency: "none" });
    expect(failing(r)).toEqual(["custom"]);
    expect(r.pass).toBe(false);
    expect(r.checks.find((c) => !c.ok)?.message).toMatch(/idempotency key/);
  });

  it("sending SMS inline (no queue) fails: the third party sets the pace", () => {
    const r = run(build({ cdn: true, servers: 4, cache: true, shards: 2 }), GOOD);
    expect(r.pass).toBe(false);
    expect(failing(r)).toContain("successRate");
    expect(r.steady.issues.join(" ")).toMatch(/Worker|needs a Queue/);
  });

  it("too few workers: the app stays up but the queue lags and jobs run late", () => {
    const r = run(build({ cdn: true, servers: 4, cache: true, shards: 2, queue: true, workers: 1 }), GOOD);
    expect(failing(r)).toEqual(expect.arrayContaining(["asyncOnTime"]));
    expect(r.metrics.queueLag).toBeGreaterThan(5);
  });

  it("sharding by event id leaves one hot shard that more shards can't fix", () => {
    const hot = run(build({ cdn: true, servers: 4, cache: true, shards: 8, queue: true, workers: 4 }), { ...GOOD, shardKey: "event" });
    const even = run(build({ cdn: true, servers: 4, cache: true, shards: 8, queue: true, workers: 4 }), GOOD);
    expect(hot.steady.nodes.db.hotUtil ?? 0).toBeGreaterThan(even.steady.nodes.db.hotUtil ?? 0);
  });

  it("serialises for the postmortem", () => {
    const r = run(good(), GOOD);
    const design = describeDesign({ graph: good(), configs: configs(GOOD), api: {}, dbLabel: "Postgres", step });
    expect(design).toContain("Shard by: seat id");
    expect(describeScenario(step)).toContain("Browse events");
    expect(describeResult(r)).toContain("Flows:");
    expect(step.constraints.map(describeConstraint).join(" ")).toContain("background jobs");
  });
});
