import { DEFAULT_RESILIENCE, evaluate, type EvalResult, type Load, type Resilience, type SimEdge, type SimNode } from "./evaluate";
import { grade, type Check, type Constraint, type Metrics } from "./grade";
import { monthlyCost, type Kind } from "./spec";
import { runTimeline, type Incident, type Timeline } from "./timeline";
import { cacheProfile, type CacheConfig, type CacheValueOption, type LimiterConfig } from "./traffic";

export * from "./evaluate";
export * from "./flows";
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
