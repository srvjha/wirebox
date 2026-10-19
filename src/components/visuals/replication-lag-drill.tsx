"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw, Ticket, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RangeField, Segmented, Stat, VisualFrame, trackVisual, useInterval } from "./caching-scaling-ui";

const VISUAL = "replication-lag-drill";
const STEP = 100; // ms of simulated time per tick
const PRIMARY_WINDOW = 3000;
const CACHE_TTL = 10000;

type Mode = "none" | "window" | "cache" | "position";
type ReadLog = { id: number; at: number; source: string; found: boolean };

const MODES: { value: Mode; label: string; note: string }[] = [
  { value: "none", label: "No fix", note: "Every read goes to a replica, even right after a write." },
  { value: "window", label: "Primary window", note: `After a user writes, their reads go to the primary for ${PRIMARY_WINDOW / 1000} s (a cookie or session flag).` },
  { value: "cache", label: "Write-through cache", note: "The write also stores the new ticket in a cache. Reads check the cache first." },
  { value: "position", label: "Replica position", note: "Remember the log position of the user's last write. Use a replica only if it has reached that position." },
];

export function ReplicationLagDrill() {
  const [lag, setLag] = useState(1200);
  const [mode, setMode] = useState<Mode>("none");
  const [now, setNow] = useState(0);
  const [writes, setWrites] = useState<number[]>([]);
  const [reads, setReads] = useState<ReadLog[]>([]);

  useInterval(() => setNow((n) => n + STEP), STEP, true);

  const lastWrite = writes.length ? writes[writes.length - 1] : null;
  const onReplica = writes.filter((w) => w + lag <= now).length;
  const replicaBehind = writes.length - onReplica;
  const lastBehind = lastWrite !== null && lastWrite + lag > now;
  const missed = reads.filter((r) => !r.found).length;

  function buy() {
    setWrites((w) => [...w, now]);
    trackVisual(VISUAL, "buy_ticket", mode);
  }

  function read(at: number, writesNow: number[]) {
    const lw = writesNow.length ? writesNow[writesNow.length - 1] : null;
    const want = writesNow.length;
    const replicaHas = writesNow.filter((w) => w + lag <= at).length;
    let source = "replica";
    let have = replicaHas;
    if (mode === "window" && lw !== null && at - lw < PRIMARY_WINDOW) {
      source = "primary";
      have = want;
    } else if (mode === "cache" && lw !== null && at - lw < CACHE_TTL) {
      source = "cache";
      have = want;
    } else if (mode === "position" && lw !== null && lw + lag > at) {
      source = "primary (replica behind)";
      have = want;
    }
    setReads((r) => [{ id: r.length + 1, at, source, found: have >= want }, ...r].slice(0, 6));
  }

  function openNow() {
    read(now, writes);
    trackVisual(VISUAL, "open_tickets", mode);
  }

  function buyAndOpen() {
    const w = [...writes, now];
    setWrites(w);
    read(now + STEP, w);
    trackVisual(VISUAL, "buy_and_open", mode);
  }

  return (
    <VisualFrame
      title="Buy a ticket, then open My tickets"
      hint="The primary has the new ticket instantly. The replica gets it after the lag. Use the quick button, then compare the fixes."
      caption="Every fix works by sending the one user who just wrote to a place that has the data. Everyone else still reads from replicas."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <RangeField
          label="Replication lag"
          value={lag}
          min={0}
          max={3000}
          step={100}
          onChange={setLag}
          onCommit={(v) => trackVisual(VISUAL, "lag", v)}
          format={(v) => (v === 0 ? "0 ms (instant)" : `${v} ms`)}
        />
        <Segmented
          label="Fix"
          value={mode}
          options={MODES.map((m) => ({ value: m.value, label: m.label }))}
          onChange={(v) => {
            setMode(v);
            trackVisual(VISUAL, "fix", v);
          }}
        />
      </div>
      <p className="mt-2 text-[12.5px] text-muted">{MODES.find((m) => m.value === mode)?.note}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-accent/40 bg-bg p-3">
          <p className="font-mono text-[10.5px] uppercase text-subtle">Primary</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{writes.length}</p>
          <p className="text-[12px] text-muted">tickets stored</p>
        </div>
        <div className={cn("rounded-xl border bg-bg p-3", replicaBehind ? "border-warn/50" : "border-line")}>
          <p className="font-mono text-[10.5px] uppercase text-subtle">Replica</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{onReplica}</p>
          <p className={cn("text-[12px]", replicaBehind ? "text-warn" : "text-muted")}>
            {replicaBehind ? `${replicaBehind} write${replicaBehind > 1 ? "s" : ""} still in flight` : "caught up"}
          </p>
          {lastBehind && lastWrite !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full bg-warn" style={{ width: `${Math.min(100, ((now - lastWrite) / Math.max(lag, 1)) * 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" onClick={buyAndOpen}>
          <Zap className="size-3.5" /> Buy, then open instantly
        </Button>
        <Button size="sm" variant="secondary" onClick={buy}>
          <Ticket className="size-3.5" /> Buy ticket
        </Button>
        <Button size="sm" variant="secondary" onClick={openNow} disabled={writes.length === 0}>
          Open My tickets
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setWrites([]);
            setReads([]);
            trackVisual(VISUAL, "reset", true);
          }}
        >
          <RotateCcw className="size-3.5" /> Reset
        </Button>
      </div>

      <ul className="mt-3 space-y-1.5" aria-live="polite">
        {reads.length === 0 && <li className="text-[12.5px] text-subtle">No reads yet. Buy a ticket and open the page.</li>}
        {reads.map((r) => (
          <li key={r.id} className={cn("flex items-center gap-2 rounded-lg border bg-bg px-3 py-2 text-[12.5px]", r.found ? "border-line" : "border-err/50")}>
            {r.found ? <CheckCircle2 className="size-4 shrink-0 text-ok" /> : <XCircle className="size-4 shrink-0 text-err" />}
            <span className="min-w-0 flex-1 truncate text-fg">{r.found ? "Ticket shown" : "\"No tickets found\""}</span>
            <span className="font-mono text-[10.5px] text-subtle">from {r.source}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Recent reads" value={reads.length} />
        <Stat label="Stale (recent)" value={missed} tone={missed ? "err" : "ok"} sub="user saw old data" />
      </div>
    </VisualFrame>
  );
}
