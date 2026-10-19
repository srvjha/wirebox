import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIGS, runDesign } from "../../../lib/drill/run";
import type { DesignStep, Drill } from "../../../lib/drill/types";
import { buildGraph } from "./graph";
import { DESIGN, REFERENCE } from "./scenarios";

const drill = { steps: [] } as unknown as Drill;
type Id = keyof typeof DESIGN;

function run(id: Id, c: (typeof REFERENCE)[Id]["pass"]) {
  const step = { ...DESIGN[id], type: "design" } as unknown as DesignStep;
  const configs = { ...structuredClone(DEFAULT_CONFIGS), custom: c.knobs ?? {} };
  return runDesign(drill, step, { graph: buildGraph(c.shape), configs, api: {}, schema: { engine: null, tables: [] } }).result;
}
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => (c.constraint.type === "custom" ? "custom" : c.constraint.type));

describe("ticket booking drill: every step's reference design passes", () => {
  for (const id of Object.keys(DESIGN) as Id[]) {
    it(id, () => {
      const r = run(id, REFERENCE[id].pass);
      expect(r.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual([]);
    });
  }
});

describe("ticket booking drill: tempting wrong designs fail for the right reason", () => {
  for (const id of Object.keys(DESIGN) as Id[]) {
    for (const f of REFERENCE[id].fail) {
      it(`${id}: ${f.why}`, () => {
        const got = failing(run(id, f.case));
        for (const t of f.failing) expect(got).toContain(t);
      });
    }
  }
});

import type { Endpoint, SchemaDesign } from "../../../lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { SCHEMA_CHECKS } from "./schema";

const ep = (e: Partial<Endpoint>): Endpoint => ({ method: "GET", path: "/", body: [], status: 200, response: [], location: false, ...e });
const f = (name: string, type: "string" | "timestamp" = "string") => ({ name, type });
const GOOD_API: Record<string, Endpoint> = {
  seats: ep({ path: "/events/:event_id/seats", response: [f("seat_id"), f("status")] }),
  hold: ep({ method: "POST", path: "/events/:event_id/holds", body: [f("seat_id")], status: 201, response: [f("hold_id"), f("expires_at", "timestamp")] }),
  pay: ep({ method: "POST", path: "/holds/:hold_id/payment", body: [f("payment_token"), f("idempotency_key")], status: 202, response: [f("status")] }),
};

describe("ticket booking drill: API checks", () => {
  for (const r of API_REQUIREMENTS) {
    it(`${r.id}: the reference endpoint passes`, () => expect(r.check(GOOD_API[r.id], GOOD_API)).toEqual([]));
  }
  it("naive endpoints fail with specific advice", () => {
    const by = Object.fromEntries(API_REQUIREMENTS.map((r) => [r.id, r]));
    expect(by.hold.check(ep({ method: "GET", path: "/hold", status: 200 }), GOOD_API).join(" ")).toMatch(/GET must never|seat_id|expires_at/);
    expect(by.pay.check(ep({ method: "POST", path: "/holds/:hold_id/payment", body: [f("payment_token")], status: 201 }), GOOD_API).join(" ")).toMatch(/idempotency_key/);
  });
});

const col = (name: string, type: SchemaDesign["tables"][number]["columns"][number]["type"], extra: { pk?: boolean; unique?: boolean } = {}) => ({ id: name, name, type, pk: !!extra.pk, unique: !!extra.unique });
const GOOD_SCHEMA: SchemaDesign = {
  engine: "postgres",
  tables: [
    { id: "s", name: "seats", columns: [col("id", "bigint", { pk: true }), col("event_id", "bigint"), col("status", "text"), col("held_until", "timestamp"), col("version", "integer")] },
    { id: "b", name: "bookings", columns: [col("id", "bigint", { pk: true }), col("seat_id", "bigint", { unique: true }), col("idempotency_key", "text", { unique: true }), col("created_at", "timestamp")] },
  ],
};

describe("ticket booking drill: schema checks", () => {
  it("the reference schema passes every check", () => expect(SCHEMA_CHECKS.map((c) => c.check(GOOD_SCHEMA, GOOD_API))).toEqual(SCHEMA_CHECKS.map(() => null)));
  it("a seat_id without a unique constraint fails, naming the double-booking risk", () => {
    const bad = structuredClone(GOOD_SCHEMA);
    bad.tables[1].columns[1].unique = false;
    expect(SCHEMA_CHECKS.find((c) => c.id === "one-booking")!.check(bad, GOOD_API)).toMatch(/twice/);
  });
});
