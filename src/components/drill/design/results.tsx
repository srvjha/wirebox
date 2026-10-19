"use client";

import { ArrowRight, CircleCheck, CircleX, Sparkles } from "lucide-react";
import { HOT_UTIL, type FlowResult, type FlowTimeline, type TestResult } from "@/sim";
import type { DrillGraph } from "@/lib/drill/types";
import { cn } from "@/lib/utils";
import { compact, nodeTitle } from "../canvas/meta";
import { Postmortem, type PostmortemInput } from "./postmortem";
import { QueueLagChart, TimelineChart } from "./timeline-chart";

type Props = {
  result: TestResult;
  graph: DrillGraph;
  dbLabel: string;
  incident?: string;
  stale: boolean;
  debrief: string[] | null;
  postmortem: PostmortemInput;
  returnTo: string;
  onNext?: () => void;
};

export function Results({ result, graph, dbLabel, incident, stale, debrief, postmortem, returnTo, onNext }: Props) {
  const m = result.metrics;
  const failed = result.checks.filter((c) => !c.ok).length;
  const nodes = graph.nodes.filter((n) => n.kind !== "client" && result.steady.nodes[n.id]);
  const flow = "flows" in result.steady ? (result.steady as FlowResult) : null;
  const flowTimeline = result.timeline && "flowTotals" in result.timeline ? (result.timeline as FlowTimeline) : null;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-3.5",
          result.pass ? "border-ok/30 bg-ok/10" : "border-err/30 bg-err/10",
        )}
      >
        {result.pass ? <CircleCheck className="mt-0.5 size-5 text-ok" /> : <CircleX className="mt-0.5 size-5 text-err" />}
        <div>
          <p className="text-[14.5px] font-semibold text-fg">{result.pass ? "Load test passed" : "Not there yet"}</p>
          <p className="text-[12.5px] text-muted">
            {result.pass
              ? "Every constraint held. Read why it works, then move on."
              : `${failed} of ${result.checks.length} constraint${result.checks.length === 1 ? "" : "s"} failed. The notes below say where it hurts.`}
          </p>
        </div>
      </div>
      {stale && (
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] text-warn">
          You changed the design since this run. Run the test again to see the new numbers.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Success" value={`${(m.successRate * 100).toFixed(m.successRate > 0.99 ? 2 : 1)}%`} />
        <Metric label="p99" value={m.p99 >= 2000 ? "timeout" : `${m.p99} ms`} />
        <Metric label="Cost" value={`$${m.cost.toLocaleString("en-US")}`} sub="/month" />
      </div>

      <ul className="space-y-1.5">
        {result.checks.map((c, i) => (
          <li key={i} className="flex gap-2 text-[13px]">
            {c.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-err" />}
            <span>
              <span className={c.ok ? "text-fg" : "font-medium text-fg"}>{c.label}</span>
              {c.message && <span className="block text-[12.5px] text-muted">{c.message}</span>}
            </span>
          </li>
        ))}
      </ul>

      {flow && <FlowRows flow={flow} timeline={flowTimeline} />}

      {result.timeline && <TimelineChart timeline={result.timeline} incident={incident ?? ""} />}
      {flowTimeline && flowTimeline.worstQueueLag >= 0.5 && <QueueLagChart timeline={flowTimeline} />}

      {nodes.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10.5px] tracking-wider text-subtle uppercase">Utilisation at peak</p>
          <ul className="space-y-1.5">
            {nodes.map((n) => {
              const s = result.steady.nodes[n.id];
              const tone = s.util >= 1 ? "bg-err" : s.util >= HOT_UTIL ? "bg-warn" : "bg-ok";
              return (
                <li key={n.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-[12px]">
                  <span className="truncate text-muted">{nodeTitle(n, dbLabel)}</span>
                  <span className="font-mono text-fg">
                    {Math.round(s.util * 100)}%{" "}
                    <span className="text-subtle">
                      · {s.conns ? `${compact(s.conns)} conns` : `${compact(s.load)}/s`}
                      {s.hotUtil !== undefined && (s.shards ?? 1) > 1 ? " · hottest shard" : ""}
                    </span>
                  </span>
                  <span className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-3">
                    <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.min(100, s.util * 100)}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {result.steady.issues.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10.5px] tracking-wider text-subtle uppercase">What the simulator noticed</p>
          <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted">
            {result.steady.issues.map((issue) => (
              <li key={issue} className="flex gap-2">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warn" />
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!result.pass && <Postmortem input={postmortem} returnTo={returnTo} />}

      {result.pass && debrief && (
        <div className="rounded-xl border border-accent/30 bg-accent-soft p-3.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-accent">
            <Sparkles className="size-3.5" /> Why it works
          </p>
          <div className="space-y-2 text-[13px] leading-relaxed text-muted [&_strong]:text-fg">
            {debrief.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-accent-fg hover:bg-accent-strong"
            >
              Next step <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FlowRows({ flow, timeline }: { flow: FlowResult; timeline: FlowTimeline | null }) {
  const pctOf = (x: number) => `${(x * 100).toFixed(x > 0.99 && x < 1 ? 2 : 1).replace(/\.0$/, "")}%`;
  return (
    <div>
      <p className="mb-2 font-mono text-[10.5px] tracking-wider text-subtle uppercase">Traffic by flow</p>
      <ul className="space-y-2">
        {flow.flows.map((f) => {
          const t = timeline?.flowTotals[f.id];
          const served = t && t.offered > 0 ? t.served / t.offered : f.success;
          const delivered = t && t.offered > 0 ? t.delivered / t.offered : f.delivered;
          const onTime = t && t.asyncOffered > 0 ? t.asyncOnTime / t.asyncOffered : f.asyncOnTime;
          const tone = !f.legit ? "text-subtle" : served >= 0.99 ? "text-ok" : served >= 0.9 ? "text-warn" : "text-err";
          return (
            <li key={f.id} className="rounded-lg border border-line bg-surface-2 px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[12.5px] font-medium text-fg">
                  {f.label}
                  {!f.legit && <span className="ml-1.5 font-mono text-[10px] text-err uppercase">abusive</span>}
                </span>
                <span className={cn("shrink-0 font-mono text-[12.5px] font-semibold", tone)}>
                  {f.legit ? `${pctOf(served)} served` : `${compact(f.offered)}/s`}
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[10.5px] text-subtle">
                <span>{compact(f.offered)}/s</span>
                {f.legit && <span>p99 {f.p99 >= 2000 ? "timeout" : `${f.p99} ms`}</span>}
                {f.fanout && <span className={delivered < 0.99 ? "text-err" : undefined}>{pctOf(delivered)} delivered</span>}
                {onTime !== null && <span className={onTime < 0.95 ? "text-warn" : undefined}>{pctOf(onTime)} of jobs on time</span>}
              </p>
            </li>
          );
        })}
      </ul>
      {flow.queueLagSeconds >= 0.5 || (timeline && timeline.worstQueueLag >= 0.5) ? (
        <p className="mt-2 text-[12px] text-muted">
          Queue wait peaked at <span className="font-mono text-fg">{Math.round(timeline?.worstQueueLag ?? flow.queueLagSeconds)} s</span>.
        </p>
      ) : null}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-2">
      <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">{label}</p>
      <p className="font-mono text-[14px] font-semibold text-fg">
        {value}
        {sub && <span className="text-[10.5px] font-normal text-subtle">{sub}</span>}
      </p>
    </div>
  );
}
