import { describe, expect, it } from "vitest";
import { runDesign } from "../../../lib/lab/run";
import type { DesignStep, Lab } from "../../../lib/lab/types";
import type { Endpoint, SchemaDesign } from "../../../lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { SCHEMA_CHECKS } from "./schema";
import { DESIGN, REFERENCE, type Design, type StepId } from "./scenarios";

const lab = { slug: "search-autocomplete", steps: [] } as unknown as Lab;

function run(id: StepId, d: Design) {
  const step = { ...DESIGN[id], type: "design", id } as unknown as DesignStep;
  return runDesign(lab, step, { ...d, api: {}, schema: { engine: null, tables: [] } }).result;
}
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => c.constraint.type);
const ids = Object.keys(DESIGN) as StepId[];

describe("search-autocomplete lab: every step's reference design passes", () => {
  for (const id of ids) {
    it(id, () => {
      const r = run(id, REFERENCE[id].pass);
      expect(r.checks.filter((c) => !c.ok).map((c) => c.message)).toEqual([]);
    });
  }
});

describe("search-autocomplete lab: tempting wrong designs fail for the right reason", () => {
  for (const id of ids) {
    for (const f of REFERENCE[id].fail) {
      it(`${id}: ${f.why}`, () => {
        const r = run(id, f.design);
        expect(r.pass).toBe(false);
        for (const type of f.failing) expect(failing(r)).toContain(type);
      });
    }
  }

  it("the final design still handles every earlier step's traffic (budgets aside)", () => {
    for (const id of ["cache", "topk", "fresh"] as const) {
      const r = run(id, REFERENCE.spike.pass);
      expect(r.checks.filter((c) => !c.ok && c.constraint.type !== "budget").map((c) => c.message)).toEqual([]);
    }
  });
});





const ep = (o: Partial<Endpoint>): Endpoint => ({ method: "GET", path: "/", body: [], status: 200, response: [], location: false, ...o });
const GOOD_API: Record<string, Endpoint> = {
  suggest: ep({ path: "/suggestions/:prefix", response: [{ name: "suggestions", type: "string" }] }),
  record: ep({ method: "POST", path: "/searches", body: [{ name: "query", type: "string" }], status: 202 }),
  trending: ep({ path: "/trending", response: [{ name: "terms", type: "string" }] }),
};

describe("search-autocomplete lab: API checks", () => {
  for (const r of API_REQUIREMENTS) {
    it(`${r.id}: a good endpoint passes`, () => expect(r.check(GOOD_API[r.id], GOOD_API)).toEqual([]));
  }
  it("suggest: a query string is steered into the path so it can be cached", () => {
    expect(API_REQUIREMENTS[0].check(ep({ path: "/suggestions", response: GOOD_API.suggest.response }), GOOD_API).join(" ")).toMatch(/prefix has to be part of the address/);
  });
  it("record: 201 is questioned", () => {
    expect(API_REQUIREMENTS[1].check(ep({ ...GOOD_API.record, status: 201 }), GOOD_API).join(" ")).toMatch(/202/);
  });
});

describe("search-autocomplete lab: schema checks", () => {
  const col = (name: string, type: SchemaDesign["tables"][0]["columns"][0]["type"], pk = false) => ({ id: name, name, type, pk, unique: false });
  const good: SchemaDesign = {
    engine: "dynamodb",
    tables: [
      { id: "t", name: "terms", columns: [col("term", "text", true), col("count", "bigint"), col("last_seen", "timestamp")] },
      { id: "p", name: "suggestions", columns: [col("prefix", "text", true), col("top_terms", "json"), col("updated_at", "timestamp")] },
    ],
  };
  const problems = (s: SchemaDesign) => SCHEMA_CHECKS.map((c) => c.check(s, GOOD_API)).filter(Boolean);
  it("a precomputed-prefix schema passes", () => expect(problems(good)).toEqual([]));
  it("without a prefix table, the lookup is a scan", () => {
    expect(problems({ ...good, tables: [good.tables[0]] }).join(" ")).toMatch(/keyed by prefix/);
  });
});
