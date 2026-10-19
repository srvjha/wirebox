import { describe, expect, it } from "vitest";
import { runTest } from "../../../sim";
import { toSim } from "../../../lib/drill/run";
import { CACHE_VALUES } from "./values";
import { DESIGN, REFERENCE, buildGraph, configs } from "./scenarios";

type Design = { graph: Parameters<typeof toSim>[0]; configs: ReturnType<typeof configs> };

function run(step: keyof typeof DESIGN, d: Design) {
  const { scenario, constraints } = DESIGN[step];
  return runTest({
    ...toSim(d.graph),
    scenario,
    constraints,
    cache: d.configs.cache,
    cacheParam: "slug",
    cacheValues: CACHE_VALUES,
    limiter: d.configs.limiter,
    resilience: d.configs.resilience,
  });
}

const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => c.constraint.type);

describe("URL shortener drill: every step's reference design passes", () => {
  for (const step of Object.keys(DESIGN) as (keyof typeof DESIGN)[]) {
    it(step, () => {
      expect(failing(run(step, REFERENCE[step].pass))).toEqual([]);
    });
  }
});

describe("URL shortener drill: tempting wrong designs fail for the right reason", () => {
  for (const step of Object.keys(DESIGN) as (keyof typeof DESIGN)[]) {
    for (const f of REFERENCE[step].fail) {
      it(`${step}: ${f.why}`, () => {
        const got = failing(run(step, f.design));
        for (const type of f.failing) expect(got).toContain(type);
      });
    }
  }

  it("freshness: reading from the primary also fixes read-your-writes", () => {
    const graph = buildGraph({ servers: 6, size: "m", lb: true, cache: true, limiter: true, replicas: 1 });
    const c = configs({ cache: { onMiss: "coalesce" }, resilience: { healthChecks: true, failover: true, readFrom: "primary" } });
    expect(failing(run("freshness", { graph, configs: c }))).toEqual([]);
  });

  it("each step's reference still passes the earlier steps it builds on", () => {
    // The canvas carries over, so a learner's passing design must not break when load grows.
    const r = run("primary", REFERENCE.freshness.pass);
    expect(failing(r)).toEqual([]);
  });
});
