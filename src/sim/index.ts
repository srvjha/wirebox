import { DEFAULT_RESILIENCE, evaluate, type EvalResult, type Load, type Resilience, type SimEdge, type SimNode } from "./evaluate";
import { grade, type Check, type Constraint, type Metrics } from "./grade";
import { monthlyCost, type Kind } from "./spec";
import { runFlowTimeline, type FlowTimeline } from "./flow-timeline";
import { evaluateFlows, type Flow, type FlowIncident, type FlowKnobs, type FlowResult, type NodeConfig } from "./flows";
import { runTimeline, type Incident, type Timeline } from "./timeline";
import { cacheProfile, type CacheConfig, type CacheValueOption, type LimiterConfig } from "./traffic";

export * from "./evaluate";
export * from "./flows";
export * from "./flow-timeline";
export * from "./grade";
export * from "./spec";
export * from "./timeline";
export * from "./traffic";

export type Scenario = {
  load: Load;
  incident?: Incident;
};

export type TestInput = {
  nodes: SimNode[];
  edges: SimEdge[];
  scenario: Scenario;
  constraints: Constraint[];
  cache: CacheConfig;
  cacheParam: string;
  cacheValues: CacheValueOption[];
  limiter: LimiterConfig | null;
  resilience?: Resilience;
  dbLabel?: string;
};

export type TestResult = {
  pass: boolean;
  steady: EvalResult;
  timeline: Timeline | null;
  metrics: Metrics;
  checks: Check[];
};

export function countKinds(nodes: SimNode[]) {
  const counts: Partial<Record<Kind, number>> = {};
  for (const n of nodes) counts[n.kind] = (counts[n.kind] ?? 0) + 1;
  return counts;
}

export function runTest(input: TestInput): TestResult {
  const resilience = input.resilience ?? DEFAULT_RESILIENCE;
  const profile = cacheProfile(input.cache, input.cacheParam, input.cacheValues);
  const base = {
    nodes: input.nodes,
    edges: input.edges,
    load: input.scenario.load,
    cache: {
      ...profile,
      warmth: 1,
      coalesce: input.cache.onMiss === "coalesce",
      writeThrough: input.cache.writeThrough,
    },
    limiter: input.nodes.some((n) => n.kind === "limiter") ? input.limiter : null,
    resilience,
    dbLabel: input.dbLabel,
  };
  const steady = evaluate(base);
  const timeline = input.scenario.incident ? runTimeline({ ...base, incident: input.scenario.incident }) : null;

  const legit = Math.max(1, steady.legit);
  const metrics: Metrics = {
    successRate: timeline ? timeline.overall : steady.served / legit,
    p99: steady.p99,
    cost: monthlyCost(input.nodes),
    counts: countKinds(input.nodes),
    staleRate: steady.stale / legit,
    wrongRate: steady.wrong / legit,
    blockedRate: steady.limitedLegit / legit,
    worstSecond: timeline?.worst,
    recovery: timeline ? timeline.recovery : undefined,
  };
  const checks = grade(metrics, input.constraints);
  return { pass: steady.legit > 0 && checks.every((c) => c.ok), steady, timeline, metrics, checks };
}

export type FlowTestInput = {
  nodes: SimNode[];
  edges: SimEdge[];
  flows: Flow[];
  constraints: Constraint[];
  incident?: FlowIncident;
  nodeConfig?: NodeConfig;
  knobs?: FlowKnobs;
  healthChecks?: boolean;
  dbLabel?: string;
};

/** A TestResult whose steady state and timeline carry the flow engine's extra detail. */
export type FlowTestResult = Omit<TestResult, "steady" | "timeline"> & {
  steady: FlowResult;
  timeline: FlowTimeline | null;
};

/** Flow-step counterpart of `runTest`. Custom checks are added by the caller (see lib/lab/run.ts). */
export function runFlowTest(input: FlowTestInput): FlowTestResult {
  const base = {
    nodes: input.nodes,
    edges: input.edges,
    flows: input.flows,
    nodeConfig: input.nodeConfig,
    knobs: input.knobs,
    healthChecks: input.healthChecks,
    dbLabel: input.dbLabel,
  };
  const steady = evaluateFlows(base);
  const timeline = input.incident ? runFlowTimeline({ ...base, incident: input.incident }) : null;

  const legit = Math.max(1, steady.legit);
  const flowServed: Record<string, number> = {};
  let delivered = steady.delivered;
  let asyncOnTime = steady.asyncOnTime;
  if (timeline) {
    delivered = 1;
    asyncOnTime = 1;
    for (const f of input.flows) {
      const t = timeline.flowTotals[f.id];
      if (!t || t.offered <= 0) continue;
      flowServed[f.id] = t.served / t.offered;
      if (f.fanout) delivered = Math.min(delivered, t.delivered / t.offered);
      if (t.asyncOffered > 0) asyncOnTime = Math.min(asyncOnTime, t.asyncOnTime / t.asyncOffered);
    }
  } else {
    for (const f of steady.flows) if (f.legit) flowServed[f.id] = f.success;
  }
  const metrics: Metrics = {
    successRate: timeline ? timeline.overall : steady.served / legit,
    p99: steady.p99,
    cost: monthlyCost(input.nodes),
    counts: countKinds(input.nodes),
    staleRate: 0,
    wrongRate: 0,
    blockedRate: 0,
    worstSecond: timeline?.worst,
    recovery: timeline ? timeline.recovery : undefined,
    queueLag: timeline ? timeline.worstQueueLag : steady.queueLagSeconds,
    delivered,
    asyncOnTime,
    flowServed,
  };
  const checks = grade(metrics, input.constraints);
  return { pass: steady.legit > 0 && checks.every((c) => c.ok), steady, timeline, metrics, checks };
}
