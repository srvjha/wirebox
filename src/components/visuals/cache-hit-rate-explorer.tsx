"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Meter, RangeField, Stat, VisualFrame, fmt, fmtMs, trackVisual } from "./caching-scaling-ui";

const VISUAL = "cache-hit-rate-explorer";
const PAGES = 5000; // distinct event, artist and venue pages
const RPS = 20_000; // page reads per second during the announcement
const DB_CAPACITY = 4_000; // queries per second before the database saturates
const DB_BASE_MS = 25; // one event-page query on an idle database
const CACHE_MS = 1; // one round trip to the cache
const KB_PER_PAGE = 8;

const SIZES = [0, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const SKEWS = [
  { s: 0.6, label: "Flat", note: "Interest spread evenly, like a catalogue nobody is excited about." },
  { s: 0.8, label: "Mild", note: "Some favourites, a long tail of everything else." },
  { s: 1.0, label: "Typical", note: "The classic power law most real traffic follows." },
  { s: 1.2, label: "Announcement", note: "One band just announced. Everyone wants the same few pages." },
];

/** Cumulative share of requests that land on the top k pages, for a Zipf(s) distribution. */
function cumulative(s: number) {
  const out = new Float64Array(PAGES + 1);
  let acc = 0;
  for (let i = 1; i <= PAGES; i++) {
    acc += Math.pow(i, -s);
    out[i] = acc;
  }
  for (let i = 1; i <= PAGES; i++) out[i] /= acc;
  return out;
}

const W = 420;
const H = 190;
const PAD = { l: 40, r: 12, t: 14, b: 34 };
const xOf = (k: number) => PAD.l + (Math.log10(Math.max(1, k)) / Math.log10(PAGES)) * (W - PAD.l - PAD.r);
const yOf = (share: number) => PAD.t + (1 - share) * (H - PAD.t - PAD.b);

export function CacheHitRateExplorer() {
  const [sizeIdx, setSizeIdx] = useState(5);
  const [skewIdx, setSkewIdx] = useState(2);
  const size = SIZES[sizeIdx];
  const skew = SKEWS[skewIdx];
  const cum = useMemo(() => cumulative(skew.s), [skew.s]);

  const hit = size === 0 ? 0 : cum[size];
  const dbQps = RPS * (1 - hit);
  const rho = dbQps / DB_CAPACITY;
  const overloaded = rho >= 0.97;
  const dbMs = overloaded ? Infinity : DB_BASE_MS / (1 - rho);
  const avgMs = hit * CACHE_MS + (1 - hit) * (CACHE_MS + dbMs);
  const memory = size * KB_PER_PAGE;

  const path = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 80; i++) {
      const k = Math.round(Math.pow(PAGES, i / 80));
      pts.push(`${i ? "L" : "M"}${xOf(k).toFixed(1)} ${yOf(cum[k]).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [cum]);

  const markerX = xOf(Math.max(1, size));
  const markerY = yOf(hit);

  return (
    <VisualFrame
      title="Cache hit-rate explorer"
      hint="Gatepass serves 20,000 page reads a second across 5,000 pages. Choose how many pages the cache holds and how skewed the traffic is."
      caption="The curve is the share of all requests that land on the most popular k pages. Where your cache size meets it is your hit rate. The database only sees the misses."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <RangeField
          label="Cache holds"
          value={sizeIdx}
          min={0}
          max={SIZES.length - 1}
          onChange={setSizeIdx}
          onCommit={() => trackVisual(VISUAL)}
          format={(v) => `${fmt(SIZES[v])} pages · ${SIZES[v] * KB_PER_PAGE >= 1000 ? `${fmt((SIZES[v] * KB_PER_PAGE) / 1000, 1)} MB` : `${SIZES[v] * KB_PER_PAGE} KB`}`}
        />
        <RangeField
          label="Traffic skew"
          value={skewIdx}
          min={0}
          max={SKEWS.length - 1}
          onChange={setSkewIdx}
          onCommit={() => trackVisual(VISUAL)}
          format={(v) => SKEWS[v].label}
        />
      </div>
      <p className="mt-2 text-[12.5px] text-subtle">{skew.note}</p>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-auto w-full" role="img" aria-label={`Hit rate ${Math.round(hit * 100)} percent with ${size} pages cached`}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(g)} y2={yOf(g)} stroke="var(--border)" strokeDasharray={g === 0 ? undefined : "3 4"} />
            <text x={PAD.l - 6} y={yOf(g) + 4} fontSize={11} textAnchor="end" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
              {g * 100}%
            </text>
          </g>
        ))}
        {[1, 10, 100, 1000, 5000].map((k) => (
          <text key={k} x={xOf(k)} y={H - PAD.b + 16} fontSize={11} textAnchor="middle" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
            {k >= 1000 ? `${k / 1000}k` : k}
          </text>
        ))}
        <text x={(W + PAD.l) / 2} y={H - 3} fontSize={11} textAnchor="middle" fill="var(--fg-subtle)">
          top k pages (log scale)
        </text>
        {size > 0 && (
          <rect x={PAD.l} y={PAD.t} width={markerX - PAD.l} height={H - PAD.t - PAD.b} fill="var(--accent-soft)" />
        )}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {size > 0 && (
          <g>
            <line x1={markerX} x2={markerX} y1={PAD.t} y2={H - PAD.b} stroke="var(--accent)" strokeDasharray="3 3" />
            <circle cx={markerX} cy={markerY} r={5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
            <text
              x={markerX + (markerX > W - 90 ? -9 : 9)}
              y={markerY + (markerY < PAD.t + 20 ? 18 : -8)}
              fontSize={12}
              fontWeight={600}
              textAnchor={markerX > W - 90 ? "end" : "start"}
              fill="var(--fg)"
            >
              {Math.round(hit * 1000) / 10}% hits
            </text>
          </g>
        )}
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Hit rate" value={`${fmt(hit * 100, 1)}%`} tone={hit > 0.8 ? "ok" : hit > 0.5 ? "warn" : "err"} />
        <Stat label="DB queries/s" value={fmt(dbQps)} sub={`limit ${fmt(DB_CAPACITY)}`} tone={overloaded ? "err" : rho > 0.8 ? "warn" : "default"} />
        <Stat label="Avg page read" value={overloaded ? "timeouts" : fmtMs(avgMs)} tone={overloaded ? "err" : avgMs > 50 ? "warn" : "ok"} />
        <Stat label="Cache memory" value={memory >= 1000 ? `${fmt(memory / 1000, 1)} MB` : `${memory} KB`} sub={`${fmt((size / PAGES) * 100, 1)}% of pages`} />
      </div>
      <Meter className="mt-3" value={rho} label="Database load" />
      <p className={cn("mt-2 text-[12.5px]", overloaded ? "text-err" : "text-subtle")}>
        {overloaded
          ? "The misses alone are more than the database can answer. Queues build, requests time out, and the cache's hits can't save the page."
          : rho > 0.8
            ? "The database is close to full. Queueing makes every miss slower, so a small drop in hit rate hurts a lot."
            : "Comfortable. Most reads never reach the database."}
      </p>
    </VisualFrame>
  );
}
