"use client";

import { useState } from "react";
import { Shuffle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Slider, Stat, VisualFrame, mulberry32, useVisualTracker } from "./distributed-visual-kit";

function worstRead(n: number, r: number) {
  // Pick the read set that avoids the write set (nodes 0..W-1) as much as possible: the last R nodes.
  return Array.from({ length: r }, (_, i) => n - r + i);
}

export function QuorumExplorer() {
  const tr = useVisualTracker("quorum-explorer");
  const [n, setN] = useState(3);
  const [w, setW] = useState(2);
  const [r, setR] = useState(2);
  const [read, setRead] = useState<number[]>(() => worstRead(3, 2));
  const [seed, setSeed] = useState(1);

  const writeSet = new Set(Array.from({ length: w }, (_, i) => i));
  const readSet = new Set(read);
  const overlap = read.filter((i) => writeSet.has(i));
  const fresh = overlap.length > 0;
  const strict = r + w > n;
  const minOverlap = Math.max(0, r + w - n);

  const setSizes = (nn: number, ww: number, rr: number) => {
    const W = Math.min(ww, nn);
    const R = Math.min(rr, nn);
    setN(nn);
    setW(W);
    setR(R);
    setRead(worstRead(nn, R));
  };

  const toggle = (i: number) => {
    let next: number[];
    if (readSet.has(i)) {
      // Keep the read set at exactly R nodes: swap this one for the next unused node.
      const free = Array.from({ length: n }, (_, k) => k).filter((k) => !readSet.has(k) && k !== i);
      if (!free.length) return;
      next = read.map((k) => (k === i ? free[0] : k));
    } else {
      next = [...read.slice(1), i];
    }
    setRead(next);
    tr("pick-read", i + 1);
  };

  return (
    <VisualFrame
      eyebrow="Try it · quorums"
      title="Does the read see the write?"
      hint="A write of v2 reached the first W replicas (orange). The read asks R replicas (violet ring). Click replicas to choose which ones the read hits."
    >
      <div className="grid gap-x-5 gap-y-3 sm:grid-cols-3">
        <Slider
          label="Replicas (N)"
          value={n}
          min={1}
          max={7}
          onChange={(v) => setSizes(v, w, r)}
          onCommit={(v) => tr("N", v)}
        />
        <Slider
          label="Write acks (W)"
          value={w}
          min={1}
          max={n}
          onChange={(v) => setSizes(n, v, r)}
          onCommit={(v) => tr("W", v)}
        />
        <Slider label="Read from (R)" value={r} min={1} max={n} onChange={(v) => setSizes(n, w, v)} onCommit={(v) => tr("R", v)} />
      </div>

      <div className="mt-4 rounded-xl border border-line bg-bg p-4">
        <div className="flex flex-wrap justify-center gap-3" role="group" aria-label="Replicas: click to choose the read set">
          {Array.from({ length: n }, (_, i) => {
            const hasNew = writeSet.has(i);
            const inRead = readSet.has(i);
            return (
              <button
                key={i}
                type="button"
                aria-pressed={inRead}
                aria-label={`Replica ${i + 1}, has ${hasNew ? "v2" : "v1"}${inRead ? ", in read set" : ""}`}
                onClick={() => toggle(i)}
                className={cn(
                  "relative grid size-14 place-items-center rounded-full border-2 font-mono text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 sm:size-16",
                  hasNew ? "border-accent bg-accent-soft text-accent" : "border-line-strong bg-surface-2 text-muted",
                )}
              >
                {inRead && <span className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-info" />}
                <span className="leading-none">
                  {hasNew ? "v2" : "v1"}
                  <span className="mt-1 block text-[9.5px] font-normal text-subtle">#{i + 1}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setRead(worstRead(n, r));
              tr("worst-case", true);
            }}
          >
            <TriangleAlert className="size-3.5" /> Worst-case read
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const rand = mulberry32(seed * 7919 + n * 31 + r);
              const all = Array.from({ length: n }, (_, k) => k);
              for (let k = all.length - 1; k > 0; k--) {
                const j = Math.floor(rand() * (k + 1));
                [all[k], all[j]] = [all[j], all[k]];
              }
              setRead(all.slice(0, r).sort((a, b) => a - b));
              setSeed((s) => s + 1);
              tr("random-read", true);
            }}
          >
            <Shuffle className="size-3.5" /> Random read
          </Button>
        </div>
      </div>

      <p
        role="status"
        className={cn(
          "mt-3 rounded-xl border px-3 py-2.5 text-[13.5px] leading-relaxed text-fg",
          fresh ? "border-ok/30 bg-ok/5" : "border-err/30 bg-err/5",
        )}
      >
        <span className={cn("font-semibold", fresh ? "text-ok" : "text-err")}>{fresh ? "Fresh read. " : "Stale read. "}</span>
        {fresh
          ? `Replica${overlap.length > 1 ? "s" : ""} ${overlap.map((i) => `#${i + 1}`).join(", ")} ha${overlap.length > 1 ? "ve" : "s"} v2, so the read returns the newest version.`
          : "None of the replicas this read asked has v2, so it returns v1 even though the write succeeded."}{" "}
        {strict
          ? `With R + W = ${r + w} > N = ${n}, every possible read overlaps the write on at least ${minOverlap} replica${minOverlap > 1 ? "s" : ""}. Try to make it stale: you can't.`
          : `With R + W = ${r + w} ≤ N = ${n}, some reads can miss the write entirely.`}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="R + W vs N" value={`${r + w} ${strict ? ">" : "≤"} ${n}`} tone={strict ? "ok" : "err"} sub={strict ? "quorums overlap" : "no overlap guarantee"} />
        <Stat label="Writes survive" value={`${n - w} down`} tone={n - w > 0 ? "default" : "warn"} sub="replicas lost, still writable" />
        <Stat label="Reads survive" value={`${n - r} down`} tone={n - r > 0 ? "default" : "warn"} sub="replicas lost, still readable" />
        <Stat label="Write waits for" value={`${w}${["st", "nd", "rd"][w - 1] ?? "th"} ack`} sub={`slowest of the ${w} fastest`} />
      </div>
    </VisualFrame>
  );
}
