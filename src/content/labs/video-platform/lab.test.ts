import { describe, expect, it } from "vitest";
import { resolveKnobs, runFlowTest } from "../../../sim";
import { toSim } from "../../../lib/lab/run";
import { build } from "./graph";
import { DESIGN, REFERENCE, type StepId } from "./scenarios";

function run(step: StepId, d: { spec: Parameters<typeof build>[0]; knobs?: Record<string, string> }) {
  const s = DESIGN[step] as (typeof DESIGN)[StepId] & { customKnobs?: never; customChecks?: never; incident?: never; nodeDefaults?: never };
  const knobs = resolveKnobs(s.customKnobs, d.knobs);
  const result = runFlowTest({
    ...toSim(build(d.spec)),
    flows: s.flows,
    constraints: s.constraints,
    incident: s.incident,
    nodeConfig: s.nodeDefaults,
    knobs,
  });
  const custom = (s.customChecks?.({ knobs: knobs.choices } as never) ?? []).filter((c: { ok: boolean }) => !c.ok).map(() => "custom");
  return { result, failing: [...result.checks.filter((c) => !c.ok).map((c) => c.constraint.type as string), ...custom] };
}

describe("video platform lab: every step's reference design passes", () => {
  for (const step of Object.keys(DESIGN) as StepId[]) {
    it(step, () => {
      expect(run(step, REFERENCE[step].pass).failing).toEqual([]);
    });
  }
});

describe("video platform lab: tempting wrong designs fail for the right reason", () => {
  for (const step of Object.keys(DESIGN) as StepId[]) {
    for (const f of REFERENCE[step].fail) {
      it(`${step}: ${f.why}`, () => {
        const got = run(step, f.design).failing;
        expect(got.length).toBeGreaterThan(0);
        for (const type of f.failing) expect(got).toContain(type);
      });
    }
  }

  it("each reference still passes the earlier, lighter steps it builds on", () => {
    expect(run("ladder", REFERENCE.viral.pass).failing).toEqual([]);
  });
});
