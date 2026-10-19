"use client";

import { useMemo, useState, type ReactNode } from "react";
import { RangeControl, Stat, VisualFrame, fmtCount, fmtMs, seeded } from "./scale-visual-parts";

const VISUAL = "polling-vs-push";
const WINDOW = 60; // seconds shown on the timeline
const LONG_POLL_TIMEOUT = 30; // seconds a long-poll request is held before an empty reply
const VIEWER_STEPS = [100, 500, 1_000, 5_000, 10_000, 20_000, 50_000];

const pct = (t: number) => `${(Math.min(Math.max(t, 0), WINDOW) / WINDOW) * 100}%`;

/** Seat-change times for one minute, from a seeded Poisson process. */
function updateTimes(perMinute: number) {
  const rand = seeded(17 + perMinute);
  const out: number[] = [];
  let t = 0;
  for (;;) {
    t += (-Math.log(1 - rand()) * 60) / perMinute;
    if (t >= WINDOW) break;
    out.push(t);
  }
  return out;
}

export function PollingVsPush() {
  const [viewerIdx, setViewerIdx] = useState(4);
  const [updates, setUpdates] = useState(6);
  const [interval, setIntervalS] = useState(2);
  const viewers = VIEWER_STEPS[viewerIdx];

  const changes = useMemo(() => updateTimes(updates), [updates]);

  const model = useMemo(() => {
    const lambda = updates / 60; // updates per second
    // Short polling: one request per client per interval.
    const shortRps = viewers / interval;
    const shortEmpty = Math.exp(-lambda * interval);
    const shortStale = (interval / 2) * 1000;
    // Long polling: a request lasts until the next update or the timeout.
    const cycle = (1 - Math.exp(-lambda * LONG_POLL_TIMEOUT)) / lambda;
    const longRps = viewers / cycle;
    const longEmpty = Math.exp(-lambda * LONG_POLL_TIMEOUT);
    // Push: one message per update per client, no requests.
    const pushMsgs = (viewers * updates) / 60;
    return { shortRps, shortEmpty, shortStale, longRps, longEmpty, pushMsgs };
  }, [viewers, updates, interval]);

  // One client's minute, drawn three ways.
  const lanes = useMemo(() => {
    const polls: { t: number; hit: boolean; from?: number }[] = [];
    let i = 0;
    for (let t = interval; t <= WINDOW; t += interval) {
      let first: number | undefined;
      while (i < changes.length && changes[i] <= t) {
        if (first === undefined) first = changes[i];
        i++;
      }
      polls.push({ t, hit: first !== undefined, from: first });
    }
    const holds: { start: number; end: number; hit: boolean }[] = [];
    let start = 0;
    let j = 0;
    while (start < WINDOW) {
      const next = changes[j];
      if (next !== undefined && next - start <= LONG_POLL_TIMEOUT) {
        holds.push({ start, end: next, hit: true });
        start = next + 0.15; // a round trip before the next request is waiting
        j++;
        while (j < changes.length && changes[j] < start) j++;
      } else {
        holds.push({ start, end: Math.min(start + LONG_POLL_TIMEOUT, WINDOW), hit: false });
        start += LONG_POLL_TIMEOUT + 0.15;
      }
    }
    return { polls, holds };
  }, [changes, interval]);

  const perClientShort = Math.floor(WINDOW / interval);
  const perClientLong = lanes.holds.length;

  return (
    <VisualFrame
      title="How much does “any change?” cost?"
      hint="One phone's minute on the seat map, three ways. Orange marks are seats being booked. Move the sliders and watch the server load below."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <RangeControl
          visual={VISUAL}
          control="viewers"
          label="Phones on the seat map"
          value={viewerIdx}
          min={0}
          max={VIEWER_STEPS.length - 1}
          onChange={setViewerIdx}
          format={(i) => VIEWER_STEPS[i].toLocaleString("en-US")}
        />
        <RangeControl
          visual={VISUAL}
          control="updates_per_minute"
          label="Seat changes per minute"
          value={updates}
          min={1}
          max={60}
          onChange={setUpdates}
        />
        <RangeControl
          visual={VISUAL}
          control="poll_interval"
          label="Poll interval"
          value={interval}
          min={1}
          max={15}
          onChange={setIntervalS}
          format={(v) => `${v} s`}
        />
      </div>

      <div className="mt-5 space-y-3">
        <Lane label="Seat changes" note={`${changes.length} this minute`}>
          {changes.map((t, k) => (
            <rect key={k} x={pct(t)} y="6" width="3" height="16" rx="1.5" fill="var(--accent)" transform="translate(-1.5 0)" />
          ))}
        </Lane>

        <Lane label="Short polling" note={`${perClientShort} requests, ${lanes.polls.filter((p) => !p.hit).length} empty`}>
          {lanes.polls.map((p, k) => (
            <g key={k}>
              {p.from !== undefined && (
                <line x1={pct(p.from)} x2={pct(p.t)} y1="14" y2="14" stroke="var(--warn)" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
              )}
              <line x1={pct(p.t)} x2={pct(p.t)} y1="5" y2="23" stroke={p.hit ? "var(--res)" : "var(--fg-subtle)"} strokeWidth={p.hit ? 2.2 : 1.2} />
            </g>
          ))}
        </Lane>

        <Lane label="Long polling" note={`${perClientLong} requests, ${lanes.holds.filter((h) => !h.hit).length} timed out`}>
          {lanes.holds.map((h, k) => (
            <g key={k}>
              <rect
                x={pct(h.start)}
                y="8"
                width={`${((Math.min(h.end, WINDOW) - h.start) / WINDOW) * 100}%`}
                height="12"
                rx="3"
                fill="var(--surface-3)"
                stroke="var(--border-strong)"
              />
              {h.hit && <circle cx={pct(h.end)} cy="14" r="4" fill="var(--res)" />}
            </g>
          ))}
        </Lane>

        <Lane label="Push (SSE / WebSocket)" note="1 connection, a message per change">
          <rect x="0" y="11" width="100%" height="6" rx="3" fill="var(--surface-3)" stroke="var(--border-strong)" />
          {changes.map((t, k) => (
            <circle key={k} cx={pct(t)} cy="14" r="4" fill="var(--res)" />
          ))}
        </Lane>
        <div className="flex justify-between pl-0 font-mono text-[10.5px] text-subtle sm:pl-[152px]">
          <span>0 s</span>
          <span>30 s</span>
          <span>60 s</span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-subtle">
        <Legend color="var(--res)">reply with news</Legend>
        <Legend color="var(--fg-subtle)">empty reply</Legend>
        <Legend color="var(--warn)">time the phone showed a stale map</Legend>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ModeCard title="Short polling">
          <Stat label="Requests / s" value={fmtCount(model.shortRps)} tone={model.shortRps > 5000 ? "err" : "default"} />
          <Stat label="Empty replies" value={`${Math.round(model.shortEmpty * 100)}%`} tone={model.shortEmpty > 0.5 ? "warn" : "default"} />
          <Stat label="Avg. staleness" value={fmtMs(model.shortStale)} tone={model.shortStale > 2000 ? "warn" : "default"} />
        </ModeCard>
        <ModeCard title="Long polling">
          <Stat label="Requests / s" value={fmtCount(model.longRps)} />
          <Stat label="Empty replies" value={`${Math.round(model.longEmpty * 100)}%`} />
          <Stat label="Held open" value={fmtCount(viewers)} sub="requests waiting" />
        </ModeCard>
        <ModeCard title="Push">
          <Stat label="Requests / s" value="0" tone="ok" sub="after connecting" />
          <Stat label="Messages / s" value={fmtCount(model.pushMsgs)} />
          <Stat label="Open connections" value={fmtCount(viewers)} />
        </ModeCard>
      </div>
    </VisualFrame>
  );
}

function Lane({ label, note, children }: { label: string; note: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3">
      <div className="flex items-baseline justify-between gap-2 sm:block">
        <p className="text-[12.5px] font-medium text-fg">{label}</p>
        <p className="font-mono text-[10.5px] text-subtle">{note}</p>
      </div>
      <svg className="block h-7 w-full overflow-visible rounded-md bg-surface-2" aria-hidden="true">
        {children}
      </svg>
    </div>
  );
}

function ModeCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-2.5">
      <p className="mb-2 px-0.5 font-mono text-[11px] tracking-wider text-muted uppercase">{title}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-1">{children}</div>
    </div>
  );
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block size-2.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}
