"use client";

import { useState } from "react";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { Meter, RangeField, Segmented, Stat, Toggle, VisualFrame, fmt, trackVisual } from "./caching-scaling-ui";

const VISUAL = "replica-fanout";
const CAP = 1000; // work units one database node can do per second
const WRITE_COST = 2; // a write costs more than a read, and every replica replays it

export function ReplicaFanout() {
  const [traffic, setTraffic] = useState(1800);
  const [writePct, setWritePct] = useState(10);
  const [replicas, setReplicas] = useState(0);
  const [primaryReads, setPrimaryReads] = useState(true);

  const writes = (traffic * writePct) / 100;
  const reads = traffic - writes;
  const readNodes = replicas === 0 ? 1 : primaryReads ? replicas + 1 : replicas;
  const readsPerNode = reads / readNodes;
  const primaryRead = replicas === 0 || primaryReads ? readsPerNode : 0;
  const primaryLoad = (writes * WRITE_COST + primaryRead) / CAP;
  const replicaLoad = (writes * WRITE_COST + readsPerNode) / CAP;
  const worst = Math.max(primaryLoad, replicas ? replicaLoad : 0);
  const served = worst > 1 ? 1 / worst : 1;
  // the most traffic this layout could serve at the current write mix
  const perReqCost = (writePct / 100) * WRITE_COST;
  const maxTraffic = Math.floor(CAP / (perReqCost + (1 - writePct / 100) / readNodes));

  return (
    <VisualFrame
      title="Add read replicas"
      hint="A write costs 2 units, a read costs 1, and each database node does 1000 units per second. Add replicas and watch which node runs out first."
      caption="Replicas split the reads, but every replica replays every write. Past a point, adding replicas stops helping, and only reducing writes (or splitting the data, later) does."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <RangeField
          label="Traffic"
          value={traffic}
          min={500}
          max={6000}
          step={100}
          onChange={setTraffic}
          onCommit={(v) => trackVisual(VISUAL, "traffic", v)}
          format={(v) => `${fmt(v)} req/s`}
        />
        <RangeField
          label="Share of writes"
          value={writePct}
          min={2}
          max={40}
          step={1}
          onChange={setWritePct}
          onCommit={(v) => trackVisual(VISUAL, "write_pct", v)}
          format={(v) => `${v}%`}
        />
        <Segmented
          label="Read replicas"
          value={String(replicas)}
          options={[0, 1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: String(v) }))}
          onChange={(v) => {
            setReplicas(Number(v));
            trackVisual(VISUAL, "replicas", Number(v));
          }}
        />
        <Toggle
          label="Primary also serves reads"
          description="Off keeps the primary free for writes."
          checked={primaryReads}
          onChange={(v) => {
            setPrimaryReads(v);
            trackVisual(VISUAL, "primary_reads", v);
          }}
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Node name="Primary" role="all writes" load={primaryLoad} reads={primaryRead} writes={writes} primary />
        {Array.from({ length: replicas }, (_, i) => (
          <Node key={i} name={`Replica ${i + 1}`} role="replays writes" load={replicaLoad} reads={readsPerNode} writes={writes} />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Reads / writes" value={`${fmt(reads)} / ${fmt(writes)}`} sub="requests per second" />
        <Stat
          label="Requests served"
          value={`${Math.round(served * 100)}%`}
          tone={served < 1 ? "err" : "ok"}
          sub={served < 1 ? "the busiest node is saturated" : "everything fits"}
        />
        <Stat
          label="This layout tops out near"
          value={`${fmt(maxTraffic)} req/s`}
          sub={replicas > 0 ? "at this write share" : "add a replica to raise it"}
        />
      </div>
      {writes * WRITE_COST > CAP && (
        <p className="mt-3 rounded-xl border border-err/40 bg-bg px-3 py-2 text-[12.5px] text-err">
          Writes alone need {fmt(writes * WRITE_COST)} units/s, more than one node can do. No number of replicas fixes this, because every
          replica repeats every write.
        </p>
      )}
    </VisualFrame>
  );
}

function Node({ name, role, load, reads, writes, primary }: { name: string; role: string; load: number; reads: number; writes: number; primary?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-xl border bg-bg p-3", load > 1 ? "border-err/50" : primary ? "border-accent/40" : "border-line")}>
      <div className="flex items-center gap-2">
        <Database className={cn("size-4", primary ? "text-accent" : "text-muted")} />
        <p className="text-[13px] font-semibold text-fg">{name}</p>
        <span className="ml-auto font-mono text-[10.5px] uppercase text-subtle">{role}</span>
      </div>
      <Meter className="mt-2" value={load} label="load" />
      <p className="mt-1 font-mono text-[10.5px] text-subtle">
        {fmt(reads)} reads/s · {fmt(writes)} writes/s
      </p>
    </div>
  );
}
