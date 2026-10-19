import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIGS, runDesign } from "../../../lib/lab/run";
import type { DesignStep, Lab } from "../../../lib/lab/types";
import { buildGraph } from "./graph";
import { DESIGN, REFERENCE } from "./scenarios";

const lab = { steps: [] } as unknown as Lab;
type Id = keyof typeof DESIGN;

function run(id: Id, c: (typeof REFERENCE)[Id]["pass"]) {
  const step = { ...DESIGN[id], type: "design" } as unknown as DesignStep;
  const configs = { ...structuredClone(DEFAULT_CONFIGS), custom: c.knobs ?? {} };
  return runDesign(lab, step, { graph: buildGraph(c.shape), configs, api: {}, schema: { engine: null, tables: [] } }).result;
}
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => (c.constraint.type === "custom" ? "custom" : c.constraint.type));

describe("ride dispatch lab: every step's reference design passes", () => {
  for (const id of Object.keys(DESIGN) as Id[]) {
    it(id, () => {
      const r = run(id, REFERENCE[id].pass);
      expect(r.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual([]);
    });
  }
});

describe("ride dispatch lab: tempting wrong designs fail for the right reason", () => {
  for (const id of Object.keys(DESIGN) as Id[]) {
    for (const f of REFERENCE[id].fail) {
      it(`${id}: ${f.why}`, () => {
        const got = failing(run(id, f.case));
        for (const t of f.failing) expect(got).toContain(t);
      });
    }
  }
});


import type { Endpoint, SchemaDesign } from "../../../lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { SCHEMA_CHECKS } from "./schema";

const ep = (e: Partial<Endpoint>): Endpoint => ({ method: "GET", path: "/", body: [], status: 200, response: [], location: false, ...e });
const f = (name: string, type: "string" | "integer" | "timestamp" = "string") => ({ name, type });
const GOOD_API: Record<string, Endpoint> = {
  location: ep({ method: "PUT", path: "/drivers/:driver_id/location", body: [f("lat"), f("lng"), f("updated_at", "timestamp")], status: 204 }),
  request: ep({ method: "POST", path: "/rides", body: [f("pickup_lat"), f("pickup_lng")], status: 202, response: [f("ride_id"), f("status")] }),
  ride: ep({ path: "/rides/:ride_id", response: [f("status"), f("driver_id"), f("eta_seconds", "integer")] }),
};

describe("ride dispatch lab: API checks", () => {
  for (const r of API_REQUIREMENTS) it(`${r.id}: the reference endpoint passes`, () => expect(r.check(GOOD_API[r.id], GOOD_API)).toEqual([]));
  it("a GET that reports a location fails with specific advice", () => {
    expect(API_REQUIREMENTS[0].check(ep({ method: "GET", path: "/location", body: [f("lat")], status: 200 }), GOOD_API).join(" ")).toMatch(/safe|lng|timestamp/);
  });
});

const c = (name: string, type: SchemaDesign["tables"][number]["columns"][number]["type"], pk = false) => ({ id: name, name, type, pk, unique: false });
const GOOD_SCHEMA: SchemaDesign = {
  engine: "postgres",
  tables: [
    { id: "d", name: "drivers", columns: [c("id", "bigint", true), c("lat", "text"), c("lng", "text"), c("geohash", "text"), c("status", "text"), c("city_id", "integer")] },
    { id: "r", name: "rides", columns: [c("id", "bigint", true), c("rider_id", "bigint"), c("driver_id", "bigint"), c("status", "text"), c("city_id", "integer")] },
  ],
};

describe("ride dispatch lab: schema checks", () => {
  it("the reference schema passes every check", () => expect(SCHEMA_CHECKS.map((k) => k.check(GOOD_SCHEMA, GOOD_API))).toEqual(SCHEMA_CHECKS.map(() => null)));
  it("without a cell column the schema can't answer 'near'", () => {
    const bad = structuredClone(GOOD_SCHEMA);
    bad.tables[0].columns = bad.tables[0].columns.filter((k) => k.name !== "geohash");
    expect(SCHEMA_CHECKS.find((k) => k.id === "cell")!.check(bad, GOOD_API)).toMatch(/geohash/);
  });
});
