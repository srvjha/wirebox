// Relative imports keep this file runnable under vitest (no path aliases there).
import {
  DEFAULT_CACHE,
  DEFAULT_RESILIENCE,
  TRAFFIC,
  resolveKnobs,
  runFlowTest,
  runTest,
  type Check,
  type FlowKnobs,
  type Load,
  type SimEdge,
  type SimNode,
  type TestResult,
} from "../../sim";
import type { DesignStep, Endpoint, Drill, DrillConfigs, DrillGraph, SchemaDesign } from "./types";

const DEFAULT_CUSTOM: Record<string, string> = {};

export const DEFAULT_CONFIGS: DrillConfigs = {
  cache: DEFAULT_CACHE,
  limiter: { by: "ip", rate: 10 },
  resilience: DEFAULT_RESILIENCE,
  custom: DEFAULT_CUSTOM,
};

export function toSim(graph: DrillGraph): { nodes: SimNode[]; edges: SimEdge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      size: n.kind === "server" ? (n.size ?? "s") : undefined,
      role: n.kind === "db" ? (n.role ?? "primary") : undefined,
      shards: n.kind === "db" ? n.shards : undefined,
      hitRate: n.kind === "cdn" || n.kind === "cache" ? n.hitRate : undefined,
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

export function dbLabelOf(drill: Drill, schema: SchemaDesign) {
  for (const s of drill.steps) {
    if (s.type !== "schema") continue;
    const engine = s.engines.find((e) => e.id === schema.engine);
    if (engine) return engine.label;
  }
  return "Postgres";
}

export type DesignInput = {
  graph: DrillGraph;
  configs: DrillConfigs;
  api: Record<string, Endpoint>;
  schema: SchemaDesign;
};

export type DesignRun = {
  result: TestResult;
  load: Load;
  dbLabel: string;
};

/** The learner's selected option per custom knob, defaults filled in, plus the engine's numeric values. */
export function stepKnobs(step: DesignStep, configs: DrillConfigs): FlowKnobs {
  return resolveKnobs(step.customKnobs, configs.custom);
}

function runFlowDesign(drill: Drill, step: DesignStep, d: DesignInput, loadScale: number): DesignRun {
  const dbLabel = dbLabelOf(drill, d.schema);
  const knobs = stepKnobs(step, d.configs);
  const flows = (step.flows ?? []).map((f) =>
    loadScale === 1 ? f : { ...f, rps: f.rps * loadScale, connections: f.connections ? f.connections * loadScale : undefined },
  );
  const result = runFlowTest({
    ...toSim(d.graph),
    flows,
    constraints: step.constraints,
    incident: loadScale === 1 ? step.incident : undefined,
    nodeConfig: step.nodeDefaults,
    knobs,
    healthChecks: d.configs.resilience.healthChecks,
    dbLabel,
  });
  if (step.customChecks && loadScale === 1) {
    const extra: Check[] = step.customChecks({ graph: d.graph, configs: d.configs, knobs: knobs.choices, result }).map((c, i) => ({
      constraint: { type: "custom", id: `custom-${i}`, label: c.label },
      label: c.label,
      ok: c.ok,
      message: c.ok ? null : (c.message ?? null),
    }));
    result.checks.push(...extra);
    result.pass = result.pass && extra.every((c) => c.ok);
  }
  return { result, load: step.scenario.load, dbLabel };
}

export function runDesign(drill: Drill, step: DesignStep, d: DesignInput, loadScale = 1): DesignRun {
  if (step.flows) return runFlowDesign(drill, step, d, loadScale);
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
  const dbLabel = dbLabelOf(drill, d.schema);
  const result = runTest({
    ...toSim(d.graph),
    scenario: { load, incident: loadScale === 1 ? step.scenario.incident : undefined },
    constraints: step.constraints,
    cache: d.configs.cache,
    cacheParam: drill.cacheParam,
    cacheValues: drill.cacheValues,
    limiter: d.configs.limiter,
    resilience: d.configs.resilience,
    dbLabel,
  });
  return { result, load, dbLabel };
}
