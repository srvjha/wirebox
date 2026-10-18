import { describe, expect, it } from "vitest";
import {
  evaluateFlows,
  resolveKnobs,
  type Flow,
  type FlowEvalInput,
  type Kind,
  type SimEdge,
  type SimNode,
} from "./index";

type N = [id: string, kind: Kind, extra?: Partial<SimNode>];

/** Build a graph from `["id", kind]` nodes and `"a>b"` edge strings. A "client" node is added. */
function graph(nodes: N[], edges: string[]): { nodes: SimNode[]; edges: SimEdge[] } {
  return {
    nodes: [{ id: "client", kind: "client" }, ...nodes.map(([id, kind, extra]) => ({ id, kind, ...extra }))],
    edges: edges.map((e) => {
      const [from, to] = e.split(">");
      return { from, to };
    }),
  };
}

const evalFlows = (g: ReturnType<typeof graph>, flows: Flow[], extra: Partial<FlowEvalInput> = {}) =>
  evaluateFlows({ ...g, flows, ...extra });

const web: Flow = {
  id: "web",
  label: "Browse",
  rps: 1000,
  route: [{ kind: "lb", optional: true }, { kind: "server" }, { kind: "db" }],
};

describe("flows: routing", () => {
  it("serves a simple route through the learner's wires", () => {
    const r = evalFlows(graph([["s", "server"], ["d", "db"]], ["client>s", "s>d"]), [web]);
    expect(r.flows[0].success).toBeCloseTo(1, 3);
    expect(r.edges["client>s"]).toBeCloseTo(1000);
    expect(r.nodes.d.load).toBeCloseTo(1000);
  });

  it("fails a flow with a specific message when a required hop is missing", () => {
    const upload: Flow = {
      id: "upload",
      label: "Uploads",
      rps: 100,
      route: [
        { kind: "server" },
        { kind: "storage", missing: "Uploads need object storage: wire the API server to Storage." },
      ],
    };
    const r = evalFlows(graph([["s", "server"]], ["client>s"]), [upload]);
    expect(r.flows[0].success).toBe(0);
    expect(r.issues).toContain("Uploads need object storage: wire the API server to Storage.");
  });

  it("skips optional hops and passes through lb / limiter", () => {
    const r = evalFlows(
      graph(
        [["lim", "limiter"], ["lb", "lb"], ["s1", "server"], ["s2", "server"], ["d", "db"]],
        ["client>lim", "lim>lb", "lb>s1", "lb>s2", "s1>d", "s2>d"],
      ),
      [web],
    );
    expect(r.flows[0].success).toBeCloseTo(1, 3);
    expect(r.nodes.s1.load).toBeCloseTo(500);
    expect(r.nodes.lb.load).toBeCloseTo(1000);
  });

  it("a dead server fails its share unless the lb has health checks", () => {
    const g = graph([["lb", "lb"], ["s1", "server"], ["s2", "server"], ["d", "db"]], ["client>lb", "lb>s1", "lb>s2", "s1>d", "s2>d"]);
    const blind = evalFlows(g, [web], { down: ["s1"] });
    expect(blind.flows[0].success).toBeCloseTo(0.5, 2);
    const checked = evalFlows(g, [web], { down: ["s1"], healthChecks: true });
    expect(checked.flows[0].success).toBeCloseTo(1, 2);
  });

  it("an overloaded server drops traffic and reports it", () => {
    const r = evalFlows(graph([["s", "server"], ["d", "db"]], ["client>s", "s>d"]), [{ ...web, rps: 16_000 }]);
    expect(r.flows[0].success).toBeCloseTo(0.5, 1);
    expect(r.issues.join(" ")).toMatch(/API server is at 200%/);
  });
});

describe("flows: cdn and cache", () => {
  const photo: Flow = {
    id: "photo",
    label: "View photo",
    rps: 20_000,
    route: [{ kind: "cdn", optional: true, cacheable: 0.9 }, { kind: "server" }, { kind: "storage" }],
  };

  it("a cdn absorbs the cacheable share so the origin sees the rest", () => {
    const bare = evalFlows(graph([["s", "server"], ["o", "storage"]], ["client>s", "s>o"]), [photo]);
    expect(bare.nodes.s.util).toBeGreaterThan(2);
    const withCdn = evalFlows(
      graph([["c", "cdn"], ["s", "server"], ["o", "storage"]], ["client>c", "c>s", "s>o"]),
      [photo],
      { nodeConfig: { cdn: { hitRate: 1 } } },
    );
    expect(withCdn.nodes.s.load).toBeCloseTo(2000, 0);
    expect(withCdn.flows[0].success).toBeCloseTo(1, 2);
  });

  it("a cache beside the server shields the database, and its hit rate comes from knobs", () => {
    const read: Flow = {
      id: "read",
      label: "Read",
      rps: 10_000,
      route: [{ kind: "server" }, { kind: "cache", optional: true, cacheable: 1 }, { kind: "db" }],
    };
    const g = graph([["s", "server", { size: "m" }], ["r", "cache"], ["d", "db"]], ["client>s", "s>r", "s>d"]);
    const knobs = resolveKnobs(
      [{ id: "ttl", label: "TTL", help: "", default: "long", options: [{ v: "long", label: "", desc: "", values: { hitRate: 0.95 } }] }],
      {},
    );
    const r = evalFlows(g, [read], { knobs });
    expect(r.nodes.d.load).toBeCloseTo(500, 0);
    expect(r.nodes.r.load).toBeCloseTo(10_000, 0);
  });

  it("a dead cache sends everything to the database", () => {
    const read: Flow = { id: "read", label: "Read", rps: 30_000, route: [{ kind: "server" }, { kind: "cache", optional: true, cacheable: 1 }, { kind: "db" }] };
    const g = graph([["s", "server", { size: "xl" }], ["r", "cache"], ["d", "db"]], ["client>s", "s>r", "s>d"]);
    const up = evalFlows(g, [read]);
    const dead = evalFlows(g, [read], { down: ["r"] });
    expect(up.flows[0].success).toBeCloseTo(1, 2);
    expect(dead.nodes.d.load).toBeCloseTo(30_000, 0);
    expect(dead.nodes.d.util).toBeGreaterThan(0.85);
  });
});

describe("flows: database shards", () => {
  const pay: Flow = { id: "pay", label: "Pay", rps: 12_000, write: true, route: [{ kind: "server" }, { kind: "db" }] };
  const mk = (shards: number) =>
    graph([["s1", "server", { size: "xl" }], ["s2", "server", { size: "xl" }], ["d", "db", { shards }]], ["client>s1", "client>s2", "s1>d", "s2>d"]);

  it("shards multiply capacity and cost when load is even", () => {
    expect(evalFlows(mk(1), [pay]).flows[0].success).toBeLessThan(0.7);
    const four = evalFlows(mk(4), [pay]);
    expect(four.flows[0].success).toBeCloseTo(1, 2);
    expect(four.cost).toBeGreaterThan(evalFlows(mk(1), [pay]).cost);
  });

  it("a skewed shard key saturates the hot shard first", () => {
    const hotKey = resolveKnobs(
      [{ id: "key", label: "Key", help: "", default: "hot", options: [{ v: "hot", label: "", desc: "", values: { skew: 0.9 } }] }],
      {},
    );
    const r = evalFlows(mk(8), [pay], { knobs: hotKey });
    expect(r.nodes.d.hotUtil).toBeGreaterThan(1);
    expect(r.flows[0].success).toBeLessThan(0.8);
    expect(r.issues.join(" ")).toMatch(/hot key/);
  });
});

describe("flows: websockets", () => {
  const chat: Flow = {
    id: "chat",
    label: "Room chat",
    rps: 2_000,
    fanout: 20,
    connections: 80_000,
    route: [{ kind: "ws" }, { kind: "pubsub", optional: true }],
  };

  it("connections beyond one gateway's limit need more gateways", () => {
    const one = evalFlows(graph([["w", "ws"]], ["client>w"]), [chat]);
    expect(one.nodes.w.util).toBeGreaterThan(1);
    expect(one.flows[0].success).toBeLessThan(0.7);
  });

  it("two gateways without pubsub only deliver to their own users; pubsub fixes it", () => {
    const bare = evalFlows(graph([["w1", "ws"], ["w2", "ws"]], ["client>w1", "client>w2"]), [chat]);
    expect(bare.flows[0].success).toBeCloseTo(1, 2);
    expect(bare.flows[0].delivered).toBeCloseTo(0.5, 2);
    expect(bare.delivered).toBeCloseTo(0.5, 2);
    expect(bare.issues.join(" ")).toMatch(/pub\/sub/);

    const wired = evalFlows(
      graph([["w1", "ws"], ["w2", "ws"], ["p", "pubsub"]], ["client>w1", "client>w2", "w1>p", "w2>p", "p>w1", "p>w2"]),
      [chat],
    );
    expect(wired.flows[0].delivered).toBeCloseTo(1, 2);
  });
});

describe("flows: queues and workers", () => {
  const sms: Flow = {
    id: "sms",
    label: "SMS",
    rps: 400,
    workMs: 20,
    slaSeconds: 10,
    route: [{ kind: "server" }, { kind: "queue" }, { kind: "worker" }, { kind: "external" }],
  };
  const g = (workers: number) =>
    graph(
      [["s", "server"], ["q", "queue"], ["x", "external"], ...Array.from({ length: workers }, (_, i): N => [`w${i}`, "worker"])],
      ["client>s", "s>q", ...Array.from({ length: workers }, (_, i) => `q>w${i}`), ...Array.from({ length: workers }, (_, i) => `w${i}>x`)],
    );

  it("sync success is reaching the queue; async success is finishing on time", () => {
    const r = evalFlows(g(1), [sms]);
    expect(r.flows[0].success).toBeCloseTo(1, 2);
    expect(r.flows[0].asyncOnTime).toBeCloseTo(1, 2);
    expect(r.queueLagSeconds).toBe(0);
  });

  it("too few workers: the queue grows and jobs miss their deadline", () => {
    const r = evalFlows(g(1), [{ ...sms, rps: 800 }]);
    expect(r.flows[0].success).toBeCloseTo(1, 2); // the app stays fast...
    expect(r.queueLagSeconds).toBeGreaterThan(10); // ...but work piles up
    expect(r.flows[0].asyncOnTime).toBeLessThan(0.8);
    expect(r.issues.join(" ")).toMatch(/Workers are at/);
  });

  it("a worker tier with no external wired fails jobs with a message", () => {
    const bad = graph([["s", "server"], ["q", "queue"], ["w", "worker"]], ["client>s", "s>q", "q>w"]);
    const r = evalFlows(bad, [sms]);
    expect(r.flows[0].asyncOnTime).toBe(0);
    expect(r.issues.join(" ")).toMatch(/Third-party API/);
  });
});
