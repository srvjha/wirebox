"use client";

import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, Plus, RotateCcw, Search } from "lucide-react";
import { track } from "@/lib/analytics";
import { formatNumber } from "@/lib/utils";
import { build, countNodes, height, insert, search, type BNode, type BTree, type InsertReport } from "./b-tree-core";
import { Range, Segmented, SimButton, Stat, VisualFrame } from "./algo-kit";

/**
 * Insert keys into a real B-tree and watch nodes fill, split and push a key
 * up. Search highlights the root-to-leaf path: one page read per level.
 */

const VISUAL = "b-tree-sim";
const START_KEYS = [42, 17, 63, 8, 25, 51, 90, 33, 71, 12, 58, 4, 37, 80];
const MAX_KEYS = 60;
const CELL = 24;
const NODE_H = 26;
const LEVEL_H = 66;
const GAP = 12;

type Placed = { node: BNode; x: number; y: number; w: number; depth: number };

function layout(root: BNode, order: number) {
  const w = (order - 1) * CELL + 8;
  const placed = new Map<number, Placed>();
  let cursor = 0;
  let maxDepth = 0;
  function rec(n: BNode, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    let x: number;
    if (!n.children.length) {
      x = cursor;
      cursor += w + GAP;
    } else {
      const xs = n.children.map((c) => rec(c, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    placed.set(n.id, { node: n, x, y: depth * LEVEL_H, w, depth });
    return x;
  }
  rec(root, 0);
  return { placed: [...placed.values()], byId: placed, width: Math.max(cursor - GAP, w), height: maxDepth * LEVEL_H + NODE_H };
}

export function BTreeSim() {
  const [order, setOrder] = useState(4);
  const [keys, setKeys] = useState<number[]>(START_KEYS);
  const [report, setReport] = useState<InsertReport | null>(null);
  const [lastKey, setLastKey] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [find, setFind] = useState<{ key: number; path: number[]; found: boolean } | null>(null);

  const tree: BTree = useMemo(() => build(order, keys), [order, keys]);
  const { placed, byId, width, height: h } = useMemo(() => layout(tree.root, order), [tree, order]);
  const pad = 8;
  const full = keys.length >= MAX_KEYS;

  const splitIds = new Set(report?.splits.flatMap((s) => [s.left, s.right]) ?? []);
  const insertPath = new Set(report?.path ?? []);
  const findPath = new Set(find?.path ?? []);

  function add(k: number, control: string) {
    if (full || !Number.isFinite(k)) return;
    const res = insert(tree, k);
    setReport(res.report);
    setLastKey(k);
    setFind(null);
    if (!res.report.duplicate) setKeys((ks) => [...ks, k]);
    track("visual_interacted", { visual: VISUAL, control, value: k });
  }

  function nextFree(from: number) {
    const set = new Set(keys);
    let k = from;
    while (set.has(k)) k++;
    return k;
  }

  function runSearch(k: number) {
    const r = search(tree, k);
    setFind({ key: k, ...r });
    setReport(null);
    track("visual_interacted", { visual: VISUAL, control: "search", value: r.path.length });
  }

  let message = "Insert a key to see where it lands.";
  if (find) message = `${find.found ? "Found" : "Not found:"} ${find.key} after visiting ${find.path.length} node${find.path.length > 1 ? "s" : ""}, one per level. On disk, that is ${find.path.length} page reads.`;
  else if (report?.duplicate) message = `${lastKey} is already in the tree.`;
  else if (report) {
    message = report.splits.length
      ? `Inserted ${lastKey}. ` +
        report.splits.map((s) => `A node overflowed, split in two, and pushed ${s.promoted} up.`).join(" ") +
        (report.grewTaller ? " The root split, so the tree grew one level, at the top." : "")
      : `Inserted ${lastKey} into a leaf with room. No splits.`;
  }

  return (
    <VisualFrame
      eyebrow="Simulation · B-tree"
      title="Insert, split, search"
      caption="Each box is a node (a disk page) with room for order − 1 keys. Orange: the path the last insert took. Yellow: nodes created by a split. Violet: the search path."
    >
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <Segmented
          label="Order (max children)"
          value={order}
          options={[3, 4, 5, 6].map((v) => ({ value: v, label: String(v) }))}
          onChange={(v) => {
            setOrder(v);
            setReport(null);
            setFind(null);
            track("visual_interacted", { visual: VISUAL, control: "order", value: v });
          }}
        />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const k = parseInt(draft, 10);
            if (k >= 0 && k <= 999) add(k, "insert");
            setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
            placeholder="0–999"
            aria-label="Key to insert"
            className="h-8 w-20 rounded-lg border border-line bg-bg px-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
          />
          <SimButton type="submit" primary disabled={full}>
            <Plus className="size-3.5" /> Insert
          </SimButton>
        </form>
        <div className="flex flex-wrap gap-2">
          <SimButton onClick={() => add(nextFree(Math.floor(Math.random() * 1000)), "insert_random")} disabled={full}>
            Random
          </SimButton>
          <SimButton onClick={() => add(nextFree(Math.max(...keys, 0) + 1), "insert_ascending")} disabled={full} title="Insert the next key after the current maximum">
            <ArrowDownWideNarrow className="size-3.5" /> Next ascending
          </SimButton>
          <SimButton
            onClick={() => {
              setKeys(START_KEYS);
              setReport(null);
              setFind(null);
              track("visual_interacted", { visual: VISUAL, control: "reset", value: true });
            }}
          >
            <RotateCcw className="size-3.5" /> Reset
          </SimButton>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-bg p-3">
        <svg
          viewBox={`${-pad} ${-pad} ${width + pad * 2} ${h + pad * 2}`}
          width={width + pad * 2}
          height={h + pad * 2}
          className="mx-auto block max-w-none"
          role="img"
          aria-label={`B-tree of order ${order} with ${tree.size} keys and height ${height(tree)}`}
        >
          {placed.map((p) =>
            p.node.children.map((c, i) => {
              const child = byId.get(c.id)!;
              const active = (insertPath.has(p.node.id) && insertPath.has(c.id)) || (findPath.has(p.node.id) && findPath.has(c.id));
              return (
                <line
                  key={`${p.node.id}-${c.id}`}
                  x1={p.x + 4 + i * CELL}
                  y1={p.y + NODE_H}
                  x2={child.x + child.w / 2}
                  y2={child.y}
                  stroke={active ? (find ? "var(--info)" : "var(--accent)") : "var(--border-strong)"}
                  strokeWidth={active ? 1.8 : 1}
                />
              );
            }),
          )}
          {placed.map((p) => {
            const onFind = findPath.has(p.node.id);
            const onInsert = insertPath.has(p.node.id);
            const split = splitIds.has(p.node.id);
            const stroke = onFind ? "var(--info)" : split ? "var(--warn)" : onInsert ? "var(--accent)" : "var(--border-strong)";
            return (
              <g key={p.node.id} style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: "transform 350ms ease" }}>
                <rect width={p.w} height={NODE_H} rx={6} fill="var(--surface-2)" stroke={stroke} strokeWidth={stroke === "var(--border-strong)" ? 1 : 1.8} />
                {Array.from({ length: order - 1 }, (_, i) => {
                  const k = p.node.keys[i];
                  const hit = k !== undefined && ((find?.found && find.key === k && onFind) || (!find && k === lastKey && onInsert));
                  return (
                    <g key={i}>
                      {i > 0 && <line x1={4 + i * CELL} x2={4 + i * CELL} y1={4} y2={NODE_H - 4} stroke="var(--border)" />}
                      {hit && <rect x={5 + i * CELL} y={3} width={CELL - 2} height={NODE_H - 6} rx={4} fill={find ? "var(--ok)" : "var(--accent)"} fillOpacity={0.25} />}
                      <text
                        x={4 + i * CELL + CELL / 2}
                        y={NODE_H / 2 + 4}
                        textAnchor="middle"
                        fontSize={11}
                        fontFamily="var(--font-geist-mono)"
                        fill={k === undefined ? "var(--fg-subtle)" : "var(--fg)"}
                      >
                        {k ?? "·"}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 min-h-10 text-[13px] leading-relaxed text-muted" aria-live="polite">
        {message}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const k = parseInt((e.currentTarget.elements.namedItem("q") as HTMLInputElement).value, 10);
            if (Number.isFinite(k)) runSearch(k);
          }}
        >
          <input
            name="q"
            defaultValue="58"
            inputMode="numeric"
            aria-label="Key to search"
            className="h-8 w-20 rounded-lg border border-line bg-bg px-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
          />
          <SimButton type="submit">
            <Search className="size-3.5" /> Search
          </SimButton>
        </form>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Keys" value={`${tree.size}${full ? " (max)" : ""}`} />
        <Stat label="Height" value={height(tree)} sub="levels = page reads" tone="accent" />
        <Stat label="Nodes" value={countNodes(tree.root)} />
        <Stat label="Last insert" value={report ? `${report.splits.length} split${report.splits.length === 1 ? "" : "s"}` : "–"} tone={report?.grewTaller ? "warn" : "default"} sub={report?.grewTaller ? "root split: +1 level" : undefined} />
      </div>
    </VisualFrame>
  );
}

/**
 * Height of a B-tree for a real page size, versus a binary search tree.
 * Fan-out is how many child pointers fit in one page.
 */
export function BTreeHeight() {
  const [fanout, setFanout] = useState(300);
  const [exp, setExp] = useState(8);
  const rows = Math.pow(10, exp);
  const levels = Math.max(1, Math.ceil(Math.log(rows) / Math.log(fanout)));
  const binary = Math.ceil(Math.log2(rows));
  const capacity = (l: number) => Math.pow(fanout, l);

  return (
    <VisualFrame
      eyebrow="Calculator · height vs rows"
      title="How tall does the tree get?"
      caption="An 8 KB Postgres page holds a few hundred keys and pointers, so each level multiplies capacity by a few hundred. Drag the row count and see how slowly the height moves."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Range
          label="Fan-out (keys per page)"
          min={10}
          max={1000}
          step={10}
          value={fanout}
          onChange={setFanout}
          onCommit={(v) => track("visual_interacted", { visual: "b-tree-height", control: "fanout", value: v })}
        />
        <Range
          label="Rows"
          min={3}
          max={11}
          value={exp}
          onChange={setExp}
          display={formatNumber(rows)}
          onCommit={(v) => track("visual_interacted", { visual: "b-tree-height", control: "rows", value: v })}
        />
      </div>
      <div className="mt-4 space-y-1.5">
        {Array.from({ length: levels }, (_, i) => {
          const cap = Math.min(capacity(i + 1), 1e15);
          return (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="w-14 font-mono text-subtle">level {i + 1}</span>
              <span className="h-5 rounded-md bg-accent/70" style={{ width: `${((i + 1) / levels) * 70}%` }} />
              <span className="font-mono text-muted tabular-nums">≤ {cap >= 1e15 ? "10¹⁵+" : formatNumber(cap)} keys</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="B-tree height" value={`${levels} level${levels > 1 ? "s" : ""}`} tone="ok" sub={`${Math.max(levels - 2, 0)} disk read${levels - 2 === 1 ? "" : "s"} if the top 2 levels sit in memory`} />
        <Stat label="Binary tree height" value={`${binary} levels`} tone="err" sub="two children per node" />
      </div>
    </VisualFrame>
  );
}
