import { describe, expect, it } from "vitest";
import { runDesign } from "../../../lib/lab/run";
import type { DesignStep, Lab } from "../../../lib/lab/types";
import type { Endpoint, SchemaDesign } from "../../../lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { SCHEMA_CHECKS } from "./schema";
import { DESIGN, REFERENCE, type Design, type StepId } from "./scenarios";

const lab = { slug: "pastebin", steps: [] } as unknown as Lab;

function run(id: StepId, d: Design) {
  const step = { ...DESIGN[id], type: "design", id } as unknown as DesignStep;
  return runDesign(lab, step, { ...d, api: {}, schema: { engine: null, tables: [] } }).result;
}
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => c.constraint.type);
const ids = Object.keys(DESIGN) as StepId[];

describe("pastebin lab: every step's reference design passes", () => {
  for (const id of ids) {
    it(id, () => {
      const r = run(id, REFERENCE[id].pass);
      expect(r.checks.filter((c) => !c.ok).map((c) => c.message)).toEqual([]);
    });
  }
});

describe("pastebin lab: tempting wrong designs fail for the right reason", () => {
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
    for (const id of ["launch", "viral", "expiry", "abuse"] as const) {
      const r = run(id, REFERENCE.server.pass);
      expect(r.checks.filter((c) => !c.ok && c.constraint.type !== "budget").map((c) => c.message)).toEqual([]);
    }
  });
});

const ep = (o: Partial<Endpoint>): Endpoint => ({ method: "GET", path: "/", body: [], status: 200, response: [], location: false, ...o });
const GOOD_API: Record<string, Endpoint> = {
  create: ep({ method: "POST", path: "/pastes", body: [{ name: "content", type: "string" }, { name: "expires_in", type: "integer" }], status: 201, response: [{ name: "id", type: "string" }] }),
  read: ep({ path: "/pastes/:id", response: [{ name: "content", type: "string" }] }),
  remove: ep({ method: "DELETE", path: "/pastes/:id", status: 204 }),
};

describe("pastebin lab: API checks", () => {
  for (const r of API_REQUIREMENTS) {
    it(`${r.id}: a good endpoint passes`, () => expect(r.check(GOOD_API[r.id], GOOD_API)).toEqual([]));
  }
  it("flags a create that is a GET without an expiry", () => {
    const problems = API_REQUIREMENTS[0].check(ep({ path: "/pastes", body: [{ name: "content", type: "string" }] }), GOOD_API).join(" ");
    expect(problems).toMatch(/GET must never create/);
    expect(problems).toMatch(/expire/);
  });
  it("flags a delete that is a POST", () => {
    expect(API_REQUIREMENTS[2].check(ep({ method: "POST", path: "/pastes/:id", status: 204 }), GOOD_API).join(" ")).toMatch(/DELETE/);
  });
});

describe("pastebin lab: schema checks", () => {
  const col = (name: string, type: SchemaDesign["tables"][0]["columns"][0]["type"], pk = false) => ({ id: name, name, type, pk, unique: false });
  const good: SchemaDesign = {
    engine: "postgres",
    tables: [{ id: "t", name: "pastes", columns: [col("id", "text", true), col("blob_key", "text"), col("expires_at", "timestamp"), col("created_at", "timestamp"), col("size_bytes", "bigint")] }],
  };
  const problems = (s: SchemaDesign) => SCHEMA_CHECKS.map((c) => c.check(s, GOOD_API)).filter(Boolean);
  it("a pointer-based schema passes", () => expect(problems(good)).toEqual([]));
  it("storing the text in the row is rejected", () => {
    const bad = { ...good, tables: [{ ...good.tables[0], columns: [...good.tables[0].columns, col("content", "text")] }] };
    expect(problems(bad).join(" ")).toMatch(/object storage/);
  });
  it("a counter id is rejected as guessable", () => {
    const bad = { ...good, tables: [{ ...good.tables[0], columns: [col("id", "bigint", true), ...good.tables[0].columns.slice(1)] }] };
    expect(problems(bad).join(" ")).toMatch(/guessable/);
  });
});
