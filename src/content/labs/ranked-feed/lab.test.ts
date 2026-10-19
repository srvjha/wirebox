import { describe, expect, it } from "vitest";
import { resolveKnobs, runFlowTest } from "../../../sim";
import { toSim } from "../../../lib/lab/run";
import { build } from "./graph";
import { DESIGN, REFERENCE, type StepDef, type StepId } from "./scenarios";

function run(step: StepId, d: { spec: Parameters<typeof build>[0]; knobs?: Record<string, string> }) {
  const s: StepDef = DESIGN[step];
  const knobs = resolveKnobs(s.customKnobs, d.knobs);
  const graph = build(d.spec);
  const result = runFlowTest({
    ...toSim(graph),
    flows: s.flows,
    constraints: s.constraints,
    incident: s.incident,
    nodeConfig: s.nodeDefaults,
    knobs,
  });
  const custom = (s.customChecks?.({ knobs: knobs.choices, graph } as never) ?? []).filter((c) => !c.ok).map(() => "custom");
  return { result, failing: [...result.checks.filter((c) => !c.ok).map((c) => c.constraint.type as string), ...custom] };
}

describe("ranked feed lab: every step's reference design passes", () => {
  for (const step of Object.keys(DESIGN) as StepId[]) {
    it(step, () => {
      expect(run(step, REFERENCE[step].pass).failing).toEqual([]);
    });
  }
});

describe("ranked feed lab: tempting wrong designs fail for the right reason", () => {
  for (const step of Object.keys(DESIGN) as StepId[]) {
    for (const f of REFERENCE[step].fail) {
      it(`${step}: ${f.why}`, () => {
        const got = run(step, f.design).failing;
        expect(got.length).toBeGreaterThan(0);
        for (const type of f.failing) expect(got).toContain(type);
      });
    }
  }

  it("the final design also passes the earlier ranking step", () => {
    expect(run("ranking", REFERENCE.brigade.pass).failing).toEqual([]);
  });

  it("brigade: limiting per account alone is a defensible, if leakier, alternative", () => {
    const d = { spec: REFERENCE.brigade.pass.spec, knobs: { limitBy: "account" } };
    expect(run("brigade", d).failing).toEqual([]);
  });
});

import type { Endpoint, SchemaDesign } from "../../../lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { SCHEMA_CHECKS } from "./schema";

const ep = (o: Partial<Endpoint>): Endpoint => ({ method: "POST", path: "/", body: [], status: 201, response: [], location: false, ...o });
const f = (name: string, type: "string" | "integer" = "string") => ({ name, type });

describe("ranked feed lab: API and schema checks", () => {
  const good: Record<string, Endpoint> = {
    submit: ep({ path: "/posts", body: [f("title"), f("url")], response: [f("post_id")] }),
    vote: ep({ method: "PUT", path: "/posts/:id/vote", status: 204, body: [f("direction")] }),
    front: ep({ method: "GET", path: "/posts", status: 200, body: [f("sort"), f("cursor"), f("limit", "integer")], response: [f("posts"), f("next_cursor")] }),
  };
  it("a sound API passes every requirement", () => {
    for (const r of API_REQUIREMENTS) expect(r.check(good[r.id], good)).toEqual([]);
  });
  it("a POST vote is called out as non-idempotent", () => {
    const r = API_REQUIREMENTS.find((x) => x.id === "vote")!;
    expect(r.check({ ...good.vote, method: "POST" }, good).join(" ")).toMatch(/PUT/);
  });
  it("a sound schema passes and an empty one doesn't", () => {
    const c = (name: string, type: SchemaDesign["tables"][0]["columns"][0]["type"] = "bigint", pk = false) => ({ id: name, name, type, pk, unique: false });
    const schema: SchemaDesign = {
      engine: "postgres",
      tables: [
        { id: "p", name: "posts", columns: [c("id", "bigint", true), c("vote_count"), c("rank_score"), c("created_at", "timestamp")] },
        { id: "v", name: "votes", columns: [c("user_id", "bigint", true), c("post_id", "bigint", true)] },
      ],
    };
    expect(SCHEMA_CHECKS.map((k) => k.check(schema, good)).filter(Boolean)).toEqual([]);
    expect(SCHEMA_CHECKS.map((k) => k.check({ engine: null, tables: [] }, good)).filter(Boolean).length).toBeGreaterThan(3);
  });
});
