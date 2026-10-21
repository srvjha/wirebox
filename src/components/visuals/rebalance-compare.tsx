"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Segmented, Slider, Stat, VisualFrame, hash32, useVisualTracker } from "./distributed-visual-kit";

type Scheme = "mod" | "fixed" | "ring";
const KEYS = 200;
const PARTS = 64;
const VNODES = 12;
const COLORS = ["var(--accent)", "var(--info)", "var(--ok)", "var(--warn)", "var(--err)", "var(--fg-muted)", "var(--res)", "var(--req)", "var(--fg-subtle)", "var(--border-strong)"];

const keyHash = Array.from({ length: KEYS }, (_, i) => hash32(`booking-${i}`));

function ringOwner(h: number, nodes: number) {
  let best = -1;
  let bestPos = Infinity;
  let first = -1;
  let firstPos = Infinity;
  for (let n = 0; n < nodes; n++) {
    for (let v = 0; v < VNODES; v++) {
      const pos = hash32(`node-${n}-vn-${v}`);
      if (pos >= h && pos < bestPos) {
        bestPos = pos;
        best = n;
      }
      if (pos < firstPos) {
        firstPos = pos;
        first = n;
      }
    }
  }
  return best >= 0 ? best : first;
}

function fixedMap(nodes: number, grow: boolean) {
  const map = Array.from({ length: PARTS }, (_, p) => p % nodes);
  if (!grow) return map;
  const target = Math.floor(PARTS / (nodes + 1));
  let given = 0;
  while (given < target) {
    const counts = Array(nodes).fill(0);
    map.forEach((n) => n < nodes && counts[n]++);
    const donor = counts.indexOf(Math.max(...counts));
    const p = map.lastIndexOf(donor);
    map[p] = nodes;
    given++;
  }
  return map;
}

function placement(scheme: Scheme, nodes: number, grow: boolean): number[] {
  const n = grow ? nodes + 1 : nodes;
  if (scheme === "mod") return keyHash.map((h) => h % n);
  if (scheme === "fixed") {
    const m = fixedMap(nodes, grow);
    return keyHash.map((h) => m[h % PARTS]);
  }
  return keyHash.map((h) => ringOwner(h, n));
}

const COPY: Record<Scheme, string> = {
  mod: "node = hash(key) mod N. Simple, but changing N changes almost every answer.",
  fixed: "Create many more partitions than nodes up front (64 here). Nodes own partitions, and a new node steals a few whole ones.",
  ring: "Nodes and keys are hashed onto a ring (12 virtual points per node). A key belongs to the next point clockwise, so a new node only claims the slices just before its points.",
};

export function RebalanceCompare() {
  const tr = useVisualTracker("rebalance-compare");
  const [scheme, setScheme] = useState<Scheme>("mod");
  const [nodes, setNodes] = useState(4);

  const { before, after, moved } = useMemo(() => {
    const b = placement(scheme, nodes, false);
    const a = placement(scheme, nodes, true);
    return { before: b, after: a, moved: b.filter((x, i) => x !== a[i]).length };
  }, [scheme, nodes]);
  const pct = (moved / KEYS) * 100;
  const ideal = 100 / (nodes + 1);
  const counts = Array.from({ length: nodes + 1 }, (_, n) => after.filter((x) => x === n).length);

  return (
    <VisualFrame
      eyebrow="Try it · rebalancing"
      title={`Add node ${nodes + 1} to a ${nodes}-node cluster`}
      hint="200 bookings are placed on nodes. Each square is a key coloured by its node after the new node joins; squares with a white ring had to move. Compare the three schemes, then change the cluster size."
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Segmented
          label="Scheme"
          value={scheme}
          onChange={(v) => {
            setScheme(v);
            tr();
          }}
          options={[
            { value: "mod", label: "hash mod N" },
            { value: "fixed", label: "Fixed partitions" },
            { value: "ring", label: "Consistent hashing" },
          ]}
        />
        <Slider className="min-w-44 flex-1" label="Nodes before" value={nodes} min={2} max={9} onChange={setNodes} onCommit={tr} />
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{COPY[scheme]}</p>

      <div className="mt-3 rounded-xl border border-line bg-bg p-3">
        <div className="grid grid-cols-[repeat(25,minmax(0,1fr))] gap-[3px]" role="img" aria-label={`${moved} of ${KEYS} keys move to a different node`}>
          {after.map((n, i) => (
            <div
              key={i}
              className={cn("aspect-square rounded-[3px]", before[i] !== n ? "ring-[1.5px] ring-fg" : "opacity-50")}
              style={{ background: COLORS[n % COLORS.length] }}
              title={`booking-${i}: node ${before[i] + 1} → node ${n + 1}`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
          {counts.map((c, n) => (
            <span key={n} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: COLORS[n % COLORS.length] }} />
              N{n + 1}: {c}
              {n === nodes && " (new)"}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Keys moved" value={`${pct.toFixed(0)}%`} tone={pct < ideal * 1.6 ? "ok" : pct < 60 ? "warn" : "err"} sub={`${moved} of ${KEYS} keys`} />
        <Stat label="Theoretical minimum" value={`${ideal.toFixed(0)}%`} sub="just enough to fill the new node" />
        <Stat label="Waste" value={`${Math.max(0, pct - ideal).toFixed(0)} pts`} sub="data moved for nothing" className="col-span-2 sm:col-span-1" />
      </div>
    </VisualFrame>
  );
}
