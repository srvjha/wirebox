"use client";

import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { trackVisual } from "@/lib/analytics";
import { mulberry32 } from "./algo-hash";
import { Range, SimButton, Stat, VisualFrame } from "./algo-kit";
import { buildQuadtree, leaves, queryBox, type QPoint } from "./geo-core";

/**
 * A point quadtree that splits a square into four whenever it holds more than
 * `capacity` points. Dense areas get small cells, empty areas stay as one big
 * cell. Tap to run a box query and count how much of the tree it touches.
 */

const VISUAL = "quadtree-split";
const S = 400;

function scatter(seed: number, n: number, cx?: number, cy?: number, spread = 0.06): QPoint[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => {
    if (cx === undefined || cy === undefined) return { x: rnd(), y: rnd() };
    const r = spread * Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    return { x: Math.min(0.999, Math.max(0, cx + r * Math.cos(a))), y: Math.min(0.999, Math.max(0, cy + r * Math.sin(a))) };
  });
}

const START: QPoint[] = [...scatter(7, 60), ...scatter(8, 40, 0.3, 0.35, 0.08), ...scatter(9, 25, 0.72, 0.7, 0.07)];

export function QuadtreeSplit() {
  const [capacity, setCapacity] = useState(4);
  const [points, setPoints] = useState<QPoint[]>(START);
  const [surges, setSurges] = useState(0);
  const [q, setQ] = useState({ x: 0.3, y: 0.35 });
  const half = 0.06;

  const tree = useMemo(() => buildQuadtree(points, capacity), [points, capacity]);
  const cells = useMemo(() => leaves(tree), [tree]);
  const maxDepth = Math.max(...cells.map((c) => c.depth));
  const result = useMemo(() => queryBox(tree, q.x - half, q.y - half, half * 2), [tree, q]);
  const visited = new Set(result.visited);
  const found = new Set(result.found);

  function place(x: number, y: number, control: string) {
    const c = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    setQ(c);
    if (control !== "keyboard") trackVisual(VISUAL);
  }

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    place((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, "query");
  }

  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    const d: Record<string, [number, number]> = { ArrowUp: [0, -0.03], ArrowDown: [0, 0.03], ArrowLeft: [-0.03, 0], ArrowRight: [0.03, 0] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    place(q.x + m[0], q.y + m[1], "keyboard");
  }

  return (
    <VisualFrame
      eyebrow="Simulation · quadtree"
      title="Cells that follow the crowd"
      caption="Each square splits into four once it holds more than the capacity. Add a surge of drivers outside the stadium and watch only that area subdivide. Tap (or use arrow keys) to move the search box."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-[240px]">
          <Range
            label="Capacity per cell"
            min={1}
            max={16}
            value={capacity}
            onChange={setCapacity}
            onCommit={() => trackVisual(VISUAL)}
          />
        </div>
        <SimButton
          primary
          onClick={() => {
            setPoints((p) => [...p, ...scatter(100 + surges, 60, 0.62, 0.3, 0.05)]);
            setSurges((s) => s + 1);
            trackVisual(VISUAL);
          }}
          disabled={points.length > 600}
        >
          <Plus className="size-3.5" /> Surge: +60 at the stadium
        </SimButton>
        <SimButton
          onClick={() => {
            setPoints(START);
            setSurges(0);
            trackVisual(VISUAL);
          }}
        >
          <RotateCcw className="size-3.5" /> Reset
        </SimButton>
      </div>

      <svg
        viewBox={`0 0 ${S} ${S}`}
        className="mx-auto mt-4 block h-auto w-full max-w-[420px] cursor-crosshair touch-none rounded-xl border border-line bg-bg outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        role="application"
        aria-label={`Quadtree with ${cells.length} cells. Use arrow keys to move the search box.`}
        tabIndex={0}
        onPointerDown={onPointer}
        onKeyDown={onKey}
      >
        {cells.map((c, i) => (
          <rect
            key={i}
            x={c.x * S}
            y={c.y * S}
            width={c.size * S}
            height={c.size * S}
            fill={visited.has(c) ? "var(--info)" : "none"}
            fillOpacity={0.1}
            stroke="var(--border-strong)"
            strokeWidth={0.8}
          />
        ))}
        {points.map((p, i) => (
          <circle key={i} cx={p.x * S} cy={p.y * S} r={2.4} fill={found.has(p) ? "var(--ok)" : "var(--accent)"} fillOpacity={found.has(p) ? 1 : 0.75} />
        ))}
        <rect x={(q.x - half) * S} y={(q.y - half) * S} width={half * 2 * S} height={half * 2 * S} fill="none" stroke="var(--info)" strokeWidth={1.6} strokeDasharray="4 3" />
      </svg>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Drivers" value={points.length} />
        <Stat label="Leaf cells" value={cells.length} sub={`deepest: level ${maxDepth}`} />
        <Stat label="Query visited" value={`${result.nodes} nodes`} sub={`${result.visited.length} leaves`} tone="info" />
        <Stat label="Points checked" value={result.checked} sub={`found ${result.found.length}, not all ${points.length}`} tone="ok" />
      </div>
    </VisualFrame>
  );
}
