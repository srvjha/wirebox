import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIGS, runDesign } from "../../../lib/drill/run";
import type { DesignStep, Drill } from "../../../lib/drill/types";
import { GOOD_KNOBS, REFERENCE, STEPS, buildGraph, type Shape, type StepId } from "./scenarios";

const drill = { steps: [] } as unknown as Drill;

function run(id: StepId, shape: Shape, knobs: Record<string, string> = GOOD_KNOBS) {
  const step = { ...STEPS[id], id, type: "design" } as unknown as DesignStep;
  return runDesign(drill, step, {
    graph: buildGraph(shape),
    configs: { ...DEFAULT_CONFIGS, resilience: { ...DEFAULT_CONFIGS.resilience, healthChecks: true }, custom: knobs },
    api: {},
    schema: { engine: null, tables: [] },
  }).result;
}
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => (c.constraint.type === "custom" ? c.label : c.constraint.type));

describe("key-value store drill: every step's reference design passes", () => {
  for (const id of Object.keys(STEPS) as StepId[]) {
    it(id, () => {
      expect(failing(run(id, REFERENCE[id]))).toEqual([]);
    });
  }
});

const G = GOOD_KNOBS;
const R = REFERENCE;

describe("key-value store drill: tempting wrong designs fail for the right reason", () => {
  const cases: [string, StepId, Shape, Record<string, string>, string[]][] = [
    ["launch: no database", "launch", { servers: 1, noDb: true }, G, ["successRate"]],
    ["launch: a cluster on day one blows the budget", "launch", { lb: true, servers: 4, shards: 4 }, G, ["budget"]],
    ["partition: one shard can't carry 36,000 ops a second", "partition", { ...R.partition, shards: 1 }, G, ["successRate"]],
    ["partition: key ranges pile onto one partition", "partition", R.partition, { ...G, partition: "range" }, ["Every partition gets a fair share", "successRate"]],
    ["partition: hash mod N reshuffles everything on resize", "partition", R.partition, { ...G, partition: "modulo" }, ["Adding a node moves only its share of keys"]],
    ["partition: one token per node is lopsided", "partition", R.partition, { ...G, partition: "ring" }, ["Every partition gets a fair share"]],
    ["replicate: a single copy loses keys with the disk", "replicate", R.replicate, { ...G, n: "1" }, ["A dead disk doesn't lose keys"]],
    ["replicate: five copies on too few partitions", "replicate", { ...R.replicate, shards: 4 }, { ...G, n: "5" }, ["Replicated writes still fit on the nodes"]],
    ["quorum: R = 1 and W = 1 with three copies can read stale data", "quorum", R.quorum, { ...G, r: "one", w: "one" }, ["A read always sees the latest acknowledged write"]],
    ["quorum: R = 1 and W = majority still can miss", "quorum", R.quorum, { ...G, r: "one", w: "quorum" }, ["A read always sees the latest acknowledged write"]],
    ["nodedown: W = N blocks writes when a replica is down", "nodedown", R.nodedown, { ...G, r: "one", w: "all" }, ["Writes still succeed with a node down"]],
    ["nodedown: R = N stalls reads when a replica is down", "nodedown", R.nodedown, { ...G, r: "all", w: "one" }, ["Reads still succeed with a node down"]],
    ["nodedown: no spare node to absorb the load", "nodedown", { ...R.nodedown, servers: 2 }, G, ["successRate"]],
    ["repair: nothing fixes a stale node", "repair", R.repair, { ...G, heal: "none" }, ["A node that missed writes gets repaired"]],
    ["repair: read repair alone leaves cold keys stale", "repair", R.repair, { ...G, heal: "read" }, ["Keys nobody reads get repaired too"]],
    ["hotkey: a viral key melts its partition", "hotkey", { ...R.hotkey, cache: false }, { ...G, hot: "none" }, ["One hot key can't melt its partition"]],
    ["hotkey: choosing a cache without wiring one", "hotkey", { ...R.hotkey, cache: false }, G, ["A cache is wired in front of the nodes"]],
  ];
  for (const [why, id, shape, knobs, expected] of cases) {
    it(why, () => {
      expect(failing(run(id, shape, knobs))).toEqual(expect.arrayContaining(expected));
    });
  }
});
