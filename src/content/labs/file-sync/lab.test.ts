import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIGS, runDesign } from "../../../lib/lab/run";
import type { DesignStep, Lab } from "../../../lib/lab/types";
import { GOOD_KNOBS, REFERENCE, STEPS, buildGraph, type Shape, type StepId } from "./scenarios";

const lab = { steps: [] } as unknown as Lab;

function run(id: StepId, shape: Shape, knobs: Record<string, string> = GOOD_KNOBS) {
  const step = { ...STEPS[id], id, type: "design" } as unknown as DesignStep;
  return runDesign(lab, step, {
    graph: buildGraph(shape),
    configs: { ...DEFAULT_CONFIGS, resilience: { ...DEFAULT_CONFIGS.resilience, healthChecks: true }, custom: knobs },
    api: {},
    schema: { engine: null, tables: [] },
  }).result;
}
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => (c.constraint.type === "custom" ? c.label : c.constraint.type));

describe("file sync lab: every step's reference design passes", () => {
  for (const id of Object.keys(STEPS) as StepId[]) {
    it(id, () => {
      expect(failing(run(id, REFERENCE[id]))).toEqual([]);
    });
  }
});

const G = GOOD_KNOBS;
const R = REFERENCE;

describe("file sync lab: tempting wrong designs fail for the right reason", () => {
  const cases: [string, StepId, Shape, Record<string, string>, string[]][] = [
    ["launch: no metadata database, nothing can be listed", "launch", { servers: 1, noDb: true }, G, ["successRate"]],
    ["launch: eight servers on day one blows the budget", "launch", { servers: 8 }, G, ["budget"]],
    ["chunks: whole-file hashing re-sends everything", "chunks", R.chunks, { ...G, chunking: "whole" }, ["An edit doesn't re-upload the whole file", "successRate"]],
    ["chunks: fixed chunks shift after an insertion", "chunks", R.chunks, { ...G, chunking: "fixed" }, ["An insertion doesn't re-send the rest of the file"]],
    ["chunks: with no dedupe index every chunk reaches storage", "chunks", { ...R.chunks, cache: false }, G, ["successRate"]],
    ["metadata: chunk bytes in the database", "metadata", R.metadata, { ...G, home: "db" }, ["File bytes never live in the database"]],
    ["metadata: no database for commits", "metadata", { ...R.metadata, noDb: true }, G, ["successRate"]],
    ["notify: polling hammers the metadata store", "notify", R.notify, { ...G, notify: "poll" }, ["Idle devices don't poll the metadata database"]],
    ["notify: three gateways can't hold 200,000 devices", "notify", { ...R.notify, ws: 3 }, G, ["delivery"]],
    ["notify: gateways with no pub/sub miss most devices", "notify", { ...R.notify, pubsub: false }, G, ["delivery"]],
    ["conflict: blind commits overwrite stale edits", "conflict", R.conflict, { ...G, commit: "blind" }, ["A commit names the version it was based on"]],
    ["conflict: newest wins loses an edit", "conflict", R.conflict, { ...G, conflict: "overwrite" }, ["No device's work is silently overwritten"]],
    ["conflict: locks break offline editing", "conflict", R.conflict, { ...G, conflict: "lock" }, ["No device's work is silently overwritten"]],
    ["spike: too few scan workers fall behind", "spike", { ...R.spike, workers: 5 }, G, ["asyncOnTime"]],
    ["spike: scanning inline with no queue", "spike", { ...R.spike, queue: false, workers: 0 }, G, ["flowSuccess"]],
    ["spike: restarting dropped uploads", "spike", R.spike, { ...G, resume: "restart" }, ["A dropped upload resumes from the last chunk"]],
    ["spike: immediate retries", "spike", R.spike, { ...G, retries: "immediate" }, ["Retries back off"]],
  ];
  for (const [why, id, shape, knobs, expected] of cases) {
    it(why, () => {
      expect(failing(run(id, shape, knobs))).toEqual(expect.arrayContaining(expected));
    });
  }
});
