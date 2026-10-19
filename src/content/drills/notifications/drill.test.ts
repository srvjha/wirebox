import { describe, expect, it } from "vitest";
import { runDesign } from "../../../lib/drill/run";
import type { DesignStep, Drill } from "../../../lib/drill/types";
import type { Endpoint, SchemaDesign } from "../../../lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { SCHEMA_CHECKS } from "./schema";
import { DESIGN, REFERENCE, type Design, type StepId } from "./scenarios";

const drill = { slug: "notifications", steps: [] } as unknown as Drill;

function run(id: StepId, d: Design) {
  const step = { ...DESIGN[id], type: "design", id } as unknown as DesignStep;
  return runDesign(drill, step, { ...d, api: {}, schema: { engine: null, tables: [] } }).result;
}
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => c.constraint.type);
const ids = Object.keys(DESIGN) as StepId[];

describe("notifications drill: every step's reference design passes", () => {
  for (const id of ids) {
    it(id, () => {
      const r = run(id, REFERENCE[id].pass);
      expect(r.checks.filter((c) => !c.ok).map((c) => c.message)).toEqual([]);
    });
  }
});

describe("notifications drill: tempting wrong designs fail for the right reason", () => {
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
    for (const id of ["blast", "slow", "lanes"] as const) {
      const r = run(id, REFERENCE.once.pass);
      expect(r.checks.filter((c) => !c.ok && c.constraint.type !== "budget").map((c) => c.message)).toEqual([]);
    }
  });
});



const ep = (o: Partial<Endpoint>): Endpoint => ({ method: "GET", path: "/", body: [], status: 200, response: [], location: false, ...o });
const GOOD_API: Record<string, Endpoint> = {
  send: ep({
    method: "POST",
    path: "/notifications",
    body: [{ name: "user_id", type: "string" }, { name: "channel", type: "string" }, { name: "template", type: "string" }, { name: "idempotency_key", type: "string" }],
    status: 202,
    response: [{ name: "id", type: "string" }],
  }),
  status: ep({ path: "/notifications/:id", response: [{ name: "status", type: "string" }] }),
  prefs: ep({ method: "PUT", path: "/users/:user_id/preferences", body: [{ name: "email", type: "boolean" }, { name: "sms", type: "boolean" }] }),
};

describe("notifications drill: API checks", () => {
  for (const r of API_REQUIREMENTS) {
    it(`${r.id}: a good endpoint passes`, () => expect(r.check(GOOD_API[r.id], GOOD_API)).toEqual([]));
  }
  it("send: 200 with no idempotency key is flagged twice", () => {
    const bad = ep({ ...GOOD_API.send, status: 200, body: GOOD_API.send.body.filter((f) => f.name !== "idempotency_key") });
    const problems = API_REQUIREMENTS[0].check(bad, GOOD_API).join(" ");
    expect(problems).toMatch(/idempotency_key/);
    expect(problems).toMatch(/202 Accepted/);
  });
  it("prefs: POST is steered to PUT", () => {
    expect(API_REQUIREMENTS[2].check(ep({ ...GOOD_API.prefs, method: "POST" }), GOOD_API).join(" ")).toMatch(/PUT/);
  });
});

describe("notifications drill: schema checks", () => {
  const col = (name: string, type: SchemaDesign["tables"][0]["columns"][0]["type"], pk = false, unique = false) => ({ id: name, name, type, pk, unique });
  const good: SchemaDesign = {
    engine: "postgres",
    tables: [
      {
        id: "n",
        name: "notifications",
        columns: [col("id", "uuid", true), col("user_id", "uuid"), col("channel", "text"), col("idempotency_key", "text", false, true), col("status", "text"), col("attempts", "integer"), col("created_at", "timestamp"), col("sent_at", "timestamp")],
      },
      { id: "p", name: "preferences", columns: [col("user_id", "uuid", true), col("email", "boolean"), col("sms", "boolean"), col("push", "boolean")] },
    ],
  };
  const problems = (s: SchemaDesign) => SCHEMA_CHECKS.map((c) => c.check(s, GOOD_API)).filter(Boolean);
  it("a complete schema passes", () => expect(problems(good)).toEqual([]));
  it("a non-unique idempotency key is rejected", () => {
    const bad = { ...good, tables: [{ ...good.tables[0], columns: good.tables[0].columns.map((c) => (c.name === "idempotency_key" ? { ...c, unique: false } : c)) }, good.tables[1]] };
    expect(problems(bad).join(" ")).toMatch(/unique/);
  });
});
