"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Segmented, Slider, Stat, Toggle, VisualFrame, hash32, useVisualTracker } from "./distributed-visual-kit";

type Strategy = "range" | "hash" | "directory";
const KEYS = 120;
const P = 4;
const HOT = 118;
const PART_COLORS = ["var(--accent)", "var(--info)", "var(--ok)", "var(--warn)"];

function weights(hot: boolean) {
  // Newer shows (higher ids) get more traffic: 1..10 per key.
  const w = Array.from({ length: KEYS }, (_, i) => 1 + Math.floor(i / 12));
  if (hot) {
    const rest = w.reduce((a, b) => a + b, 0) - w[HOT];
    w[HOT] = Math.round((rest * 0.6) / 0.4); // the hot key carries 60% of all traffic
  }
  return w;
}

function assign(strategy: Strategy, w: number[]) {
  if (strategy === "range") return w.map((_, i) => Math.floor((i * P) / KEYS));
  if (strategy === "hash") return w.map((_, i) => hash32(`show-${i}`) % P);
  // Directory: a lookup table, filled greedily so the heaviest keys spread out first.
  const load = Array(P).fill(0);
  const out = Array(KEYS).fill(0);
  [...w.keys()]
    .sort((a, b) => w[b] - w[a] || a - b)
    .forEach((k) => {
      const t = load.indexOf(Math.min(...load));
      out[k] = t;
      load[t] += w[k];
    });
  return out;
}

const COPY: Record<Strategy, string> = {
  range: "Keys are cut into contiguous ranges. Great for range scans; newest keys pile onto the last partition.",
  hash: "hash(key) mod 4 picks the partition. Even by key count, but neighbours scatter across all of them.",
  directory: "A lookup table says where each key lives, so you can place anything anywhere. The table is itself a service to run.",
};

export function PartitionStrategyLab() {
  const tr = useVisualTracker("partition-strategy-lab");
  const [strategy, setStrategy] = useState<Strategy>("range");
  const [hot, setHot] = useState(false);
  const [from, setFrom] = useState(40);
  const span = 20;

  const w = useMemo(() => weights(hot), [hot]);
  const owner = useMemo(() => assign(strategy, w), [strategy, w]);
  const load = useMemo(() => {
    const l = Array(P).fill(0);
    owner.forEach((p, i) => (l[p] += w[i]));
    return l;
  }, [owner, w]);
  const total = load.reduce((a, b) => a + b, 0);
  const max = Math.max(...load);
  const imbalance = max / (total / P);
  const touched = new Set(owner.slice(from, from + span)).size;

  return (
    <VisualFrame
      eyebrow="Try it · partitioning"
      title="Where does each key live?"
      hint="120 shows sit on 4 partitions. Newer shows get more traffic. Switch the strategy, then turn on the hot key (one blockbuster show) and drag the scan window."
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Segmented
          label="Strategy"
          value={strategy}
          onChange={(v) => {
            setStrategy(v);
            tr("strategy", v);
          }}
          options={[
            { value: "range", label: "Range" },
            { value: "hash", label: "Hash" },
            { value: "directory", label: "Directory" },
          ]}
        />
        <Toggle label="One blockbuster show (hot key)" checked={hot} onChange={(v) => { setHot(v); tr("hot-key", v); }} />
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{COPY[strategy]}</p>

      <div className="mt-3 rounded-xl border border-line bg-bg p-3">
        <div className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-[3px]" role="img" aria-label="Each square is a show, coloured by the partition that stores it">
          {owner.map((p, i) => {
            const inScan = i >= from && i < from + span;
            return (
              <div
                key={i}
                title={`show-${i} → P${p + 1} (traffic ${w[i]})`}
                className={cn("aspect-square rounded-[3px]", i === HOT && hot && "ring-2 ring-fg", inScan ? "opacity-100" : "opacity-45")}
                style={{ background: PART_COLORS[p], outline: inScan ? "1px solid var(--fg)" : undefined }}
              />
            );
          })}
        </div>
        <Slider label="Scan window start (20 shows)" value={from} min={0} max={KEYS - span} onChange={setFrom} onCommit={(v) => tr("scan", v)} className="mt-3" />
      </div>

      <div className="mt-3 space-y-1.5" role="list" aria-label="Traffic per partition">
        {load.map((l, p) => (
          <div key={p} role="listitem" className="flex items-center gap-2 text-[12px]">
            <span className="w-7 font-mono text-subtle">P{p + 1}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-surface-2">
              <div className="h-full rounded transition-[width] duration-300" style={{ width: `${(l / max) * 100}%`, background: PART_COLORS[p] }} />
            </div>
            <span className="w-12 text-right font-mono tabular-nums text-muted">{Math.round((l / total) * 100)}%</span>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Hottest vs fair share" value={`${imbalance.toFixed(2)}x`} tone={imbalance < 1.3 ? "ok" : imbalance < 2 ? "warn" : "err"} sub="1.00x is perfectly even" />
        <Stat label="Scan touches" value={`${touched} of ${P}`} tone={touched === 1 ? "ok" : touched === P ? "warn" : "default"} sub="partitions for the 20-show window" />
        <Stat label="Busiest partition" value={`P${load.indexOf(max) + 1}`} sub={`${Math.round((max / total) * 100)}% of all traffic`} className="col-span-2 sm:col-span-1" />
      </div>
    </VisualFrame>
  );
}
