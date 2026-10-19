import { describe, expect, it } from "vitest";
import { runDesign } from "../../../lib/lab/run";
import type { DesignStep, Lab } from "../../../lib/lab/types";
import type { Endpoint, SchemaDesign } from "../../../lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { SCHEMA_CHECKS } from "./schema";
import { DESIGN, REFERENCE, type Design, type StepId } from "./scenarios";

const lab = { slug: "presence", steps: [] } as unknown as Lab;

function run(id: StepId, d: Design) {
  const step = { ...DESIGN[id], type: "design", id } as unknown as DesignStep;
  return runDesign(lab, step, { ...d, api: {}, schema: { engine: null, tables: [] } }).result;
}
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => c.constraint.type);
const ids = Object.keys(DESIGN) as StepId[];

describe("presence lab: every step's reference design passes", () => {
  for (const id of ids) {
    it(id, () => {
      const r = run(id, REFERENCE[id].pass);
      expect(r.checks.filter((c) => !c.ok).map((c) => c.message)).toEqual([]);
    });
  }
});

describe("presence lab: tempting wrong designs fail for the right reason", () => {
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
    for (const id of ["scale", "fanout", "timeouts"] as const) {
      const r = run(id, REFERENCE.gateway.pass);
      expect(r.checks.filter((c) => !c.ok && c.constraint.type !== "budget").map((c) => c.message)).toEqual([]);
    }
  });
});







const ep = (o: Partial<Endpoint>): Endpoint => ({ method: "GET", path: "/", body: [], status: 200, response: [], location: false, ...o });
const GOOD_API: Record<string, Endpoint> = {
  set: ep({ method: "PUT", path: "/users/:user_id/presence", body: [{ name: "status", type: "string" }], status: 204 }),
  get: ep({ path: "/users/:user_id/presence", response: [{ name: "online", type: "boolean" }, { name: "last_seen", type: "timestamp" }] }),
  friends: ep({ path: "/users/:user_id/friends/presence", response: [{ name: "friends", type: "string" }] }),
};

describe("presence lab: API checks", () => {
  for (const r of API_REQUIREMENTS) {
    it(`${r.id}: a good endpoint passes`, () => expect(r.check(GOOD_API[r.id], GOOD_API)).toEqual([]));
  }
  it("set: POST is steered to PUT", () => {
    expect(API_REQUIREMENTS[0].check(ep({ ...GOOD_API.set, method: "POST" }), GOOD_API).join(" ")).toMatch(/PUT/);
  });
  it("get: online must be a boolean and last_seen present", () => {
    const bad = ep({ path: "/users/:user_id/presence", response: [{ name: "online", type: "string" }] });
    const problems = API_REQUIREMENTS[1].check(bad, GOOD_API).join(" ");
    expect(problems).toMatch(/boolean/);
    expect(problems).toMatch(/last_seen/);
  });
});

describe("presence lab: schema checks", () => {
  const col = (name: string, type: SchemaDesign["tables"][0]["columns"][0]["type"], pk = false) => ({ id: name, name, type, pk, unique: false });
  const good: SchemaDesign = {
    engine: "cassandra",
    tables: [
      { id: "p", name: "presence", columns: [col("user_id", "bigint", true), col("status", "text"), col("last_seen", "timestamp"), col("gateway_id", "text")] },
      { id: "f", name: "friendships", columns: [col("user_id", "bigint", true), col("friend_id", "bigint", true)] },
    ],
  };
  const problems = (s: SchemaDesign) => SCHEMA_CHECKS.map((c) => c.check(s, GOOD_API)).filter(Boolean);
  it("a complete schema passes", () => expect(problems(good)).toEqual([]));
  it("a friendships table without a key is rejected", () => {
    const bad = { ...good, tables: [good.tables[0], { ...good.tables[1], columns: good.tables[1].columns.map((c) => ({ ...c, pk: false })) }] };
    expect(problems(bad).join(" ")).toMatch(/primary key/);
  });
  it("no gateway column: nobody knows where to push", () => {
    const bad = { ...good, tables: [{ ...good.tables[0], columns: good.tables[0].columns.filter((c) => c.name !== "gateway_id") }, good.tables[1]] };
    expect(problems(bad).join(" ")).toMatch(/gateway/);
  });
});
