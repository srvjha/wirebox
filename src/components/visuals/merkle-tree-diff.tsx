"use client";

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { GitCompareArrows, Play, RotateCcw, Shuffle, StepForward, Wrench } from "lucide-react";
import { trackVisual } from "@/lib/analytics";
import { cn, formatNumber } from "@/lib/utils";
import { hash32, hex32 } from "./algo-hash";
import { SimButton, Stat, VisualFrame } from "./algo-kit";

/**
 * Two replicas of the Gatepass bookings table, split into 16 key ranges.
 * Each builds a binary Merkle tree (leaf = hash of the block, parent = hash
 * of its children's hashes). Anti-entropy compares roots and only descends
 * into subtrees whose hashes differ.
 */

const VISUAL = "merkle-tree-diff";
const LEAVES = 16;
const NODES = LEAVES * 2; // heap layout, index 1 is the root, 16..31 are leaves

const blockLabel = (i: number) => `bookings ${String(i * 1000).padStart(5, "0")}–${String(i * 1000 + 999).padStart(5, "0")}`;
const A_BLOCKS = Array.from({ length: LEAVES }, (_, i) => `${blockLabel(i)} @v1`);

function buildTree(blocks: string[]): number[] {
  const t = new Array<number>(NODES).fill(0);
  for (let i = 0; i < LEAVES; i++) t[LEAVES + i] = hash32(blocks[i]);
  for (let i = LEAVES - 1; i >= 1; i--) t[i] = hash32(hex32(t[2 * i]) + hex32(t[2 * i + 1]));
  return t;
}

type Status = "match" | "differs";
type Compare = { queue: number[]; status: Record<number, Status>; compared: number; diffLeaves: number[] };

const freshCompare = (): Compare => ({ queue: [1], status: {}, compared: 0, diffLeaves: [] });

function step(c: Compare, a: number[], b: number[]): Compare {
  if (!c.queue.length) return c;
  const [node, ...rest] = c.queue;
  const same = a[node] === b[node];
  const queue = same || node >= LEAVES ? rest : [...rest, 2 * node, 2 * node + 1];
  return {
    queue,
    status: { ...c.status, [node]: same ? "match" : "differs" },
    compared: c.compared + 1,
    diffLeaves: !same && node >= LEAVES ? [...c.diffLeaves, node - LEAVES] : c.diffLeaves,
  };
}

// layout
const W = 640;
const LEVEL_Y = [24, 74, 124, 174, 230];
function pos(i: number): [number, number] {
  const level = Math.floor(Math.log2(i));
  const count = 2 ** level;
  const idx = i - count;
  const slot = W / count;
  return [slot * idx + slot / 2, LEVEL_Y[level]];
}

export function MerkleTreeDiff() {
  const reduce = useReducedMotion();
  const [bBlocks, setBBlocks] = useState<string[]>(() => A_BLOCKS.map((b, i) => (i === 5 || i === 11 ? b.replace("@v1", "@v2") : b)));
  const [cmp, setCmp] = useState<Compare>(freshCompare);
  const [running, setRunning] = useState(false);

  const a = useMemo(() => buildTree(A_BLOCKS), []);
  const b = useMemo(() => buildTree(bBlocks), [bBlocks]);
  const truthDiff = bBlocks.filter((x, i) => x !== A_BLOCKS[i]).length;
  const done = cmp.queue.length === 0;

  useEffect(() => {
    if (!running) return;
    if (done) {
      const t = setTimeout(() => setRunning(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCmp((c) => step(c, a, b)), reduce ? 0 : 380);
    return () => clearTimeout(t);
  }, [running, done, cmp, a, b, reduce]);

  function changeB(next: string[]) {
    setBBlocks(next);
    setCmp(freshCompare());
    setRunning(false);
    trackVisual(VISUAL);
  }

  function toggleBlock(i: number) {
    const next = [...bBlocks];
    next[i] = next[i] === A_BLOCKS[i] ? A_BLOCKS[i].replace("@v1", "@v2") : A_BLOCKS[i];
    changeB(next);
  }

  const bigN = 2 ** 20;
  const bigCost = truthDiff ? Math.min(bigN * 2 - 1, 1 + 2 * truthDiff * 20) : 1;

  return (
    <VisualFrame
      eyebrow="Simulation · Merkle tree anti-entropy"
      title="Which bookings ranges disagree?"
      caption="Replica A and replica B each hash 16 key ranges into a Merkle tree. Click blocks on replica B to make them differ, then compare: matching hashes end the search for that whole subtree."
    >
      <div className="flex flex-wrap gap-2">
        <SimButton primary onClick={() => { setRunning(true); trackVisual(VISUAL); }} disabled={done || running}>
          <Play className="size-3.5" /> Compare
        </SimButton>
        <SimButton onClick={() => { setCmp((c) => step(c, a, b)); trackVisual(VISUAL); }} disabled={done || running}>
          <StepForward className="size-3.5" /> Step
        </SimButton>
        <SimButton
          onClick={() => {
            const i = Math.floor(Math.random() * LEAVES);
            const next = [...bBlocks];
            next[i] = `${blockLabel(i)} @v${2 + Math.floor(Math.random() * 90)}`;
            changeB(next);
          }}
        >
          <Shuffle className="size-3.5" /> Change a random block on B
        </SimButton>
        <SimButton onClick={() => changeB(bBlocks.map((x, i) => (cmp.diffLeaves.includes(i) ? A_BLOCKS[i] : x)))} disabled={!done || !cmp.diffLeaves.length}>
          <Wrench className="size-3.5" /> Repair found blocks
        </SimButton>
        <SimButton onClick={() => changeB([...A_BLOCKS])}>
          <RotateCcw className="size-3.5" /> In sync
        </SimButton>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-bg p-2 sm:p-3">
        <svg viewBox={`0 0 ${W} 250`} className="block h-auto w-full" role="img" aria-label={`Merkle tree comparison: ${cmp.compared} hashes compared`}>
          {Array.from({ length: LEAVES - 1 }, (_, k) => k + 1).flatMap((i) =>
            [2 * i, 2 * i + 1].map((c) => {
              const [x1, y1] = pos(i);
              const [x2, y2] = pos(c);
              const active = cmp.status[i] === "differs" && cmp.status[c] !== undefined;
              return <line key={`${i}-${c}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={active ? "var(--err)" : "var(--border-strong)"} strokeOpacity={active ? 0.7 : 1} />;
            }),
          )}
          {Array.from({ length: NODES - 1 }, (_, k) => k + 1).map((i) => {
            const [x, y] = pos(i);
            const st = cmp.status[i];
            const next = cmp.queue[0] === i;
            const fill = st === "match" ? "var(--ok)" : st === "differs" ? "var(--err)" : "var(--surface-2)";
            const leaf = i >= LEAVES;
            return (
              <g key={i}>
                <title>{`node ${i}: A ${hex32(a[i])} / B ${hex32(b[i])}`}</title>
                {leaf ? (
                  <rect x={x - 13} y={y - 11} width={26} height={22} rx={4} fill={fill} fillOpacity={st ? 0.3 : 1} stroke={next ? "var(--accent)" : st === "differs" ? "var(--err)" : st === "match" ? "var(--ok)" : "var(--border-strong)"} strokeWidth={next ? 2 : 1} />
                ) : (
                  <circle cx={x} cy={y} r={i === 1 ? 12 : 9} fill={fill} fillOpacity={st ? 0.3 : 1} stroke={next ? "var(--accent)" : st === "differs" ? "var(--err)" : st === "match" ? "var(--ok)" : "var(--border-strong)"} strokeWidth={next ? 2 : 1} />
                )}
                {leaf && (
                  <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fontFamily="var(--font-geist-mono)" fill="var(--fg-muted)">
                    {(i - LEAVES).toString(16)}
                  </text>
                )}
              </g>
            );
          })}
          <text x={W / 2 + 22} y={20} fontSize={10.5} fontFamily="var(--font-geist-mono)" fill="var(--fg-muted)">
            A {hex32(a[1])}
          </text>
          <text x={W / 2 + 22} y={34} fontSize={10.5} fontFamily="var(--font-geist-mono)" fill={a[1] === b[1] ? "var(--ok)" : "var(--err)"}>
            B {hex32(b[1])}
          </text>
          <text x={8} y={20} fontSize={10} fontFamily="var(--font-geist-mono)" fill="var(--fg-subtle)">
            ROOT
          </text>
          <text x={8} y={250} fontSize={10} fontFamily="var(--font-geist-mono)" fill="var(--fg-subtle)">
            LEAVES
          </text>
        </svg>
      </div>

      <div className="mt-3 space-y-1.5">
        {(["A", "B"] as const).map((r) => (
          <div key={r} className="flex items-center gap-2">
            <span className="w-16 shrink-0 font-mono text-[10.5px] tracking-wider text-subtle uppercase">Replica {r}</span>
            <div className="grid flex-1 grid-cols-8 gap-1 sm:grid-cols-16">
              {Array.from({ length: LEAVES }, (_, i) => {
                const differs = bBlocks[i] !== A_BLOCKS[i];
                const cls = cn(
                  "h-7 rounded-md border font-mono text-[10.5px] transition-colors",
                  r === "B" && differs ? "border-warn/60 bg-warn/15 text-warn" : "border-line bg-surface-2 text-subtle",
                );
                return r === "A" ? (
                  <span key={i} className={cn(cls, "grid place-items-center")} title={A_BLOCKS[i]}>
                    {i.toString(16)}
                  </span>
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleBlock(i)}
                    aria-pressed={differs}
                    aria-label={`Block ${i}, ${blockLabel(i)}${differs ? ", differs from A" : ""}`}
                    title={bBlocks[i]}
                    className={cn(cls, "outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/60")}
                  >
                    {i.toString(16)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 min-h-10 text-[13px] leading-relaxed text-muted" aria-live="polite">
        <GitCompareArrows className="mr-1.5 inline size-3.5 text-subtle" />
        {cmp.compared === 0
          ? `Roots ${a[1] === b[1] ? "match: the replicas agree, nothing else to check." : "differ. Press Compare or Step to find out where."}`
          : done
            ? cmp.diffLeaves.length
              ? `Done. ${cmp.compared} hash comparisons found ${cmp.diffLeaves.length} block${cmp.diffLeaves.length > 1 ? "s" : ""} to sync: ${cmp.diffLeaves.map((x) => x.toString(16)).join(", ")}. Shipping every block would have meant comparing all ${LEAVES}.`
              : "Done. The roots matched, so one comparison proved all 16 blocks are identical."
            : `Comparing… ${cmp.compared} so far, ${cmp.queue.length} subtree${cmp.queue.length === 1 ? "" : "s"} left to check.`}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Blocks that differ" value={truthDiff} tone={truthDiff ? "warn" : "ok"} />
        <Stat label="Hashes compared" value={cmp.compared} tone="info" sub={`naive: ${LEAVES} blocks`} />
        <Stat label="Blocks found" value={cmp.diffLeaves.length} tone={done ? "ok" : "default"} />
        <Stat label="At 1M blocks" value={`≤ ${formatNumber(bigCost)}`} sub={`hashes for ${truthDiff} diff${truthDiff === 1 ? "" : "s"}, vs ${formatNumber(bigN)}`} />
      </div>
    </VisualFrame>
  );
}
