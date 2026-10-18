// Relative imports keep this file runnable under vitest (no path aliases there).
import { DEFAULT_CACHE, DEFAULT_RESILIENCE, TRAFFIC, runTest, type Load, type SimEdge, type SimNode, type TestResult } from "../../sim";
import type { DesignStep, Endpoint, Lab, LabConfigs, LabGraph, SchemaDesign } from "./types";

export const DEFAULT_CONFIGS: LabConfigs = {
  cache: DEFAULT_CACHE,
  limiter: { by: "ip", rate: 10 },
  resilience: DEFAULT_RESILIENCE,
};

export function toSim(graph: LabGraph): { nodes: SimNode[]; edges: SimEdge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      size: n.kind === "server" ? (n.size ?? "s") : undefined,
      role: n.kind === "db" ? (n.role ?? "primary") : undefined,
    })),
    edges: graph.edges.map((e) => ({ from: e.from, to: e.to })),
  };
}

/** A GET answered with 301/308 is cached by browsers forever. */
export function permanentRedirect(api: Record<string, Endpoint>) {
  return Object.values(api).find((e) => e.method === "GET" && (e.status === 301 || e.status === 308)) ?? null;
}

/** The step's load, with repeat clicks answered by browsers when redirects are permanent. */
export function effectiveLoad(load: Load, api: Record<string, Endpoint>): Load {
  if (!permanentRedirect(api)) return load;
  const clientCached = Math.round(load.reads * TRAFFIC.browserRepeat);
  return { ...load, reads: load.reads - clientCached, clientCached };
}

export function dbLabelOf(lab: Lab, schema: SchemaDesign) {
  for (const s of lab.steps) {
    if (s.type !== "schema") continue;
    const engine = s.engines.find((e) => e.id === schema.engine);
    if (engine) return engine.label;
  }
  return "Postgres";
}

export type DesignInput = {
  graph: LabGraph;
  configs: LabConfigs;
  api: Record<string, Endpoint>;
  schema: SchemaDesign;
};

export type DesignRun = {
  result: TestResult;
  load: Load;
  dbLabel: string;
};

export function runDesign(lab: Lab, step: DesignStep, d: DesignInput, loadScale = 1): DesignRun {
  const base = effectiveLoad(step.scenario.load, d.api);
  const load: Load =
    loadScale === 1
      ? base
      : {
          reads: base.reads * loadScale,
          writes: base.writes * loadScale,
          attack: base.attack * loadScale,
          clientCached: (base.clientCached ?? 0) * loadScale,
        };
  const dbLabel = dbLabelOf(lab, d.schema);
  const result = runTest({
    ...toSim(d.graph),
    scenario: { load, incident: loadScale === 1 ? step.scenario.incident : undefined },
    constraints: step.constraints,
    cache: d.configs.cache,
    cacheParam: lab.cacheParam,
    cacheValues: lab.cacheValues,
    limiter: d.configs.limiter,
    resilience: d.configs.resilience,
    dbLabel,
  });
  return { result, load, dbLabel };
}
