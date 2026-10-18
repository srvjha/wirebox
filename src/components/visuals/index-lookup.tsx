"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Slider, VisualFrame, compact, duration } from "./foundations-kit";

/** Rows a sequential scan checks per second (in memory, simple filter). */
const SCAN_ROWS_PER_SEC = 10_000_000;
/** Keys per B-tree page. Real Postgres pages hold a few hundred. */
const FANOUT = 250;
/** One page visit, mostly cached. */
const PAGE_NS = 25_000;

const CELLS = 96;
const TARGET = 83;
const SCAN_MS = 2600;

function depth(rows: number) {
  return Math.max(1, Math.ceil(Math.log(rows) / Math.log(FANOUT)));
}

/** Full table scan vs B-tree lookup as the table grows from 1K to 100M rows. */
export function IndexLookup() {
  const [log, setLog] = useState(6);
  const [t, setT] = useState(0); // 0..1 animation progress (scan); index finishes at 0.15
  const [running, setRunning] = useState(false);
  const raf = useRef(0);

  const rows = Math.round(10 ** log);
  const levels = depth(rows);
  const scanNs = (rows / SCAN_ROWS_PER_SEC) * 1e9;
  const indexNs = (levels + 1) * PAGE_NS;
  const ratio = scanNs / indexNs;

  useEffect(() => {
    if (!running) return;
    const began = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - began) / SCAN_MS);
      setT(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setRunning(false);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [running]);

  const run = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setT(reduce ? 1 : 0);
    setRunning(!reduce);
    track("visual_interacted", { visual: "index-lookup", control: "run", value: rows });
  };

  const scanned = Math.min(TARGET + 1, Math.floor((t * CELLS * 1.1) / 1)); // rows checked so far
  const scanDone = scanned > TARGET;
  const indexStep = Math.min(4, Math.floor((t / 0.16) * 4)); // 0..4: root, branch, leaf, row
  const maxNs = Math.max(scanNs, indexNs);

  return (
    <VisualFrame
      title="Find one student's tickets"
      caption="Drag the table size, then run the query. The scan checks rows one by one until it finds a match (and must keep going, since there could be more). The index walks a few pages down a tree."
    >
      <pre className="overflow-x-auto rounded-xl border border-line bg-sunken px-3 py-2 font-mono text-[12px] text-fg">
        SELECT * FROM tickets WHERE user_id = 7;
      </pre>

      <div className="mt-4">
        <Slider
          label="Rows in tickets"
          value={log}
          min={3}
          max={8}
          step={0.1}
          display={compact(rows)}
          onChange={(v) => {
            setLog(v);
            setT(0);
            setRunning(false);
          }}
          onCommit={(v) => track("visual_interacted", { visual: "index-lookup", control: "rows", value: Math.round(10 ** v) })}
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-bg p-3">
          <p className="flex items-baseline justify-between text-[13px]">
            <span className="font-medium text-fg">Full table scan</span>
            <span className="font-mono text-[11px] text-subtle">no index</span>
          </p>
          <div className="mt-3 grid grid-cols-12 gap-[3px]" aria-hidden>
            {Array.from({ length: CELLS }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "aspect-square rounded-[3px] transition-colors duration-100",
                  i === TARGET && scanDone
                    ? "bg-ok"
                    : i < scanned
                      ? "bg-err/45"
                      : i === scanned && running
                        ? "bg-accent"
                        : "bg-surface-3",
                )}
              />
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <div>
              <dt className="text-subtle">Rows checked</dt>
              <dd className="font-mono text-[15px] font-semibold text-fg tabular-nums">{compact(rows)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Time</dt>
              <dd className="font-mono text-[15px] font-semibold text-err tabular-nums">{duration(scanNs)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-line bg-bg p-3">
          <p className="flex items-baseline justify-between text-[13px]">
            <span className="font-medium text-fg">B-tree index</span>
            <span className="font-mono text-[11px] text-subtle">on user_id</span>
          </p>
          <svg viewBox="0 0 240 128" className="mt-2 block h-auto w-full" aria-hidden>
            {[60, 120, 180].map((x, i) => (
              <line key={x} x1={120} y1={22} x2={x} y2={58} stroke={i === 2 && indexStep >= 1 ? "var(--accent)" : "var(--border-strong)"} strokeWidth={i === 2 && indexStep >= 1 ? 2 : 1} />
            ))}
            {[156, 180, 204].map((x, i) => (
              <line key={x} x1={180} y1={66} x2={x} y2={98} stroke={i === 0 && indexStep >= 2 ? "var(--accent)" : "var(--border-strong)"} strokeWidth={i === 0 && indexStep >= 2 ? 2 : 1} />
            ))}
            <rect x={96} y={8} width={48} height={16} rx={4} fill={indexStep >= 0 && t > 0 ? "var(--accent-soft)" : "var(--surface-2)"} stroke={t > 0 ? "var(--accent)" : "var(--border-strong)"} />
            <text x={120} y={19.5} textAnchor="middle" fontSize={8} fill="var(--fg-muted)" fontFamily="var(--font-geist-mono)">root</text>
            {[60, 120, 180].map((x, i) => (
              <rect key={x} x={x - 20} y={52} width={40} height={14} rx={4} fill={i === 2 && indexStep >= 1 ? "var(--accent-soft)" : "var(--surface-2)"} stroke={i === 2 && indexStep >= 1 ? "var(--accent)" : "var(--border-strong)"} />
            ))}
            {[156, 180, 204].map((x, i) => (
              <rect key={x} x={x - 10} y={96} width={20} height={12} rx={3} fill={i === 0 && indexStep >= 2 ? "var(--accent-soft)" : "var(--surface-2)"} stroke={i === 0 && indexStep >= 2 ? "var(--accent)" : "var(--border-strong)"} />
            ))}
            <line x1={156} y1={108} x2={156} y2={118} stroke={indexStep >= 3 ? "var(--ok)" : "transparent"} strokeWidth={2} />
            <circle cx={156} cy={121} r={4} fill={indexStep >= 3 ? "var(--ok)" : "var(--surface-3)"} />
            <text x={12} y={63} fontSize={8} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">{levels} level{levels > 1 ? "s" : ""}</text>
          </svg>
          <dl className="mt-1 grid grid-cols-2 gap-2 text-[12px]">
            <div>
              <dt className="text-subtle">Pages read</dt>
              <dd className="font-mono text-[15px] font-semibold text-fg tabular-nums">{levels + 1}</dd>
            </div>
            <div>
              <dt className="text-subtle">Time</dt>
              <dd className="font-mono text-[15px] font-semibold text-ok tabular-nums">{duration(indexNs)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-4 space-y-1.5" aria-hidden>
        {[
          { label: "Scan", ns: scanNs, cls: "bg-err/60" },
          { label: "Index", ns: indexNs, cls: "bg-ok/70" },
        ].map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-[11.5px]">
            <span className="w-10 text-subtle">{b.label}</span>
            <div className="h-2 flex-1 rounded-full bg-surface-3">
              <div className={cn("h-full rounded-full", b.cls)} style={{ width: `max(3px, ${(b.ns / maxNs) * 100}%)` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 text-[13px] text-fg hover:bg-surface-3 disabled:opacity-60"
        >
          {t === 1 ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
          {t === 1 ? "Run again" : "Run the query"}
        </button>
        <p className="text-[13px] text-muted" aria-live="polite">
          At {compact(rows)} rows the index is{" "}
          <span className="font-semibold text-fg">{ratio < 2 ? "about as fast" : `${compact(ratio, 0)}× faster`}</span>
          {ratio < 2 ? ": with tiny tables, scanning is fine." : "."}
        </p>
      </div>
    </VisualFrame>
  );
}
