"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Segmented, Stat, VisualCanvas, VisualShell, useVisualTracker } from "./visual-shell";

type Kind = "tumbling" | "sliding" | "session";
type Win = { start: number; end: number; count: number };

/** Event times (seconds into the sale) listed in the order they ARRIVE at the processor. */
const ARRIVALS = [3, 7, 12, 9, 18, 24, 15, 27, 31, 22, 38, 36, 45, 29, 52, 48, 58];
const SPAN = 80;
const SIZE = 20;
const HOP = 10;
const GAP = 8;

function windowsFor(kind: Kind, t: number): [number, number][] {
  if (kind === "tumbling") {
    const s = Math.floor(t / SIZE) * SIZE;
    return [[s, s + SIZE]];
  }
  if (kind === "sliding") {
    const s = Math.floor(t / HOP) * HOP;
    return [
      [s - HOP, s - HOP + SIZE],
      [s, s + SIZE],
    ];
  }
  return [[t, t + GAP]];
}

function simulate(kind: Kind, delay: number, n: number) {
  let maxT = -Infinity;
  const accepted: number[] = [];
  const late: number[] = [];
  const counts = new Map<string, Win>();
  for (let i = 0; i < n; i++) {
    const t = ARRIVALS[i];
    const wm = maxT - delay; // watermark before this event is seen
    const wins = windowsFor(kind, t);
    const open = wins.filter(([, e]) => e > wm);
    if (open.length === 0) {
      late.push(i);
    } else {
      accepted.push(i);
      if (kind !== "session") {
        for (const [s, e] of open) {
          const k = `${s}`;
          const w = counts.get(k) ?? { start: s, end: e, count: 0 };
          w.count++;
          counts.set(k, w);
        }
      }
    }
    maxT = Math.max(maxT, t);
  }
  let wins: Win[] = [...counts.values()].sort((a, b) => a.start - b.start);
  if (kind === "session") {
    wins = [];
    for (const t of accepted.map((i) => ARRIVALS[i]).sort((a, b) => a - b)) {
      const last = wins[wins.length - 1];
      if (last && t < last.end) {
        last.end = Math.max(last.end, t + GAP);
        last.count++;
      } else wins.push({ start: t, end: t + GAP, count: 1 });
    }
  }
  return { wins, accepted, late, watermark: n ? maxT - delay : 0, maxT: n ? maxT : 0 };
}

const X = (t: number) => 24 + (t / SPAN) * 592;

export function StreamWindows() {
  const track = useVisualTracker("stream-windows");
  const [kind, setKind] = useState<Kind>("tumbling");
  const [delay, setDelay] = useState(5);
  const [n, setN] = useState(ARRIVALS.length);

  const r = simulate(kind, delay, n);
  const rows = kind === "sliding" ? 2 : 1;
  const counted = r.wins.reduce((a, w) => a + w.count, 0);

  return (
    <VisualShell
      title="Windows, watermarks and late tickets"
      hint="Ticket sales arrive out of order. Pick a window type, set how long the watermark waits for stragglers, and drag the arrival slider to replay the stream."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Window type"
          value={kind}
          onChange={(v) => {
            track();
            setKind(v);
          }}
          options={[
            { value: "tumbling", label: "Tumbling 20s" },
            { value: "sliding", label: "Sliding 20s / 10s" },
            { value: "session", label: "Session, 8s gap" },
          ]}
        />
      </div>

      <div className="mt-3">
        <VisualCanvas w={640} h={150 + rows * 30} label="Timeline of events, windows and the watermark">
          <line x1={24} x2={616} y1={52} y2={52} stroke="var(--border-strong)" />
          {[0, 20, 40, 60, 80].map((t) => (
            <g key={t}>
              <line x1={X(t)} x2={X(t)} y1={48} y2={56} stroke="var(--border-strong)" />
              <text x={X(t)} y={70} fontSize={10} textAnchor="middle" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
                {t}s
              </text>
            </g>
          ))}
          <text x={24} y={16} fontSize={10} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
            EVENT TIME (when the sale happened)
          </text>
          {ARRIVALS.slice(0, n).map((t, i) => {
            const isLate = r.late.includes(i);
            return (
              <g key={i}>
                <circle cx={X(t)} cy={isLate ? 36 : 52} r={isLate ? 5 : 4.5} fill={isLate ? "var(--err)" : "var(--res)"} opacity={0.9} />
                {isLate && <line x1={X(t)} x2={X(t)} y1={41} y2={52} stroke="var(--err)" strokeDasharray="2 2" />}
              </g>
            );
          })}
          {r.wins.map((w, i) => {
            const y = 84 + (kind === "sliding" ? i % 2 : 0) * 30;
            const closed = r.watermark >= w.end;
            const x1 = X(w.start);
            const x2 = X(Math.min(w.end, SPAN));
            return (
              <g key={`${w.start}-${i}`}>
                <rect x={x1} y={y} width={Math.max(x2 - x1 - 2, 6)} height={22} rx={5} fill={closed ? "var(--ok)" : "var(--accent)"} opacity={closed ? 0.28 : 0.2} stroke={closed ? "var(--ok)" : "var(--accent)"} />
                <text x={x1 + 6} y={y + 15} fontSize={11} fontWeight={600} fill="var(--fg)" fontFamily="var(--font-geist-mono)">
                  {w.count}
                  {closed ? " ✓" : ""}
                </text>
              </g>
            );
          })}
          {n > 0 && r.watermark > 0 && (
            <g>
              <line x1={X(r.watermark)} x2={X(r.watermark)} y1={26} y2={84 + rows * 30} stroke="var(--info)" strokeWidth={1.5} strokeDasharray="4 3" />
              <text x={Math.min(X(r.watermark) + 4, 560)} y={92 + rows * 30} fontSize={10} fill="var(--info)" fontFamily="var(--font-geist-mono)">
                watermark {r.watermark}s
              </text>
            </g>
          )}
        </VisualCanvas>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="sw-delay" className="flex justify-between text-[12.5px] text-muted">
            <span>Watermark waits for stragglers</span>
            <span className="font-mono text-fg">{delay}s</span>
          </label>
          <input
            id="sw-delay"
            type="range"
            min={0}
            max={20}
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            onPointerUp={() => track()}
            onKeyUp={() => track()}
            className="mt-1 w-full accent-[var(--accent)]"
          />
        </div>
        <div>
          <label htmlFor="sw-n" className="flex justify-between text-[12.5px] text-muted">
            <span>Events arrived</span>
            <span className="font-mono text-fg">
              {n} / {ARRIVALS.length}
            </span>
          </label>
          <input
            id="sw-n"
            type="range"
            min={0}
            max={ARRIVALS.length}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            onPointerUp={() => track()}
            onKeyUp={() => track()}
            className="mt-1 w-full accent-[var(--accent)]"
          />
        </div>
      </div>

      <div className={cn("mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4")}>
        <Stat label="Windows" value={r.wins.length} />
        <Stat label="Counted" value={`${r.accepted.length} events`} tone="ok" />
        <Stat label="Dropped as late" value={r.late.length} tone={r.late.length ? "err" : undefined} />
        <Stat label="Closed windows" value={r.wins.filter((w) => r.watermark >= w.end).length} tone="info" />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-subtle">
        Green dots were counted; red dots arrived after their window had closed and were dropped. Turn the wait to 0 and nothing is dropped only if the data
        happens to be in order. Raise it and results arrive later but complete.
        {kind === "sliding" && ` One sale lands in two windows, so the counts add up to ${counted}, more than the ${r.accepted.length} events.`}
      </p>
    </VisualShell>
  );
}
