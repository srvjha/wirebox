"use client";

import { useState } from "react";
import { TIMELINE, type FlowTimeline, type Timeline } from "@/sim";

const W = 360;
const H = 132;
const PAD = { l: 30, r: 8, t: 12, b: 22 };

/**
 * Success rate per simulated second. One series, so bars carry status color
 * (healthy vs failing) plus a hover tooltip; the incident and recovery are
 * marked on the axis.
 */
export function TimelineChart({ timeline, incident }: { timeline: Timeline; incident: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const frames = timeline.frames;
  const n = frames.length;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = iw / n;
  // Most interesting detail lives near 100%; floor at 0 so collapses read honestly.
  const y = (v: number) => PAD.t + ih * (1 - v);
  const recoveredAt = timeline.recovery === null ? null : TIMELINE.at + timeline.recovery;
  const h = hover === null ? null : frames[hover];

  return (
    <figure className="rounded-xl border border-line bg-surface-2 p-3">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-fg">Requests served, each second</span>
        <span className="font-mono text-[10.5px] text-subtle">30 s simulated</span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Success rate per second. ${incident}`}>
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === 0 ? undefined : "2 3"} />
              <text x={PAD.l - 5} y={y(v) + 3.5} textAnchor="end" fontSize={9.5} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
                {v * 100}%
              </text>
            </g>
          ))}
          {frames.map((f, i) => {
            const bad = f.success < TIMELINE.healthy;
            const top = y(Math.max(0, f.success));
            return (
              <g key={f.t} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={PAD.l + i * bw} y={PAD.t} width={bw} height={ih} fill="transparent" />
                <rect
                  x={PAD.l + i * bw + 1}
                  y={top}
                  width={Math.max(1, bw - 2)}
                  height={Math.max(1, y(0) - top)}
                  rx={2}
                  fill={bad ? "var(--err)" : "var(--ok)"}
                  opacity={hover === null || hover === i ? 0.9 : 0.45}
                />
              </g>
            );
          })}
          <line x1={PAD.l + TIMELINE.at * bw} x2={PAD.l + TIMELINE.at * bw} y1={PAD.t - 6} y2={y(0)} stroke="var(--warn)" strokeWidth={1.5} strokeDasharray="3 2" />
          <text x={PAD.l + TIMELINE.at * bw + 3} y={PAD.t - 2} fontSize={9.5} fill="var(--warn)" fontFamily="var(--font-geist-mono)">
            incident
          </text>
          {recoveredAt !== null && recoveredAt > TIMELINE.at && recoveredAt < n && (
            <>
              <line x1={PAD.l + recoveredAt * bw} x2={PAD.l + recoveredAt * bw} y1={PAD.t - 6} y2={y(0)} stroke="var(--ok)" strokeWidth={1.5} strokeDasharray="3 2" />
              <text x={PAD.l + recoveredAt * bw + 3} y={PAD.t + 8} fontSize={9.5} fill="var(--ok)" fontFamily="var(--font-geist-mono)">
                recovered
              </text>
            </>
          )}
          {[0, 10, 20, 29].map((t) => (
            <text key={t} x={PAD.l + t * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={9.5} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
              {t}s
            </text>
          ))}
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface px-2 py-1 font-mono text-[10.5px] text-fg shadow-card"
            style={{ left: `${((PAD.l + hover * bw + bw / 2) / W) * 100}%`, transform: "translateX(-50%)" }}
          >
            t={h.t}s · {(h.success * 100).toFixed(1)}% · p99 {h.p99 >= 2000 ? "timeout" : `${h.p99} ms`}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11.5px] text-muted">
        {incident}{" "}
        {timeline.recovery === null
          ? "It never got back to 99%."
          : timeline.recovery === 0
            ? "No second dropped below 99%."
            : `Back above 99% after ${timeline.recovery} s.`}
      </p>
    </figure>
  );
}

/** Seconds of work waiting in the worst queue, each simulated second. */
export function QueueLagChart({ timeline }: { timeline: FlowTimeline }) {
  const frames = timeline.frames;
  const n = frames.length;
  const max = Math.max(1, ...frames.map((f) => f.queueLag));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = iw / n;
  const y = (v: number) => PAD.t + ih * (1 - v / max);
  return (
    <figure className="rounded-xl border border-line bg-surface-2 p-3">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-fg">Background work waiting, each second</span>
        <span className="font-mono text-[10.5px] text-subtle">peak {Math.round(timeline.worstQueueLag)} s</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Queue wait per second, peaking at ${Math.round(timeline.worstQueueLag)} seconds`}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v * max)} y2={y(v * max)} stroke="var(--border)" strokeDasharray={v === 0 ? undefined : "2 3"} />
            <text x={PAD.l - 5} y={y(v * max) + 3.5} textAnchor="end" fontSize={9.5} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
              {Math.round(v * max)}s
            </text>
          </g>
        ))}
        {frames.map((f, i) => (
          <rect key={f.t} x={PAD.l + i * bw + 1} y={y(f.queueLag)} width={Math.max(1, bw - 2)} height={Math.max(0, y(0) - y(f.queueLag))} rx={2} fill="var(--req)" opacity={0.85}>
            <title>{`t=${f.t}s · ${Math.round(f.queueLag)} s of work waiting`}</title>
          </rect>
        ))}
        <line x1={PAD.l + TIMELINE.at * bw} x2={PAD.l + TIMELINE.at * bw} y1={PAD.t - 6} y2={y(0)} stroke="var(--warn)" strokeWidth={1.5} strokeDasharray="3 2" />
        {[0, 10, 20, 29].map((t) => (
          <text key={t} x={PAD.l + t * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={9.5} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
            {t}s
          </text>
        ))}
      </svg>
    </figure>
  );
}
