"use client";

import { useEffect, useRef, useState } from "react";
import { Repeat, RotateCcw, UserPlus } from "lucide-react";
import { useTheme } from "@/components/site/theme-toggle";
import { trackVisual } from "@/lib/analytics";
import { formatNumber } from "@/lib/utils";
import { Range, SimButton, Stat, VisualFrame, pct } from "./algo-kit";
import { hllAdd, hllBytes, hllEstimate, hllStdError } from "./hll-core";

/**
 * Stream unique visitor IDs into a real HyperLogLog. Each ID is hashed; the
 * first p bits pick a register, and the register keeps the longest run of
 * leading zeros seen in the rest. Returning visitors change nothing.
 */

const VISUAL = "hyperloglog-sim";
const MAX_TOTAL = 1_000_000;
const START_N = 2000;

type State = { p: number; regs: Uint8Array; n: number; history: { n: number; est: number }[]; lastId: string | null };

function fill(p: number, n: number): Uint8Array {
  const regs = new Uint8Array(2 ** p);
  for (let i = 0; i < n; i++) hllAdd(regs, p, `visitor-${i}`);
  return regs;
}

function initial(): State {
  const regs = fill(10, START_N);
  return { p: 10, regs, n: START_N, history: [{ n: START_N, est: hllEstimate(regs) }], lastId: null };
}

const fmtBytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} KB` : `${Math.round(b)} B`);

function RegisterGrid({ regs, p }: { regs: Uint8Array; p: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const m = regs.length;
    const cols = 2 ** Math.ceil(p / 2);
    const rows = m / cols;
    const size = 320;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = (size * rows) / cols * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const css = getComputedStyle(c);
    const accent = css.getPropertyValue("--accent").trim() || "#f76b15";
    const empty = css.getPropertyValue("--surface-3").trim() || "#222";
    const cell = (size / cols) * dpr;
    const gap = cols <= 32 ? Math.max(1, cell * 0.08) : 0;
    let max = 1;
    for (const r of regs) max = Math.max(max, r);
    ctx.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < m; i++) {
      const x = (i % cols) * cell;
      const y = Math.floor(i / cols) * cell;
      const r = regs[i];
      ctx.globalAlpha = 1;
      ctx.fillStyle = empty;
      ctx.fillRect(x + gap / 2, y + gap / 2, cell - gap, cell - gap);
      if (r > 0) {
        ctx.globalAlpha = 0.15 + 0.85 * (r / max);
        ctx.fillStyle = accent;
        ctx.fillRect(x + gap / 2, y + gap / 2, cell - gap, cell - gap);
      }
      if (cols <= 16 && r > 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = css.getPropertyValue("--fg").trim() || "#fff";
        ctx.font = `${cell * 0.38}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(r), x + cell / 2, y + cell / 2);
      }
    }
  }, [regs, p, theme]);
  return <canvas ref={ref} className="block h-auto w-full rounded-lg" role="img" aria-label={`${regs.length} registers; brighter means a longer run of leading zeros`} />;
}

export function HyperLogLogSim() {
  const [s, setS] = useState<State>(initial);
  const m = 2 ** s.p;
  const est = hllEstimate(s.regs);
  const err = s.n ? est / s.n - 1 : 0;
  const se = hllStdError(s.p);
  const full = s.n >= MAX_TOTAL;

  function addNew(count: number) {
    const k = Math.min(count, MAX_TOTAL - s.n);
    if (k <= 0) return;
    const regs = s.regs.slice();
    for (let i = s.n; i < s.n + k; i++) hllAdd(regs, s.p, `visitor-${i}`);
    const n = s.n + k;
    setS({ ...s, regs, n, history: [...s.history, { n, est: hllEstimate(regs) }].slice(-40), lastId: `visitor-${n - 1}` });
    trackVisual(VISUAL);
  }

  function replay(count: number) {
    if (!s.n) return;
    const regs = s.regs.slice();
    for (let i = 0; i < count; i++) hllAdd(regs, s.p, `visitor-${Math.floor(Math.random() * s.n)}`);
    setS({ ...s, regs, history: [...s.history, { n: s.n, est: hllEstimate(regs) }].slice(-40) });
    trackVisual(VISUAL);
  }

  function setP(p: number) {
    const regs = fill(p, s.n);
    setS({ p, regs, n: s.n, history: [{ n: s.n, est: hllEstimate(regs) }], lastId: s.lastId });
  }

  // history chart: error % per step with the ±1 standard error band
  const W = 300;
  const H = 120;
  const lim = Math.max(se * 3, ...s.history.map((h) => Math.abs(h.est / h.n - 1))) * 1.1;
  const px = (i: number) => 30 + (i / Math.max(s.history.length - 1, 1)) * (W - 40);
  const py = (e: number) => H / 2 - (e / lim) * (H / 2 - 10);
  const line = s.history.map((h, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(h.est / h.n - 1).toFixed(1)}`).join(" ");

  return (
    <VisualFrame
      eyebrow="Simulation · HyperLogLog"
      title="Counting unique visitors to an event page"
      caption="Each visitor ID is hashed. The first p bits choose a register; the register remembers the longest run of leading zeros it has seen. Brighter cells hold longer runs. Duplicates hash the same way, so they can never move the count."
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Range
            label="Precision p"
            min={4}
            max={14}
            value={s.p}
            onChange={setP}
            display={`p = ${s.p} · ${formatNumber(m)} registers`}
            onCommit={() => trackVisual(VISUAL)}
          />
          <div className="mt-3">
            <RegisterGrid regs={s.regs} p={s.p} />
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <SimButton primary onClick={() => addNew(1000)} disabled={full}>
              <UserPlus className="size-3.5" /> +1,000
            </SimButton>
            <SimButton onClick={() => addNew(10_000)} disabled={full}>
              +10,000
            </SimButton>
            <SimButton onClick={() => addNew(100_000)} disabled={full}>
              +100,000
            </SimButton>
            <SimButton onClick={() => replay(10_000)} disabled={!s.n}>
              <Repeat className="size-3.5" /> 10,000 returning
            </SimButton>
            <SimButton
              onClick={() => {
                setS(initial());
                trackVisual(VISUAL);
              }}
            >
              <RotateCcw className="size-3.5" />
              <span className="sr-only">Reset</span>
            </SimButton>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="True uniques" value={formatNumber(s.n)} />
            <Stat label="HLL estimate" value={formatNumber(Math.round(est))} tone="accent" />
            <Stat label="Error" value={`${err >= 0 ? "+" : ""}${pct(err)}`} tone={Math.abs(err) > 2 * se ? "err" : Math.abs(err) > se ? "warn" : "ok"} sub={`typical: ±${pct(se)}`} />
            <Stat label="Memory" value={fmtBytes(hllBytes(s.p))} tone="ok" sub={`exact set: ${fmtBytes(s.n * 8)}`} />
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-auto w-full" role="img" aria-label="Estimate error after each step">
            <rect x={30} y={py(se)} width={W - 40} height={py(-se) - py(se)} fill="var(--ok)" fillOpacity={0.08} />
            <line x1={30} x2={W - 10} y1={py(0)} y2={py(0)} stroke="var(--border-strong)" />
            <text x={26} y={py(se) + 3} fontSize={9} textAnchor="end" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
              +{(se * 100).toFixed(1)}%
            </text>
            <text x={26} y={py(-se) + 3} fontSize={9} textAnchor="end" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
              −{(se * 100).toFixed(1)}%
            </text>
            <path d={line} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
            {s.history.map((h, i) => (
              <circle key={i} cx={px(i)} cy={py(h.est / h.n - 1)} r={2.4} fill="var(--accent)" />
            ))}
          </svg>
          <p className="text-[11.5px] text-subtle">Error after each step. Green band: one standard error, 1.04 ⁄ √m.</p>
        </div>
      </div>
    </VisualFrame>
  );
}
