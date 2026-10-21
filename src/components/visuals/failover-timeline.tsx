"use client";

import { useState } from "react";
import { RotateCcw, Skull, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RangeField, Segmented, Stat, Toggle, VisualFrame, fmt, trackVisual, useInterval } from "./caching-scaling-ui";

const VISUAL = "failover-timeline";
const WRITES_PER_S = 100;
const PROMOTE_S = 5; // replica becomes primary
const REPOINT_S = 3; // apps and proxies learn the new address
const HUMAN_S = 120; // a person is paged, wakes up, logs in

type Cfg = { auto: boolean; detect: number; lagMs: number; sync: boolean; fencing: boolean };

export function FailoverTimeline() {
  const [cfg, setCfg] = useState<Cfg>({ auto: true, detect: 10, lagMs: 500, sync: false, fencing: true });
  const [t, setT] = useState<number | null>(null); // seconds since the primary died
  const [returnedAt, setReturnedAt] = useState<number | null>(null);

  const detectAt = cfg.auto ? cfg.detect : HUMAN_S;
  const promotedAt = detectAt + PROMOTE_S;
  const backAt = promotedAt + REPOINT_S;
  const dead = t !== null;
  const now = t ?? 0;

  useInterval(() => setT((x) => (x === null || x > backAt + 8 ? x : x + 1)), 150, dead);

  const phase = !dead ? "healthy" : now < detectAt ? "undetected" : now < promotedAt ? "promoting" : now < backAt ? "repointing" : "recovered";
  const failedWrites = Math.min(now, backAt) * WRITES_PER_S;
  const lost = cfg.sync ? 0 : Math.round((WRITES_PER_S * cfg.lagMs) / 1000);
  const splitBrain = returnedAt !== null && !cfg.fencing && returnedAt >= promotedAt;
  const total = backAt + 8;

  const segs = [
    { label: "Primary dead, nobody knows", len: detectAt, cls: "bg-err" },
    { label: "Promote replica", len: PROMOTE_S, cls: "bg-warn" },
    { label: "Repoint apps", len: REPOINT_S, cls: "bg-info" },
    { label: "Normal again", len: 8, cls: "bg-ok" },
  ];

  function set(p: Partial<Cfg>) {
    setCfg((c) => ({ ...c, ...p }));
    trackVisual(VISUAL);
  }

  return (
    <VisualFrame
      title="The primary dies"
      hint="One primary, one replica, 100 writes per second. Kill the primary and follow the clock. One simulated second takes about 0.15 s."
      caption="Downtime is the sum of detection, promotion and repointing. Data loss depends on whether the replica had every write when the primary died."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Segmented
          label="Who decides"
          value={cfg.auto ? "auto" : "human"}
          options={[
            { value: "auto", label: "Automatic" },
            { value: "human", label: "On-call human" },
          ]}
          onChange={(v) => set({ auto: v === "auto" })}
        />
        <Segmented
          label="Failure detected after"
          value={String(cfg.detect)}
          options={[3, 10, 30].map((v) => ({ value: String(v), label: `${v} s` }))}
          onChange={(v) => set({ detect: Number(v) })}
        />
        <Toggle
          label="Synchronous replication"
          description="Primary waits for the replica before confirming a write."
          checked={cfg.sync}
          onChange={(v) => set({ sync: v })}
        />
        <RangeField
          label="Replica lag when it died"
          value={cfg.lagMs}
          min={0}
          max={2000}
          step={100}
          onChange={(v) => setCfg((c) => ({ ...c, lagMs: v }))}
          onCommit={() => trackVisual(VISUAL)}
          format={(v) => (cfg.sync ? "0 ms (sync)" : `${v} ms`)}
        />
        <Toggle
          label="Fence the old primary"
          description="Cut it off so it can't accept writes if it comes back."
          checked={cfg.fencing}
          onChange={(v) => set({ fencing: v })}
        />
      </div>

      <div className="mt-4">
        <div className="relative">
          <div className="flex h-5 overflow-hidden rounded-md border border-line">
            {segs.map((s, i) => {
              const start = segs.slice(0, i).reduce((a, x) => a + x.len, 0);
              const filled = dead ? Math.max(0, Math.min(s.len, now - start)) / s.len : 0;
              return (
                <div key={s.label} className="relative h-full bg-surface-3" style={{ width: `${(s.len / total) * 100}%` }}>
                  <div className={cn("h-full", s.cls)} style={{ width: `${filled * 100}%` }} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
          {segs.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", s.cls)} /> {s.label} ({s.len} s)
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Phase" value={phase === "healthy" ? "healthy" : phase} tone={phase === "healthy" || phase === "recovered" ? "ok" : "err"} />
        <Stat label="Clock" value={dead ? `${Math.min(now, backAt)} s` : "–"} sub={dead ? `outage lasts ${backAt} s` : `would last ${backAt} s`} />
        <Stat label="Writes rejected" value={fmt(failedWrites)} tone={failedWrites ? "err" : "ok"} sub="apps got errors" />
        <Stat
          label="Writes lost"
          value={dead && now >= promotedAt ? fmt(lost) : "–"}
          tone={lost ? "err" : "ok"}
          sub={cfg.sync ? "replica had them all" : "confirmed, never reached replica"}
        />
      </div>

      {splitBrain && (
        <p className="mt-3 rounded-xl border border-err/40 bg-bg px-3 py-2 text-[12.5px] text-err">
          Split brain. The old primary came back, still believes it is the leader, and two databases are now accepting writes that disagree.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={dead}
          onClick={() => {
            setT(0);
            setReturnedAt(null);
            trackVisual(VISUAL);
          }}
        >
          <Skull className="size-3.5" /> Kill the primary
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!dead || returnedAt !== null || now < promotedAt}
          onClick={() => {
            setReturnedAt(now);
            trackVisual(VISUAL);
          }}
        >
          <Undo2 className="size-3.5" /> Old primary comes back
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setT(null);
            setReturnedAt(null);
            trackVisual(VISUAL);
          }}
        >
          <RotateCcw className="size-3.5" /> Reset
        </Button>
      </div>
    </VisualFrame>
  );
}
