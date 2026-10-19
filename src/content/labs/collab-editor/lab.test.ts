import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIGS, runDesign } from "../../../lib/lab/run";
import type { DesignStep, Lab } from "../../../lib/lab/types";
import { GOOD_KNOBS, REFERENCE, STEPS, buildGraph, type Shape, type StepId } from "./scenarios";

const lab = { steps: [] } as unknown as Lab;

function run(id: StepId, shape: Shape, knobs: Record<string, string> = GOOD_KNOBS, healthChecks = true) {
  const step = { ...STEPS[id], id, type: "design" } as unknown as DesignStep;
  return runDesign(lab, step, {
    graph: buildGraph(shape),
    configs: { ...DEFAULT_CONFIGS, resilience: { ...DEFAULT_CONFIGS.resilience, healthChecks }, custom: knobs },
    api: {},
    schema: { engine: null, tables: [] },
  }).result;
}
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => (c.constraint.type === "custom" ? c.label : c.constraint.type));

describe("collab editor lab: every step's reference design passes", () => {
  for (const id of Object.keys(STEPS) as StepId[]) {
    it(id, () => {
      expect(failing(run(id, REFERENCE[id]))).toEqual([]);
    });
  }
});

const G = GOOD_KNOBS;
const R = REFERENCE;

describe("collab editor lab: tempting wrong designs fail for the right reason", () => {
  const cases: [string, StepId, Shape, Record<string, string>, string[], boolean?][] = [
    ["launch: no database, nothing can be saved", "launch", { servers: 1, noDb: true }, G, ["successRate"]],
    ["launch: eight servers on day one blows the budget", "launch", { servers: 8 }, G, ["budget"]],
    ["live: one gateway can't hold 90,000 connections", "live", { ...R.live, ws: 1 }, G, ["successRate"]],
    ["live: two gateways with no pub/sub strand half the collaborators", "live", { ...R.live, pubsub: false }, G, ["delivery"]],
    ["live: an unsharded database can't absorb 12,000 writes a second", "live", { ...R.live, shards: 1 }, G, ["successRate"]],
    ["sessions: round-robin routing", "sessions", R.sessions, { ...G, routing: "any" }, ["One server owns each document's session"]],
    ["conflict: last write wins loses edits", "conflict", R.conflict, { ...G, merge: "lww" }, ["No edit is ever lost"]],
    ["conflict: OT without a single referee", "conflict", R.conflict, { ...G, merge: "ot", routing: "any" }, ["OT has one referee per document"]],
    ["history: no snapshots, long opens", "history", R.history, { ...G, cadence: "never" }, ["Opening a long document stays fast"]],
    ["history: a snapshot per keystroke", "history", R.history, { ...G, cadence: "1" }, ["Snapshots don't drown the workers"]],
    ["history: one snapshot worker falls behind", "history", { ...R.history, workers: 1 }, G, ["asyncOnTime"]],
    ["history: no queue, snapshots block typing", "history", { ...R.history, queue: false, workers: 0, storage: false }, G, ["successRate"]],
    ["presence: cursors in the database", "presence", R.presence, { ...G, presence: "db" }, ["Cursor moves never touch the database"]],
    ["presence: two gateways can't carry cursor fan-out", "presence", { ...R.presence, ws: 2 }, G, ["delivery"]],
    ["gateway: no spare gateway", "gateway", { ...R.gateway, ws: 2 }, G, ["successRate"]],
    ["gateway: no health checks", "gateway", R.gateway, G, ["recovery"], false],
    ["gateway: everyone reconnects at once", "gateway", R.gateway, { ...G, retries: "immediate" }, ["A dropped client waits a different time each"]],
    ["gateway: reload instead of resume", "gateway", R.gateway, { ...G, resume: "reload" }, ["A reconnecting client loses no typing"]],
  ];
  for (const [why, id, shape, knobs, expected, hc] of cases) {
    it(why, () => {
      expect(failing(run(id, shape, knobs, hc ?? true))).toEqual(expect.arrayContaining(expected));
    });
  }
});
