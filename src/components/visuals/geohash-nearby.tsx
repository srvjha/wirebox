"use client";

import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { mulberry32 } from "./algo-hash";
import { Range, Segmented, Stat, VisualFrame } from "./algo-kit";
import { cellAndNeighbours, cellSize, geohash, geohashBounds, haversine } from "./geo-core";

/**
 * "Cabs near the venue": real geohashes over a 10 km square of Bengaluru.
 * The nearby search scans the rider's cell and its 8 neighbours by prefix,
 * then filters candidates by true distance. Turning neighbours off, or picking
 * cells smaller than the radius, makes it miss drivers.
 */

const VISUAL = "geohash-nearby";
const BOX = { minLat: 12.92, maxLat: 13.02, minLon: 77.54, maxLon: 77.64 };
const W = 600;
const LON_KM = (BOX.maxLon - BOX.minLon) * 111.32 * Math.cos((12.97 * Math.PI) / 180);
const LAT_KM = (BOX.maxLat - BOX.minLat) * 110.57;
const H = Math.round((W * LAT_KM) / LON_KM);

const sx = (lon: number) => ((lon - BOX.minLon) / (BOX.maxLon - BOX.minLon)) * W;
const sy = (lat: number) => ((BOX.maxLat - lat) / (BOX.maxLat - BOX.minLat)) * H;

type Driver = { id: number; lat: number; lon: number; gh: string };

const DRIVERS: Driver[] = (() => {
  const rnd = mulberry32(2024);
  const hubs = [
    [12.9788, 77.5996, 0.008], // stadium
    [12.9352, 77.6245, 0.01],
    [12.9719, 77.6412, 0.006],
    [13.0068, 77.5713, 0.009],
  ];
  const out: Driver[] = [];
  for (let i = 0; i < 260; i++) {
    let lat: number;
    let lon: number;
    if (i < 170) {
      const [hl, hn, spread] = hubs[i % hubs.length];
      const r = spread * Math.sqrt(rnd());
      const a = rnd() * Math.PI * 2;
      lat = hl + r * Math.sin(a);
      lon = hn + r * Math.cos(a);
    } else {
      lat = BOX.minLat + rnd() * (BOX.maxLat - BOX.minLat);
      lon = BOX.minLon + rnd() * (BOX.maxLon - BOX.minLon);
    }
    if (lat < BOX.minLat || lat > BOX.maxLat || lon < BOX.minLon || lon > BOX.maxLon) continue;
    out.push({ id: i, lat, lon, gh: geohash(lat, lon, 8) });
  }
  return out;
})();

export function GeohashNearby() {
  const [precision, setPrecision] = useState(6);
  const [radius, setRadius] = useState(500);
  const [withNeighbours, setWithNeighbours] = useState(true);
  const [rider, setRider] = useState({ lat: 12.9745, lon: 77.5965 });

  const own = geohash(rider.lat, rider.lon, precision);
  const cells = useMemo(() => (withNeighbours ? cellAndNeighbours(own) : [own]), [own, withNeighbours]);
  const { dLon, dLat } = cellSize(precision);
  const cellW = dLon * 111320 * Math.cos((rider.lat * Math.PI) / 180);
  const cellH = dLat * 110570;

  const result = useMemo(() => {
    const candidates = DRIVERS.filter((d) => cells.some((c) => d.gh.startsWith(c)));
    const dist = (d: Driver) => haversine(rider.lat, rider.lon, d.lat, d.lon);
    const found = new Set(candidates.filter((d) => dist(d) <= radius).map((d) => d.id));
    const truth = DRIVERS.filter((d) => dist(d) <= radius);
    const missed = new Set(truth.filter((d) => !found.has(d.id)).map((d) => d.id));
    return { candidates: new Set(candidates.map((d) => d.id)), found, missed, truth: truth.length };
  }, [cells, rider, radius]);

  // grid lines aligned to the global geohash grid
  const vLines: number[] = [];
  for (let lon = Math.ceil(BOX.minLon / dLon) * dLon; lon < BOX.maxLon; lon += dLon) vLines.push(sx(lon));
  const hLines: number[] = [];
  for (let lat = Math.ceil(BOX.minLat / dLat) * dLat; lat < BOX.maxLat; lat += dLat) hLines.push(sy(lat));

  function moveTo(lat: number, lon: number, control: string) {
    const clamped = {
      lat: Math.min(BOX.maxLat - 1e-4, Math.max(BOX.minLat + 1e-4, lat)),
      lon: Math.min(BOX.maxLon - 1e-4, Math.max(BOX.minLon + 1e-4, lon)),
    };
    setRider(clamped);
    if (control !== "keyboard") track("visual_interacted", { visual: VISUAL, control, value: geohash(clamped.lat, clamped.lon, precision) });
  }

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    moveTo(BOX.maxLat - fy * (BOX.maxLat - BOX.minLat), BOX.minLon + fx * (BOX.maxLon - BOX.minLon), "place_rider");
  }

  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    const step = 0.0015;
    const d: Record<string, [number, number]> = { ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    moveTo(rider.lat + m[0], rider.lon + m[1], "keyboard");
  }

  const rx = (radius / 1000 / LON_KM) * W;
  const ry = (radius / 1000 / LAT_KM) * H;
  const tooSmall = radius > Math.min(cellW, cellH);
  const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

  return (
    <VisualFrame
      eyebrow="Simulation · geohash nearby search"
      title="Find drivers near the rider"
      caption="A 10 km square of Bengaluru with 260 drivers. Tap the map (or focus it and use the arrow keys) to move the rider. The search scans the highlighted cells by geohash prefix, then keeps drivers inside the circle."
    >
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Segmented
          label="Geohash precision"
          value={precision}
          options={[5, 6, 7].map((v) => ({ value: v, label: `${v} chars` }))}
          onChange={(v) => {
            setPrecision(v);
            track("visual_interacted", { visual: VISUAL, control: "precision", value: v });
          }}
        />
        <Range
          label="Search radius"
          min={200}
          max={3000}
          step={100}
          value={radius}
          onChange={setRadius}
          display={fmtM(radius)}
          onCommit={(v) => track("visual_interacted", { visual: VISUAL, control: "radius", value: v })}
        />
      </div>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted">
        <input
          type="checkbox"
          checked={withNeighbours}
          onChange={(e) => {
            setWithNeighbours(e.target.checked);
            track("visual_interacted", { visual: VISUAL, control: "neighbours", value: e.target.checked });
          }}
          className="size-4 accent-accent"
        />
        Also scan the 8 neighbouring cells
      </label>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full cursor-crosshair touch-none rounded-xl border border-line bg-bg outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        role="application"
        aria-label={`Map. Rider in geohash cell ${own}. Use arrow keys to move the rider.`}
        tabIndex={0}
        onPointerDown={onPointer}
        onKeyDown={onKey}
      >
        {cells.map((c) => {
          const b = geohashBounds(c);
          const isOwn = c === own;
          return (
            <rect
              key={c}
              x={sx(b.minLon)}
              y={sy(b.maxLat)}
              width={sx(b.maxLon) - sx(b.minLon)}
              height={sy(b.minLat) - sy(b.maxLat)}
              fill="var(--accent)"
              fillOpacity={isOwn ? 0.16 : 0.07}
              stroke="var(--accent)"
              strokeOpacity={0.6}
              strokeWidth={isOwn ? 1.6 : 0.8}
            />
          );
        })}
        {vLines.map((x) => (
          <line key={`v${x}`} x1={x} x2={x} y1={0} y2={H} stroke="var(--border-strong)" strokeWidth={precision === 7 ? 0.4 : 0.8} />
        ))}
        {hLines.map((y) => (
          <line key={`h${y}`} x1={0} x2={W} y1={y} y2={y} stroke="var(--border-strong)" strokeWidth={precision === 7 ? 0.4 : 0.8} />
        ))}
        <ellipse cx={sx(rider.lon)} cy={sy(rider.lat)} rx={rx} ry={ry} fill="var(--info)" fillOpacity={0.06} stroke="var(--info)" strokeDasharray="4 3" />
        {DRIVERS.map((d) => {
          const found = result.found.has(d.id);
          const missed = result.missed.has(d.id);
          const cand = result.candidates.has(d.id);
          return (
            <circle
              key={d.id}
              cx={sx(d.lon)}
              cy={sy(d.lat)}
              r={found || missed ? 4 : 2.6}
              fill={found ? "var(--ok)" : missed ? "var(--err)" : cand ? "var(--fg-muted)" : "var(--fg-subtle)"}
              fillOpacity={found || missed || cand ? 1 : 0.5}
              stroke={missed ? "var(--surface)" : undefined}
            />
          );
        })}
        <g transform={`translate(${sx(rider.lon)} ${sy(rider.lat)})`}>
          <circle r={8} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2.5} />
          <rect x={10} y={-26} width={own.length * 8 + 12} height={18} rx={5} fill="var(--surface)" stroke="var(--accent)" />
          <text x={16} y={-13} fontSize={11.5} fontWeight={600} fill="var(--accent)" fontFamily="var(--font-geist-mono)">
            {own}
          </text>
        </g>
      </svg>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-subtle">
        <span><span className="text-ok">●</span> found</span>
        <span><span className="text-err">●</span> within radius but missed</span>
        <span><span className="text-muted">●</span> scanned, too far</span>
        <span>· cell ≈ {fmtM(cellW)} × {fmtM(cellH)}</span>
      </p>

      {tooSmall && (
        <p className={cn("mt-3 rounded-lg border px-3 py-2 text-[13px]", "border-warn/30 bg-warn/10 text-warn")} role="status">
          The radius ({fmtM(radius)}) is bigger than a cell, so 9 cells cannot cover the circle. Use a shorter geohash (bigger cells) for this radius.
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Cells scanned" value={cells.length} sub={`prefix ${own}…`} />
        <Stat label="Drivers checked" value={result.candidates.size} sub={`of ${DRIVERS.length} in the city`} />
        <Stat label="Found" value={result.found.size} tone="ok" sub={`${result.truth} really within ${fmtM(radius)}`} />
        <Stat label="Missed" value={result.missed.size} tone={result.missed.size ? "err" : "ok"} />
      </div>
    </VisualFrame>
  );
}
