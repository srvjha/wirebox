"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Segmented, Stat, VisualFrame, trackVisual, useInterval, usePrefersReducedMotion } from "./caching-scaling-ui";

const VISUAL = "eviction-playground";
const CAPACITY = 4;
const KEYS = ["band", "comedy", "fest", "jazz", "quiz", "expo", "play", "talk"] as const;
type Key = (typeof KEYS)[number];
type Policy = "lru" | "lfu" | "fifo";
type Slot = { key: Key; inserted: number; used: number; count: number };

const POLICIES: { value: Policy; label: string; rule: string }[] = [
  { value: "lru", label: "LRU", rule: "Evict the key that was used longest ago." },
  { value: "lfu", label: "LFU", rule: "Evict the key used the fewest times." },
  { value: "fifo", label: "FIFO", rule: "Evict the key that was added first, however popular." },
];

const SEQUENCES: { id: string; label: string; note: string; keys: Key[] }[] = [
  {
    id: "scan",
    label: "Hot keys + one-off scan",
    note: "Two hot events, then a crawler touches five pages once each, then the hot events again.",
    keys: ["band", "comedy", "band", "comedy", "band", "comedy", "fest", "jazz", "quiz", "expo", "play", "band", "comedy", "band", "comedy"],
  },
  {
    id: "shift",
    label: "Popularity shifts",
    note: "Yesterday's hits were band and comedy. Today everyone wants jazz, quiz and expo.",
    keys: ["band", "comedy", "band", "comedy", "band", "comedy", "band", "comedy", "jazz", "quiz", "expo", "jazz", "quiz", "expo", "jazz", "quiz", "expo", "jazz", "quiz", "expo"],
  },
];

/** Index of the slot the policy would evict next. */
function victimIndex(slots: Slot[], policy: Policy) {
  let best = 0;
  for (let i = 1; i < slots.length; i++) {
    const a = slots[i];
    const b = slots[best];
    if (policy === "lru" && a.used < b.used) best = i;
    if (policy === "fifo" && a.inserted < b.inserted) best = i;
    if (policy === "lfu" && (a.count < b.count || (a.count === b.count && a.used < b.used))) best = i;
  }
  return best;
}

/** Slots sorted from safest to next-to-go. */
function evictionOrder(slots: Slot[], policy: Policy) {
  const rest = [...slots];
  const order: Slot[] = [];
  while (rest.length) {
    const i = victimIndex(rest, policy);
    order.unshift(rest[i]);
    rest.splice(i, 1);
  }
  return order;
}

type State = { slots: Slot[]; clock: number; hits: number; misses: number; last: { key: Key; hit: boolean; evicted?: Key } | null };
const EMPTY: State = { slots: [], clock: 0, hits: 0, misses: 0, last: null };

function access(s: State, key: Key, policy: Policy): State {
  const clock = s.clock + 1;
  const i = s.slots.findIndex((x) => x.key === key);
  if (i >= 0) {
    const slots = s.slots.map((x, j) => (j === i ? { ...x, used: clock, count: x.count + 1 } : x));
    return { slots, clock, hits: s.hits + 1, misses: s.misses, last: { key, hit: true } };
  }
  let slots = s.slots;
  let evicted: Key | undefined;
  if (slots.length >= CAPACITY) {
    const v = victimIndex(slots, policy);
    evicted = slots[v].key;
    slots = slots.filter((_, j) => j !== v);
  }
  slots = [...slots, { key, inserted: clock, used: clock, count: 1 }];
  return { slots, clock, hits: s.hits, misses: s.misses + 1, last: { key, hit: false, evicted } };
}

export function EvictionPlayground() {
  const reduced = usePrefersReducedMotion();
  const [policy, setPolicy] = useState<Policy>("lru");
  const [state, setState] = useState<State>(EMPTY);
  const [running, setRunning] = useState<{ seq: number; pos: number } | null>(null);

  useInterval(
    () => {
      if (!running) return;
      const seq = SEQUENCES[running.seq].keys;
      setState((s) => access(s, seq[running.pos], policy));
      if (running.pos + 1 >= seq.length) setRunning(null);
      else setRunning({ ...running, pos: running.pos + 1 });
    },
    reduced ? 900 : 650,
    running !== null,
  );

  const order = evictionOrder(state.slots, policy);
  const total = state.hits + state.misses;
  const rule = POLICIES.find((p) => p.value === policy)!.rule;

  return (
    <VisualFrame
      title="Eviction playground"
      hint="The cache holds four event pages. Click events to read them, or play a traffic pattern. Switch policy and replay to compare hit rates."
      caption="Slots are drawn in eviction order: the one on the right goes next. LFU's counts never decay here; real LFU implementations, like Redis's, slowly age them."
    >
      <div className="flex flex-wrap items-end gap-3">
        <Segmented
          label="Policy"
          value={policy}
          options={POLICIES}
          onChange={(p) => {
            setPolicy(p);
            setState(EMPTY);
            setRunning(null);
            trackVisual(VISUAL);
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setState(EMPTY);
            setRunning(null);
            trackVisual(VISUAL);
          }}
        >
          <RotateCcw className="size-3.5" /> Empty cache
        </Button>
      </div>
      <p className="mt-2 text-[12.5px] text-subtle">{rule}</p>

      <p className="mt-4 mb-1.5 font-mono text-[10.5px] tracking-wider text-subtle uppercase">Read an event page</p>
      <div className="flex flex-wrap gap-1.5">
        {KEYS.map((k) => {
          const cached = state.slots.some((s) => s.key === k);
          return (
            <button
              key={k}
              type="button"
              disabled={running !== null}
              onClick={() => {
                setState((s) => access(s, k, policy));
                trackVisual(VISUAL);
              }}
              className={cn(
                "rounded-lg border px-2.5 py-1 font-mono text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50",
                cached ? "border-ok/40 bg-ok/10 text-fg" : "border-line bg-bg text-muted hover:text-fg",
              )}
            >
              {k}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Cache slots, safest first">
        <AnimatePresence mode="popLayout" initial={false}>
          {order.map((s, i) => {
            const next = i === order.length - 1 && order.length === CAPACITY;
            const justHit = state.last?.key === s.key;
            return (
              <motion.div
                key={s.key}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 10 }}
                transition={{ duration: 0.25 }}
                className={cn(
                  "rounded-xl border bg-bg px-3 py-2",
                  justHit ? (state.last?.hit ? "border-ok/60" : "border-accent/60") : next ? "border-err/40" : "border-line",
                )}
              >
                <p className="font-mono text-[13px] font-semibold text-fg">{s.key}</p>
                <p className="mt-0.5 font-mono text-[10.5px] text-subtle">
                  used {state.clock - s.used === 0 ? "now" : `${state.clock - s.used} ago`} · ×{s.count}
                </p>
                <p className={cn("mt-1 font-mono text-[10px] uppercase", next ? "text-err" : "text-subtle")}>{next ? "evicted next" : `slot ${i + 1}`}</p>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {Array.from({ length: CAPACITY - order.length }).map((_, i) => (
          <div key={`empty-${i}`} className="rounded-xl border border-dashed border-line px-3 py-2 font-mono text-[11px] text-subtle">
            empty
          </div>
        ))}
      </div>

      <p className="mt-3 min-h-5 text-[13px]" aria-live="polite">
        {state.last ? (
          <>
            <span className={state.last.hit ? "text-ok" : "text-accent"}>{state.last.hit ? "Hit" : "Miss"}</span>
            <span className="text-muted">
              {" "}
              on <span className="font-mono text-fg">{state.last.key}</span>
              {state.last.evicted && (
                <>
                  , evicted <span className="font-mono text-err">{state.last.evicted}</span> to make room
                </>
              )}
              .
            </span>
          </>
        ) : (
          <span className="text-subtle">The cache is empty. Every first read is a miss.</span>
        )}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Hits" value={state.hits} tone="ok" />
        <Stat label="Misses" value={state.misses} tone={state.misses ? "warn" : "default"} />
        <Stat label="Hit rate" value={total ? `${Math.round((state.hits / total) * 100)}%` : "–"} />
      </div>

      <div className="mt-4 rounded-xl border border-line bg-bg p-3">
        <p className="font-mono text-[10.5px] tracking-wider text-subtle uppercase">Play a traffic pattern</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SEQUENCES.map((seq, i) => (
            <div key={seq.id} className="min-w-0">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (running?.seq === i) return setRunning(null);
                  setState(EMPTY);
                  setRunning({ seq: i, pos: 0 });
                  trackVisual(VISUAL);
                }}
              >
                {running?.seq === i ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
                {seq.label}
              </Button>
              <p className="mt-1.5 text-[12px] leading-snug text-subtle">{seq.note}</p>
              {running?.seq === i && (
                <p className="mt-1 font-mono text-[11px] text-muted">
                  {running.pos}/{seq.keys.length}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </VisualFrame>
  );
}
