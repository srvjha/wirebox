import { describe, expect, it } from "vitest";
import { resolveKnobs, runFlowTest } from "../../../sim";
import { toSim } from "../../../lib/drill/run";
import { build } from "./graph";
import { DESIGN, REFERENCE, type StepDef, type StepId } from "./scenarios";

function run(step: StepId, d: { spec: Parameters<typeof build>[0]; knobs?: Record<string, string>; healthChecks?: boolean }) {
  const s: StepDef = DESIGN[step];
  const knobs = resolveKnobs(s.customKnobs, d.knobs);
  const result = runFlowTest({
    ...toSim(build(d.spec)),
    flows: s.flows,
    constraints: s.constraints,
    incident: s.incident,
    nodeConfig: s.nodeDefaults,
    knobs,
    healthChecks: d.healthChecks,
  });
  const custom = (s.customChecks?.({ knobs: knobs.choices } as never) ?? []).filter((c) => !c.ok).map(() => "custom");
  return { result, failing: [...result.checks.filter((c) => !c.ok).map((c) => c.constraint.type as string), ...custom] };
}

describe("chat drill: every step's reference design passes", () => {
  for (const step of Object.keys(DESIGN) as StepId[]) {
    it(step, () => {
      expect(run(step, REFERENCE[step].pass).failing).toEqual([]);
    });
  }
});

describe("chat drill: tempting wrong designs fail for the right reason", () => {
  for (const step of Object.keys(DESIGN) as StepId[]) {
    for (const f of REFERENCE[step].fail) {
      it(`${step}: ${f.why}`, () => {
        const got = run(step, f.design).failing;
        expect(got.length).toBeGreaterThan(0);
        for (const type of f.failing) expect(got).toContain(type);
      });
    }
  }

  it("the final design also passes the receipts step it grew from", () => {
    expect(run("receipts", { ...REFERENCE.failure.pass, healthChecks: false }).failing).toEqual([]);
  });
});


import type { Endpoint, SchemaDesign } from "../../../lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { SCHEMA_CHECKS } from "./schema";

const ep = (o: Partial<Endpoint>): Endpoint => ({ method: "POST", path: "/", body: [], status: 201, response: [], location: false, ...o });
const f = (name: string, type: "string" | "integer" = "string") => ({ name, type });

describe("chat drill: API and schema checks", () => {
  const good: Record<string, Endpoint> = {
    send: ep({ path: "/conversations/:id/messages", body: [f("client_msg_id"), f("text")], response: [f("message_id"), f("seq", "integer")] }),
    sync: ep({ method: "GET", path: "/conversations/:id/messages", status: 200, body: [f("after_seq", "integer")], response: [f("messages")] }),
    receipt: ep({ path: "/messages/:id/receipt", status: 204, body: [f("state")] }),
  };
  it("a sound API passes every requirement", () => {
    for (const r of API_REQUIREMENTS) expect(r.check(good[r.id], good)).toEqual([]);
  });
  it("a send without a client id is called out", () => {
    const r = API_REQUIREMENTS.find((x) => x.id === "send")!;
    expect(r.check({ ...good.send, body: [f("text")] }, good).join(" ")).toMatch(/client-generated id/);
  });
  it("a sound schema passes and an empty one doesn't", () => {
    const c = (name: string, type: SchemaDesign["tables"][0]["columns"][0]["type"] = "text", unique = false) => ({ id: name, name, type, pk: false, unique });
    const schema: SchemaDesign = {
      engine: "cassandra",
      tables: [
        { id: "m", name: "messages", columns: [c("conversation_id", "bigint"), c("seq", "bigint"), c("client_msg_id", "uuid", true), c("text")] },
        { id: "p", name: "conversation_members", columns: [c("conversation_id", "bigint"), c("user_id", "bigint"), c("last_read_seq", "bigint")] },
      ],
    };
    expect(SCHEMA_CHECKS.map((k) => k.check(schema, good)).filter(Boolean)).toEqual([]);
    expect(SCHEMA_CHECKS.map((k) => k.check({ engine: null, tables: [] }, good)).filter(Boolean).length).toBeGreaterThan(3);
  });
});
