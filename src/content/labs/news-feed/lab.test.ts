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

describe("photo feed lab: every step's reference design passes", () => {
  for (const step of Object.keys(DESIGN) as StepId[]) {
    it(step, () => {
      expect(run(step, REFERENCE[step].pass).failing).toEqual([]);
    });
  }
});

describe("photo feed lab: tempting wrong designs fail for the right reason", () => {
  for (const step of Object.keys(DESIGN) as StepId[]) {
    for (const f of REFERENCE[step].fail) {
      it(`${step}: ${f.why}`, () => {
        const got = run(step, f.design).failing;
        expect(got.length).toBeGreaterThan(0);
        for (const type of f.failing) expect(got).toContain(type);
      });
    }
  }

  it("the final design also passes the earlier celebrity step", () => {
    expect(run("celebrity", REFERENCE.spike.pass).failing).toEqual([]);
  });
});

import type { Endpoint, SchemaDesign } from "../../../lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { SCHEMA_CHECKS } from "./schema";

const ep = (o: Partial<Endpoint>): Endpoint => ({ method: "POST", path: "/", body: [], status: 201, response: [], location: false, ...o });
const f = (name: string, type: "string" | "integer" = "string") => ({ name, type });

describe("photo feed lab: API and schema checks", () => {
  const good: Record<string, Endpoint> = {
    post: ep({ path: "/posts", body: [f("caption"), f("photo_key")], response: [f("post_id")] }),
    feed: ep({ method: "GET", path: "/feed", status: 200, body: [f("cursor"), f("limit", "integer")], response: [f("posts"), f("next_cursor")] }),
    follow: ep({ method: "PUT", path: "/users/:id/follow", status: 204 }),
  };
  it("a sound API passes every requirement", () => {
    for (const r of API_REQUIREMENTS) expect(r.check(good[r.id], good)).toEqual([]);
  });
  it("offset pagination is called out", () => {
    const r = API_REQUIREMENTS.find((x) => x.id === "feed")!;
    expect(r.check({ ...good.feed, body: [f("page", "integer"), f("limit", "integer")] }, good).join(" ")).toMatch(/cursor/);
  });
  it("a sound schema passes and an empty one doesn't", () => {
    const c = (name: string, type: SchemaDesign["tables"][0]["columns"][0]["type"] = "bigint") => ({ id: name, name, type, pk: false, unique: false });
    const schema: SchemaDesign = {
      engine: "cassandra",
      tables: [
        { id: "p", name: "posts", columns: [c("author_id"), c("photo_key", "text"), c("created_at", "timestamp")] },
        { id: "f", name: "follows", columns: [c("follower_id"), c("followee_id")] },
        { id: "u", name: "users", columns: [c("followers_count")] },
        { id: "t", name: "timelines", columns: [c("user_id"), c("post_id")] },
      ],
    };
    expect(SCHEMA_CHECKS.map((k) => k.check(schema, good)).filter(Boolean)).toEqual([]);
    expect(SCHEMA_CHECKS.map((k) => k.check({ engine: null, tables: [] }, good)).filter(Boolean).length).toBeGreaterThan(3);
  });
});
