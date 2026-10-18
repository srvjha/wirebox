import { evaluateFlows, retryShare, type Flow, type FlowEvalInput, type FlowIncident, type FlowResult } from "./flows";
import { TIMEOUT_MS } from "./spec";
import { TIMELINE, type Frame, type Timeline } from "./timeline";

export type FlowFrame = Frame & { result: FlowResult; queueLag: number };

/** Per-flow totals over the run, counting only the original (not retried) traffic. */
export type FlowTotals = { offered: number; served: number; delivered: number; asyncOffered: number; asyncOnTime: number };

export type FlowTimeline = Omit<Timeline, "frames"> & {
  frames: FlowFrame[];
  /** Longest any queue got, in seconds of work. */
  worstQueueLag: number;
  flowTotals: Record<string, FlowTotals>;
};

export type FlowTimelineInput = Omit<FlowEvalInput, "down" | "undetected" | "backlog" | "slow"> & {
  incident?: FlowIncident;
};

/** The node an incident of this kind hits: the first one the learner actually wired. */
export function pickFlowVictim(input: Pick<FlowEvalInput, "nodes" | "edges">, kind: string): string | null {
  const of = input.nodes.filter((n) => n.kind === kind);
  const wired = of.find((n) => input.edges.some((e) => e.to === n.id || e.from === n.id));
  return (wired ?? of[0])?.id ?? null;
}

export function runFlowTimeline(input: FlowTimelineInput): FlowTimeline {
  const { incident, flows } = input;
  const retry = retryShare(input.knobs);
  const victim = incident?.type === "down" ? pickFlowVictim(input, incident.kind) : null;

  const frames: FlowFrame[] = [];
  const totals: Record<string, FlowTotals> = Object.fromEntries(
    flows.map((f) => [f.id, { offered: 0, served: 0, delivered: 0, asyncOffered: 0, asyncOnTime: 0 }]),
  );
  let backlog: Record<string, number> = {};
  const retryLoad: Record<string, number> = {};
  let servedTotal = 0;
  let legitTotal = 0;
  let worstQueueLag = 0;

  for (let t = 0; t < TIMELINE.seconds; t++) {
    const after = t - TIMELINE.at;
    const active = after >= 0;
    const spiking = (f: Flow) =>
      incident?.type === "spike" &&
      active &&
      (incident.seconds === undefined || after < incident.seconds) &&
      (!incident.flows || incident.flows.includes(f.id));

    const original = flows.map((f) => f.rps * (spiking(f) ? (incident as { multiplier: number }).multiplier : 1));
    const scaled: Flow[] = flows.map((f, i) => ({ ...f, rps: original[i] + (f.legit === false ? 0 : (retryLoad[f.id] ?? 0)) }));

    const down = active && victim ? [victim] : [];
    const undetected = input.healthChecks && after < TIMELINE.detectSeconds ? down : [];
    const slow = incident?.type === "slow" && active ? { ms: incident.ms, failRate: incident.failRate } : null;

    const result = evaluateFlows({ ...input, flows: scaled, down, undetected, slow, backlog });
    backlog = result.backlog;
    worstQueueLag = Math.max(worstQueueLag, result.queueLagSeconds);

    const success = result.legit > 0 ? result.served / result.legit : 1;
    frames.push({ t, success, p99: result.p99, down, warmth: 1, result, queueLag: result.queueLagSeconds });

    flows.forEach((f, i) => {
      const st = result.flows[i];
      const legit = f.legit !== false;
      retryLoad[f.id] = legit ? Math.max(0, st.offered - st.served) * retry : 0;
      if (!legit) return;
      const served = Math.min(original[i], st.served);
      const tot = totals[f.id];
      tot.offered += original[i];
      tot.served += served;
      tot.delivered += st.success > 0 ? served * (st.delivered / st.success) : 0;
      if (st.asyncOnTime !== null) {
        tot.asyncOffered += original[i];
        tot.asyncOnTime += original[i] * st.asyncOnTime;
      }
      servedTotal += served;
      legitTotal += original[i];
    });
  }

  const during = frames.filter((f) => f.t >= TIMELINE.at);
  const worst = Math.min(...during.map((f) => f.success));
  const bad = (f: FlowFrame) => f.success < TIMELINE.healthy || f.p99 >= TIMEOUT_MS || f.result.asyncOnTime < TIMELINE.healthy;
  let recovery: number | null = 0;
  const lastBad = [...frames].reverse().find(bad);
  if (lastBad) recovery = lastBad.t === TIMELINE.seconds - 1 ? null : Math.max(0, lastBad.t - TIMELINE.at + 1);

  return {
    frames,
    worst,
    recovery,
    overall: legitTotal ? servedTotal / legitTotal : 1,
    victim,
    worstQueueLag,
    flowTotals: totals,
  };
}
