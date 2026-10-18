import { SPECS, describe, serverSize, type FlowResult, type TestResult } from "../../sim";
import type { DesignStep, Endpoint, LabConfigs, LabGraph } from "./types";
import { stepKnobs } from "./run";

/** Plain-text description of a learner's design, for the AI postmortem and its cache key. */
export function describeDesign(input: {
  graph: LabGraph;
  configs: LabConfigs;
  api: Record<string, Endpoint>;
  dbLabel: string;
  /** Flow steps: the step, so custom knob choices can be listed. */
  step?: DesignStep;
}): string {
  const { graph, configs, api, dbLabel, step } = input;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const name = (id: string) => {
    const n = byId.get(id);
    if (!n) return id;
    if (n.kind === "server") {
      const s = serverSize(n.size);
      const idx = graph.nodes.filter((x) => x.kind === "server").indexOf(n) + 1;
      return `server${idx} (${s.vcpu} vCPU, ${s.cap} req/s)`;
    }
    if (n.kind === "db") {
      const idx = graph.nodes.filter((x) => x.kind === "db").indexOf(n) + 1;
      return `${dbLabel}${idx} (${n.role ?? "primary"}${n.shards && n.shards > 1 ? `, ${n.shards} shards` : ""})`;
    }
    return SPECS[n.kind].label;
  };
  const lines: string[] = [];
  lines.push("Components:");
  for (const n of graph.nodes) lines.push(`- ${name(n.id)}`);
  lines.push("Wires (request direction):");
  if (!graph.edges.length) lines.push("- none");
  for (const e of [...graph.edges].sort((a, b) => a.id.localeCompare(b.id))) lines.push(`- ${name(e.from)} -> ${name(e.to)}`);
  const kinds = new Set(graph.nodes.map((n) => n.kind));
  if (kinds.has("cache")) {
    lines.push(
      `Cache: key "${configs.cache.key || "(empty)"}", value ${configs.cache.value ?? "(not set)"}, on miss ${configs.cache.onMiss}, write-through ${configs.cache.writeThrough ? "on" : "off"}`,
    );
  }
  if (kinds.has("limiter")) lines.push(`Rate limiter: per ${configs.limiter.by}, ${configs.limiter.rate} req/s`);
  lines.push(
    `Resilience: LB health checks ${configs.resilience.healthChecks ? "on" : "off"}, DB failover ${configs.resilience.failover ? "on" : "off"}, reads from ${configs.resilience.readFrom}`,
  );
  if (step?.customKnobs?.length) {
    const choices = stepKnobs(step, configs).choices;
    lines.push("Design choices:");
    for (const k of step.customKnobs) {
      const o = k.options.find((x) => x.v === choices[k.id]);
      lines.push(`- ${k.label}: ${o?.label ?? choices[k.id]}`);
    }
  }
  const eps = Object.entries(api);
  if (eps.length) {
    lines.push("API:");
    for (const [, e] of eps) {
      lines.push(
        `- ${e.method} ${e.path} body {${e.body.map((f) => f.name).join(", ")}} -> ${e.status}${e.location ? " + Location" : ""} {${e.response.map((f) => f.name).join(", ")}}`,
      );
    }
  }
  return lines.join("\n");
}

export function describeScenario(step: DesignStep): string {
  if (step.flows) {
    const parts = [
      `${step.scenario.label}: ${step.flows
        .map((f) => `${f.label} ${f.rps}/s${f.legit === false ? " (abusive)" : ""}${f.fanout ? ` x${f.fanout} fan-out` : ""}`)
        .join(", ")}`,
    ];
    if (step.incidentText) parts.push(step.incidentText);
    return `${parts.join("; ")}.\nConstraints: ${[...step.constraints.map(describe), ...(step.customCheckLabels ?? [])].join("; ")}.`;
  }
  const l = step.scenario.load;
  const parts = [`${step.scenario.label}: ${l.reads} reads/s, ${l.writes} writes/s`];
  if (l.attack) parts.push(`${l.attack} req/s from a scraper on 20 IPs`);
  if (step.scenario.incidentText) parts.push(step.scenario.incidentText);
  return `${parts.join("; ")}.\nConstraints: ${step.constraints.map(describe).join("; ")}.`;
}

export function describeResult(r: TestResult): string {
  const lines = [
    `Success rate ${(r.metrics.successRate * 100).toFixed(2)}%, p99 ${r.metrics.p99} ms, cost $${r.metrics.cost}/month.`,
    "Checks:",
    ...r.checks.map((c) => `- ${c.ok ? "PASS" : "FAIL"} ${c.label}${c.message ? `: ${c.message}` : ""}`),
    "Node utilisation:",
    ...Object.entries(r.steady.nodes).map(([id, s]) => `- ${id}: ${Number.isFinite(s.util) ? Math.round(s.util * 100) : 0}%${s.down ? " (down)" : ""}`),
  ];
  if (r.steady.issues.length) lines.push("Simulator notes:", ...r.steady.issues.map((i) => `- ${i}`));
  if ("flows" in r.steady) {
    const fr = r.steady as FlowResult;
    lines.push(
      "Flows:",
      ...fr.flows.map(
        (f) =>
          `- ${f.label}: ${(f.success * 100).toFixed(1)}% served, p99 ${f.p99} ms${f.fanout ? `, ${(f.delivered * 100).toFixed(0)}% delivered` : ""}${f.asyncOnTime !== null ? `, ${(f.asyncOnTime * 100).toFixed(0)}% of jobs on time` : ""}`,
      ),
    );
    if (fr.queueLagSeconds > 0.5) lines.push(`Queue lag ${Math.round(fr.queueLagSeconds)} s.`);
  }
  if (r.timeline) lines.push(`Incident: worst second ${(r.timeline.worst * 100).toFixed(1)}%, recovery ${r.timeline.recovery ?? "never"} s.`);
  return lines.join("\n");
}
