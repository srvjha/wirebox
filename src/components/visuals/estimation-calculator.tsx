"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Segmented, Slider, VisualFrame, bytes, compact } from "./foundations-kit";

type Inputs = {
  /** log10 of daily active users */
  dauLog: number;
  actions: number;
  /** log10 of reads per write */
  ratioLog: number;
  /** log10 of payload bytes */
  payloadLog: number;
  peak: number;
};

const presets: Record<string, { label: string; v: Inputs }> = {
  fest: {
    label: "Gatepass on fest day",
    v: { dauLog: Math.log10(4000), actions: 30, ratioLog: Math.log10(50), payloadLog: Math.log10(2000), peak: 20 },
  },
  cities: {
    label: "Gatepass in 40 cities",
    v: { dauLog: Math.log10(2_000_000), actions: 40, ratioLog: Math.log10(100), payloadLog: Math.log10(3000), peak: 10 },
  },
  shortener: {
    label: "A URL shortener",
    v: { dauLog: Math.log10(50_000_000), actions: 5, ratioLog: Math.log10(100), payloadLog: Math.log10(500), peak: 3 },
  },
};

const DAY = 86_400;

function verdict(peakRps: number) {
  if (peakRps < 500) return { tone: "ok", text: "One ordinary server handles this with room to spare." } as const;
  if (peakRps < 5_000) return { tone: "warn", text: "A few servers behind a load balancer, and a cache for reads." } as const;
  if (peakRps < 50_000) return { tone: "warn", text: "Dozens of servers, heavy caching, and a database that scales reads." } as const;
  return { tone: "err", text: "Serious scale: caching at every layer, sharded data, many regions." } as const;
}

/** Back-of-the-envelope calculator: users in, requests/second, storage and bandwidth out. */
export function EstimationCalculator() {
  const [v, setV] = useState<Inputs>(presets.fest.v);
  const [preset, setPreset] = useState<string>("fest");

  const dau = Math.round(10 ** v.dauLog);
  const ratio = Math.round(10 ** v.ratioLog);
  const payload = 10 ** v.payloadLog;
  const perDay = dau * v.actions;
  const writesDay = perDay / (ratio + 1);
  const readsDay = perDay - writesDay;
  const avg = perDay / DAY;
  const peak = avg * v.peak;
  const storageYear = writesDay * payload * 365;
  const bwAvg = avg * payload;
  const bwPeak = peak * payload;
  const call = verdict(peak);

  const set = (patch: Partial<Inputs>) => {
    setV((s) => ({ ...s, ...patch }));
    setPreset("custom");
  };
  const commit = (control: string, value: number) => track("visual_interacted", { visual: "estimation-calculator", control, value });

  const results = [
    { label: "Average load", value: `${compact(avg)} req/s`, sub: `${compact(readsDay / DAY)} reads · ${compact(writesDay / DAY)} writes per second` },
    { label: "Peak load", value: `${compact(peak)} req/s`, sub: `average × ${v.peak}`, strong: true },
    { label: "New data per year", value: bytes(storageYear), sub: `${compact(writesDay)} writes/day × ${bytes(payload)} × 365` },
    { label: "Bandwidth", value: `${bytes(bwAvg)}/s`, sub: `peak ${bytes(bwPeak)}/s` },
  ];

  return (
    <VisualFrame
      title="Estimate any system in five numbers"
      caption="Move a slider or pick a preset. Everything rounds generously: the goal is the right order of magnitude, not the exact value."
    >
      <Segmented
        label="Presets"
        value={preset}
        onChange={(p) => {
          if (p === "custom") return;
          setPreset(p);
          setV(presets[p].v);
          track("visual_interacted", { visual: "estimation-calculator", control: "preset", value: p });
        }}
        options={[
          ...Object.entries(presets).map(([value, p]) => ({ value, label: p.label })),
          ...(preset === "custom" ? [{ value: "custom", label: "Custom" }] : []),
        ]}
      />

      <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Slider
          label="Daily active users"
          value={v.dauLog}
          min={2}
          max={8}
          step={0.05}
          display={compact(dau)}
          onChange={(x) => set({ dauLog: x })}
          onCommit={(x) => commit("dau", Math.round(10 ** x))}
        />
        <Slider
          label="Requests per user per day"
          value={v.actions}
          min={1}
          max={200}
          display={String(v.actions)}
          onChange={(x) => set({ actions: x })}
          onCommit={(x) => commit("actions", x)}
        />
        <Slider
          label="Reads per write"
          value={v.ratioLog}
          min={0}
          max={3}
          step={0.05}
          display={`${ratio} : 1`}
          onChange={(x) => set({ ratioLog: x })}
          onCommit={(x) => commit("ratio", Math.round(10 ** x))}
        />
        <Slider
          label="Average payload"
          value={v.payloadLog}
          min={2}
          max={7}
          step={0.05}
          display={bytes(payload)}
          onChange={(x) => set({ payloadLog: x })}
          onCommit={(x) => commit("payload", Math.round(10 ** x))}
        />
        <Slider
          label="Peak factor (busiest second ÷ average)"
          value={v.peak}
          min={1}
          max={50}
          display={`× ${v.peak}`}
          onChange={(x) => set({ peak: x })}
          onCommit={(x) => commit("peak", x)}
        />
        <div className="rounded-xl border border-dashed border-line px-3 py-2 text-[12px] leading-relaxed text-subtle">
          <span className="font-mono text-muted">{compact(perDay)}</span> requests a day ÷{" "}
          <span className="font-mono text-muted">86,400</span> s ≈{" "}
          <span className="font-mono text-fg">{compact(avg)}</span>/s. Tip: call a day 100,000 seconds.
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4" aria-live="polite">
        {results.map((r) => (
          <div
            key={r.label}
            className={cn("rounded-xl border p-3", r.strong ? "border-accent/40 bg-accent-soft" : "border-line bg-surface-2")}
          >
            <dt className="text-[11.5px] text-subtle">{r.label}</dt>
            <dd className="mt-0.5 font-mono text-[17px] font-semibold text-fg tabular-nums">{r.value}</dd>
            <dd className="mt-1 text-[11px] leading-snug text-subtle">{r.sub}</dd>
          </div>
        ))}
      </dl>
      <p
        className={cn(
          "mt-3 rounded-xl border px-3 py-2 text-[13px]",
          call.tone === "ok" && "border-ok/30 bg-ok/5 text-ok",
          call.tone === "warn" && "border-warn/30 bg-warn/5 text-warn",
          call.tone === "err" && "border-err/30 bg-err/5 text-err",
        )}
      >
        <span className="font-semibold">At {compact(peak)} req/s peak:</span> <span className="text-muted">{call.text}</span>
      </p>
    </VisualFrame>
  );
}
