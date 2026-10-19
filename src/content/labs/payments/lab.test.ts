import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIGS, runDesign } from "../../../lib/lab/run";
import type { DesignStep, Lab } from "../../../lib/lab/types";
import { buildGraph } from "./graph";
import { DESIGN, REFERENCE } from "./scenarios";

const lab = { steps: [] } as unknown as Lab;
type Id = keyof typeof DESIGN;

function run(id: Id, c: (typeof REFERENCE)[Id]["pass"]) {
  const step = { ...DESIGN[id], type: "design" } as unknown as DesignStep;
  const configs = { ...structuredClone(DEFAULT_CONFIGS), custom: c.knobs ?? {}, resilience: { ...DEFAULT_CONFIGS.resilience, healthChecks: !!c.healthChecks } };
  return runDesign(lab, step, { graph: buildGraph(c.shape), configs, api: {}, schema: { engine: null, tables: [] } }).result;
}
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => (c.constraint.type === "custom" ? "custom" : c.constraint.type));

describe("payments lab: every step's reference design passes", () => {
  for (const id of Object.keys(DESIGN) as Id[]) {
    it(id, () => {
      const r = run(id, REFERENCE[id].pass);
      expect(r.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual([]);
    });
  }
});

describe("payments lab: tempting wrong designs fail for the right reason", () => {
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
const f = (name: string, type: "string" | "integer" = "string") => ({ name, type });
const GOOD_API: Record<string, Endpoint> = {
  create: ep({ method: "POST", path: "/payments", body: [f("amount", "integer"), f("currency"), f("payment_token"), f("idempotency_key")], status: 202, response: [f("payment_id"), f("status")] }),
  status: ep({ path: "/payments/:payment_id", response: [f("status")] }),
  refund: ep({ method: "POST", path: "/payments/:payment_id/refunds", body: [f("amount", "integer"), f("idempotency_key")], status: 202 }),
};

describe("payments lab: API checks", () => {
  for (const r of API_REQUIREMENTS) it(`${r.id}: the reference endpoint passes`, () => expect(r.check(GOOD_API[r.id], GOOD_API)).toEqual([]));
  it("a float amount and a missing key fail with specific advice", () => {
    const bad = ep({ method: "POST", path: "/payments", body: [f("amount", "string"), f("payment_token")], status: 200 });
    const out = API_REQUIREMENTS[0].check(bad, GOOD_API).join(" ");
    expect(out).toMatch(/integer/);
    expect(out).toMatch(/idempotency_key/);
  });
});

const c = (name: string, type: SchemaDesign["tables"][number]["columns"][number]["type"], x: { pk?: boolean; unique?: boolean } = {}) => ({ id: name, name, type, pk: !!x.pk, unique: !!x.unique });
const GOOD_SCHEMA: SchemaDesign = {
  engine: "postgres",
  tables: [
    { id: "p", name: "payments", columns: [c("id", "uuid", { pk: true }), c("amount", "bigint"), c("currency", "char(7)"), c("idempotency_key", "text", { unique: true }), c("status", "text"), c("created_at", "timestamp")] },
    { id: "l", name: "ledger_entries", columns: [c("id", "bigint", { pk: true }), c("account_id", "bigint"), c("amount", "bigint"), c("payment_id", "uuid")] },
    { id: "o", name: "outbox", columns: [c("id", "bigint", { pk: true }), c("payload", "json"), c("published_at", "timestamp")] },
  ],
};

describe("payments lab: schema checks", () => {
  it("the reference schema passes every check", () => expect(SCHEMA_CHECKS.map((k) => k.check(GOOD_SCHEMA, GOOD_API))).toEqual(SCHEMA_CHECKS.map(() => null)));
  it("a float-ish amount and a non-unique key fail", () => {
    const bad = structuredClone(GOOD_SCHEMA);
    bad.tables[0].columns[1].type = "json";
    bad.tables[0].columns[3].unique = false;
    expect(SCHEMA_CHECKS.find((k) => k.id === "amount")!.check(bad, GOOD_API)).toMatch(/bigint/);
    expect(SCHEMA_CHECKS.find((k) => k.id === "idem")!.check(bad, GOOD_API)).toMatch(/unique/);
  });
});
