"use client";

import { BookOpen, ChevronDown, Lightbulb, LoaderCircle, Play, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { describe, type EvalResult } from "@/sim";
import { track } from "@/lib/analytics";
import { useSession } from "@/lib/auth-client";
import { dbLabelOf, effectiveLoad, permanentRedirect, runDesign, stepKnobs } from "@/lib/drill/run";
import { describeDesign, describeResult, describeScenario } from "@/lib/drill/serialize";
import type { DrillStore } from "@/lib/drill/store";
import type { DesignStep, Drill, DrillGraph } from "@/lib/drill/types";
import { cn } from "@/lib/utils";
import { DesignCanvas } from "../canvas/design-canvas";
import { Inspector, KnobSelect } from "../canvas/inspector";
import { compact } from "../canvas/meta";
import { Results } from "./results";

const USERS_ONLY: DrillGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };

type Props = { drill: Drill; step: DesignStep; index: number; store: DrillStore; onNext: () => void };

export function DesignStepView({ drill, step, index, store, onNext }: Props) {
  const graph = useStore(store, (s) => s.graph);
  const configs = useStore(store, (s) => s.configs);
  const api = useStore(store, (s) => s.api);
  const schema = useStore(store, (s) => s.schema);
  const live = useStore(store, (s) => s.live[step.id]);
  const passed = useStore(store, (s) => s.passed.includes(step.id));
  const hintsOpen = useStore(store, (s) => s.hints[step.id] ?? 0);
  const { data: session } = useSession();

  const [selected, setSelected] = useState<string | null>(null);
  const [frame, setFrame] = useState<EvalResult | null>(null);
  const [tick, setTick] = useState<{ t: number; label: string } | null>(null);
  const [tab, setTab] = useState<"brief" | "results">(live ? "results" : "brief");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [ranWith, setRanWith] = useState<{ graph: DrillGraph; configs: typeof configs } | null>(null);
  const running = tick !== null;
  const dbLabel = dbLabelOf(drill, schema);

  // Seed an empty canvas; otherwise the design carries over from the last step.
  useEffect(() => {
    if (store.getState().graph.nodes.length === 0) store.getState().setGraph(structuredClone(step.startGraph ?? USERS_ONLY));
  }, [step, store]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const stale = !!live && !!ranWith && (ranWith.graph !== graph || ranWith.configs !== configs);
  // The canvas overlay only shows numbers that match what's on screen.
  const overlay = running ? frame : live && !stale && ranWith ? frame : null;

  const run = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const s = store.getState();
    const input = { graph: s.graph, configs: s.configs, api: s.api, schema: s.schema };
    const full = runDesign(drill, step, input);
    const { result } = full;
    setSelected(null);

    const finish = () => {
      setTick(null);
      const last = result.timeline ? result.timeline.frames[result.timeline.frames.length - 1].result : result.steady;
      setFrame(last);
      setRanWith({ graph: input.graph, configs: input.configs });
      const summary = {
        pass: result.pass,
        successRate: result.metrics.successRate,
        p99: result.metrics.p99,
        cost: result.metrics.cost,
        nodes: input.graph.nodes.length,
        at: Date.now(),
      };
      store.getState().recordRun(
        step.id,
        { result, dbLabel: full.dbLabel, clientCached: full.load.clientCached ?? 0, at: summary.at },
        summary,
      );
      setTab("results");
      track("load_test_run", {
        drill: drill.slug,
        step: index,
        pass: result.pass,
        success_rate: Math.round(result.metrics.successRate * 10000) / 10000,
        p99_ms: result.metrics.p99,
        cost_usd: result.metrics.cost,
        nodes: input.graph.nodes.length,
      });
      if (session) {
        void fetch(`/api/drills/${drill.slug}/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            step: index,
            pass: result.pass,
            successRate: result.metrics.successRate,
            p99Ms: result.metrics.p99,
            costUsd: result.metrics.cost,
            nodes: input.graph.nodes.length,
          }),
        }).catch(() => {});
      }
      if (result.pass && !store.getState().passed.includes(step.id)) {
        store.getState().pass(step.id);
        track("drill_step_completed", { drill: drill.slug, step: index, type: step.type });
      }
    };

    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return finish();

    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    if (result.timeline) {
      const frames = result.timeline.frames;
      frames.forEach((f, i) =>
        at(i * 120, () => {
          setFrame(f.result);
          setTick({ t: f.t, label: f.t >= 5 && (step.incident ?? step.scenario.incident) ? ((step.incident ?? step.scenario.incident)?.label ?? "Incident") : "Warming up" });
        }),
      );
      at(frames.length * 120 + 150, finish);
    } else {
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        at(i * 110, () => {
          const k = i / steps;
          setFrame(i === steps ? result.steady : runDesign(drill, step, input, k).result.steady);
          setTick({ t: i, label: `Ramping to ${Math.round(k * 100)}% of peak load` });
        });
      }
      at(steps * 110 + 450, finish);
    }
    setTick({ t: 0, label: "Starting load test" });
  }, [index, drill, session, step, store]);

  const load = effectiveLoad(step.scenario.load, api);
  const globalKnobs = (step.customKnobs ?? []).filter((k) => !k.appliesTo);
  const knobChoices = stepKnobs(step, configs).choices;
  const incidentText = step.incidentText ?? step.scenario.incidentText;
  const permanent = permanentRedirect(api);
  const debrief = useMemo(() => {
    if (!live?.result.pass) return null;
    return step.debrief({ graph, configs, result: live.result, dbLabel: live.dbLabel, clientCached: live.clientCached });
  }, [live, step, graph, configs]);

  const returnTo = `/drills/${drill.slug}`;

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:flex-row">
      <div className="relative h-[64vh] min-h-[380px] shrink-0 border-b border-line lg:h-auto lg:min-h-0 lg:flex-1 lg:border-r lg:border-b-0">
        <DesignCanvas
          drill={drill.slug}
          store={store}
          palette={step.palette}
          replicas={!step.flows || step.knobs.includes("replica")}
          dbLabel={dbLabel}
          selected={selected}
          onSelect={setSelected}
          frame={overlay}
          locked={running}
        />
        <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[13.5px] font-semibold text-accent-fg shadow-card transition-colors hover:bg-accent-strong disabled:opacity-80"
          >
            {running ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}
            {running ? "Running…" : live ? "Run again" : "Run load test"}
          </button>
          {tick && (
            <div className="rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 text-right font-mono text-[11px] text-muted shadow-card backdrop-blur">
              {step.scenario.incident || step.incident ? <span className="text-fg">t = {tick.t}s · </span> : null}
              {tick.label}
              {frame && (
                <span className="block text-fg">
                  {Math.round((frame.served / Math.max(1, frame.legit)) * 1000) / 10}% served
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <aside className="w-full shrink-0 bg-bg lg:w-[400px] lg:overflow-y-auto xl:w-[430px]">
        {selected && !running && (
          <div className="border-b border-line p-3">
            <Inspector drill={drill} store={store} knobs={step.knobs} step={step} nodeId={selected} dbLabel={dbLabel} onClose={() => setSelected(null)} />
          </div>
        )}
        <div className="sticky top-0 z-10 flex gap-1 border-b border-line bg-bg/95 px-3 pt-2 backdrop-blur">
          {(["brief", "results"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              disabled={t === "results" && !live}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium capitalize transition-colors disabled:opacity-40",
                tab === t ? "border-accent text-fg" : "border-transparent text-subtle hover:text-fg",
              )}
            >
              {t === "brief" ? "Brief" : "Results"}
              {t === "results" && live && (
                <span className={cn("ml-1.5 inline-block size-1.5 rounded-full align-middle", live.result.pass ? "bg-ok" : "bg-err")} />
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "results" && live ? (
            <Results
              result={live.result}
              graph={graph}
              dbLabel={live.dbLabel}
              incident={step.incidentText ?? step.scenario.incidentText}
              stale={stale}
              debrief={debrief}
              returnTo={returnTo}
              onNext={passed ? onNext : undefined}
              postmortem={{
                drill: drill.slug,
                step: index,
                design: describeDesign({ graph, configs, api, dbLabel, step }),
                scenario: describeScenario(step),
                result: describeResult(live.result),
              }}
            />
          ) : (
            <div className="space-y-5">
              <section className="rounded-2xl border border-line bg-surface p-4">
                <p className="text-[13px] text-accent">Scenario · {step.scenario.label}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{step.story}</p>
                {step.flows ? (
                  <ul className="mt-3 space-y-1.5">
                    {step.flows.map((f) => (
                      <li key={f.id} className="flex items-baseline justify-between gap-3 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                        <span className="min-w-0 text-[12.5px] text-fg">
                          {f.label}
                          {f.legit === false && <span className="ml-1.5 font-mono text-[10px] text-err uppercase">abusive</span>}
                          {f.route.some((h) => h.kind === "queue") && <span className="ml-1.5 font-mono text-[10px] text-subtle uppercase">background</span>}
                          {f.fanout ? <span className="ml-1.5 font-mono text-[10px] text-subtle">×{f.fanout} fan-out</span> : null}
                        </span>
                        <span className="shrink-0 font-mono text-[13px] font-semibold text-req">{compact(f.rps)}/s</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <Num label="Reads/s" value={compact(load.reads)} />
                    <Num label="Writes/s" value={compact(load.writes)} />
                    <Num label={load.attack ? "Bot req/s" : "Bots"} value={load.attack ? compact(load.attack) : "none"} tone={load.attack ? "err" : undefined} />
                  </dl>
                )}
                {incidentText && (
                  <p className="mt-3 flex gap-2 rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2 text-[12.5px] text-fg">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
                    {incidentText}
                  </p>
                )}
                {permanent && (
                  <p className="mt-3 text-[12px] text-subtle">
                    Your redirect answers {permanent.status}, so browsers answer {compact(load.clientCached ?? 0)} repeat clicks a second
                    themselves. Those never reach you, and never get counted.
                  </p>
                )}
              </section>

              {globalKnobs.length > 0 && (
                <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
                  <h3 className="text-[13px] text-subtle">Design choices</h3>
                  {globalKnobs.map((k) => (
                    <KnobSelect
                      key={k.id}
                      knob={k}
                      value={knobChoices[k.id] ?? k.default}
                      onChange={(v) => {
                        store.getState().setConfigs({ custom: { [k.id]: v } });
                        track("drill_knob_changed", { drill: drill.slug, knob: `custom_${k.id}`, value: v });
                      }}
                    />
                  ))}
                </section>
              )}

              <section>
                <h3 className="mb-2 text-[13px] text-subtle">To pass</h3>
                <ul className="space-y-1.5">
                  {step.constraints.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-[13px] text-fg">
                      <span className="size-1.5 rounded-full bg-line-strong" />
                      {describe(c)}
                    </li>
                  ))}
                  {(step.customCheckLabels ?? []).map((l) => (
                    <li key={l} className="flex items-center gap-2 text-[13px] text-fg">
                      <span className="size-1.5 rounded-full bg-line-strong" />
                      {l}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 text-[13px] text-subtle">Concepts</h3>
                <ul className="space-y-2">
                  {step.concepts.map((c) => (
                    <li key={c.term} className="rounded-xl border border-line bg-surface px-3 py-2.5">
                      <p className="text-[13px] font-semibold text-fg">{c.term}</p>
                      <p className="text-[12.5px] leading-relaxed text-muted">{c.text}</p>
                      {c.lesson && (
                        <Link href={`/learn/${c.lesson}`} target="_blank" className="mt-1 inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
                          <BookOpen className="size-3" /> Read the lesson
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 text-[13px] text-subtle">Hints</h3>
                <ol className="space-y-2">
                  {step.hints.slice(0, hintsOpen).map((h, i) => (
                    <li key={i} className="flex gap-2 rounded-xl border border-warn/25 bg-warn/5 px-3 py-2 text-[12.5px] leading-relaxed text-muted">
                      <span className="font-mono text-[11px] text-warn">{i + 1}</span>
                      {h}
                    </li>
                  ))}
                </ol>
                {hintsOpen < step.hints.length ? (
                  <button
                    type="button"
                    onClick={() => {
                      store.getState().openHint(step.id);
                      track("drill_hint_opened", { drill: drill.slug, step: index, hint: hintsOpen + 1 });
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg"
                  >
                    <Lightbulb className="size-3.5 text-warn" />
                    {hintsOpen === 0 ? "Need a hint?" : "Another hint"}
                    <span className="text-subtle">
                      ({hintsOpen}/{step.hints.length})
                    </span>
                    <ChevronDown className="size-3.5" />
                  </button>
                ) : (
                  <p className="mt-2 text-[12px] text-subtle">That&apos;s every hint for this step.</p>
                )}
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Num({ label, value, tone }: { label: string; value: string; tone?: "err" }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
      <dt className="text-[13px] text-subtle">{label}</dt>
      <dd className={cn("font-mono text-[14px] font-semibold", tone === "err" ? "text-err" : "text-fg")}>{value}</dd>
    </div>
  );
}
