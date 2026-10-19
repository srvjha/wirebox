import { describe, expect, it } from "vitest";
import { resolveKnobs, runFlowTest } from "../../../sim";
import { toSim } from "../../../lib/drill/run";
import { build } from "./graph";
import { DESIGN, REFERENCE, type StepDef, type StepId } from "./scenarios";

function run(step: StepId, d: { spec: Parameters<typeof build>[0]; knobs?: Record<string, string> }) {
  const s: StepDef = DESIGN[step];
  const knobs = resolveKnobs(s.customKnobs, d.knobs);
  const result = runFlowTest({
    ...toSim(build(d.spec)),
    flows: s.flows,
    constraints: s.constraints,
    incident: s.incident,
    nodeConfig: s.nodeDefaults,
    knobs,
  });
  const custom = (s.customChecks?.({ knobs: knobs.choices } as never) ?? []).filter((c) => !c.ok).map(() => "custom");
  return { result, failing: [...result.checks.filter((c) => !c.ok).map((c) => c.constraint.type as string), ...custom] };
}

describe("video platform drill: every step's reference design passes", () => {
  for (const step of Object.keys(DESIGN) as StepId[]) {
    it(step, () => {
      expect(run(step, REFERENCE[step].pass).failing).toEqual([]);
    });
  }
});

describe("video platform drill: tempting wrong designs fail for the right reason", () => {
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

import type { Endpoint, SchemaDesign } from "../../../lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { SCHEMA_CHECKS } from "./schema";

const ep = (o: Partial<Endpoint>): Endpoint => ({ method: "POST", path: "/videos", body: [], status: 201, response: [], location: false, ...o });
const f = (name: string, type: "string" | "integer" | "url" = "string") => ({ name, type });

describe("video platform drill: API and schema checks", () => {
  const good: Record<string, Endpoint> = {
    start: ep({ body: [f("title"), f("size_bytes", "integer")], response: [f("video_id"), f("upload_url", "url")] }),
    complete: ep({ path: "/videos/:id/complete", status: 202, response: [f("status")] }),
    watch: ep({ method: "GET", path: "/videos/:id", status: 200, response: [f("status"), f("manifest_url", "url")] }),
  };
  it("a sound API passes every requirement", () => {
    for (const r of API_REQUIREMENTS) expect(r.check(good[r.id], good)).toEqual([]);
  });
  it("answering 200 for 'complete' is called out", () => {
    const r = API_REQUIREMENTS.find((x) => x.id === "complete")!;
    expect(r.check({ ...good.complete, status: 200 }, good).join(" ")).toMatch(/202/);
  });
  it("a sound schema passes and a bare one doesn't", () => {
    const c = (name: string, type: SchemaDesign["tables"][0]["columns"][0]["type"] = "text") => ({ id: name, name, type, pk: false, unique: false });
    const schema: SchemaDesign = {
      engine: "postgres",
      tables: [
        { id: "v", name: "videos", columns: [c("id", "bigint"), c("owner_id", "bigint"), c("status"), c("raw_object_key"), c("manifest_url"), c("created_at", "timestamp")] },
        { id: "r", name: "renditions", columns: [c("id", "bigint"), c("video_id", "bigint"), c("height", "integer")] },
      ],
    };
    expect(SCHEMA_CHECKS.map((k) => k.check(schema, good)).filter(Boolean)).toEqual([]);
    expect(SCHEMA_CHECKS.map((k) => k.check({ engine: null, tables: [] }, good)).filter(Boolean).length).toBeGreaterThan(3);
  });
});
