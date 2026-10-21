"use client";

import { useEffect, useReducer } from "react";
import { Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Segmented, Stat, VisualButton, VisualShell, useVisualTracker } from "./visual-shell";

const PARTITIONS = 6;
const PRODUCE_PER_TICK = 5;
const CAPACITY_PER_CONSUMER = 2;
const REBALANCE_TICKS = 3;
const TICK_MS = 650;

type Step = 0 | 1 | 2;
type Ev = { id: number; booking: number; step: Step };

const STEP = [
  { short: "C", name: "Created", cls: "bg-req/80 text-accent-fg" },
  { short: "P", name: "Paid", cls: "bg-info/80 text-accent-fg" },
  { short: "T", name: "Ticketed", cls: "bg-res/80 text-accent-fg" },
] as const;

const CONSUMER_TONE = [
  "border-req/60 text-req",
  "border-info/60 text-info",
  "border-res/60 text-res",
  "border-warn/60 text-warn",
  "border-err/60 text-err",
  "border-accent/60 text-accent",
  "border-line-strong text-muted",
  "border-line-strong text-muted",
];

type State = {
  consumers: number;
  keyed: boolean;
  running: boolean;
  queues: Ev[][];
  /** Bookings still being produced, with the next step each will emit. */
  active: { booking: number; next: Step }[];
  nextBooking: number;
  nextEvent: number;
  rr: number;
  seed: number;
  /** Highest step processed so far, per booking. */
  seen: Record<number, number>;
  processed: number;
  violations: number;
  lastViolation: string | null;
  rebalancing: number;
  tick: number;
};

const initial = (keyed = true, consumers = 2): State => ({
  consumers,
  keyed,
  running: false,
  queues: Array.from({ length: PARTITIONS }, () => []),
  active: [],
  nextBooking: 100,
  nextEvent: 1,
  rr: 0,
  seed: 42,
  seen: {},
  processed: 0,
  violations: 0,
  lastViolation: null,
  rebalancing: 0,
  tick: 0,
});

/** Which partitions consumer c owns: a simple round-robin assignment. */
function owned(c: number, consumers: number) {
  return Array.from({ length: PARTITIONS }, (_, p) => p).filter((p) => p % consumers === c);
}

function rand(seed: number) {
  const next = (seed * 1103515245 + 12345) % 2147483648;
  return [next / 2147483648, next] as const;
}

function step(s: State): State {
  let { seed, nextBooking, nextEvent, rr } = s;
  const active = s.active.map((a) => ({ ...a }));
  const queues = s.queues.map((q) => [...q]);

  // 1. Produce.
  for (let i = 0; i < PRODUCE_PER_TICK; i++) {
    let r: number;
    [r, seed] = rand(seed);
    let ev: Ev;
    if (active.length < 5 || r < 0.3) {
      ev = { id: nextEvent++, booking: nextBooking, step: 0 };
      active.push({ booking: nextBooking++, next: 1 });
    } else {
      const idx = Math.floor(r * 997) % active.length;
      const a = active[idx];
      ev = { id: nextEvent++, booking: a.booking, step: a.next };
      if (a.next === 2) active.splice(idx, 1);
      else a.next = (a.next + 1) as Step;
    }
    // Without a key the producer just picks any partition (Kafka's default batches to one, then moves on).
    let pick: number;
    [pick, seed] = rand(seed);
    const p = s.keyed ? (ev.booking * 7) % PARTITIONS : (rr + Math.floor(pick * PARTITIONS)) % PARTITIONS;
    rr++;
    queues[p].push(ev);
  }

  // 2. Consume, unless the group is rebalancing.
  let { processed, violations, lastViolation } = s;
  const seen = { ...s.seen };
  if (s.rebalancing === 0) {
    for (let c = 0; c < Math.min(s.consumers, PARTITIONS); c++) {
      const mine = owned(c, s.consumers);
      // Processing time varies (slow SMTP replies, GC pauses), so a consumer handles 1–3 events per tick.
      let jitter: number;
      [jitter, seed] = rand(seed);
      let budget = CAPACITY_PER_CONSUMER - 1 + Math.floor(jitter * 3);
      let k = 0;
      let idle = 0;
      while (budget > 0 && idle < mine.length) {
        const q = queues[mine[k % mine.length]];
        k++;
        const ev = q.shift();
        if (!ev) {
          idle++;
          continue;
        }
        idle = 0;
        budget--;
        processed++;
        const prev = seen[ev.booking] ?? -1;
        if (ev.step !== prev + 1) {
          violations++;
          lastViolation =
            ev.step > prev + 1
              ? `Booking #${ev.booking}: "${STEP[ev.step].name}" was handled before "${STEP[prev + 1].name}".`
              : `Booking #${ev.booking}: "${STEP[ev.step].name}" arrived after "${STEP[prev].name}" was already handled.`;
        }
        seen[ev.booking] = Math.max(prev, ev.step);
      }
    }
  }

  return {
    ...s,
    queues,
    active,
    nextBooking,
    nextEvent,
    rr,
    seed,
    seen,
    processed,
    violations,
    lastViolation,
    rebalancing: Math.max(0, s.rebalancing - 1),
    tick: s.tick + 1,
  };
}

type Action =
  | { type: "tick" }
  | { type: "consumers"; n: number }
  | { type: "keyed"; keyed: boolean }
  | { type: "running"; running: boolean }
  | { type: "reset" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "tick":
      return step(s);
    case "consumers":
      return { ...s, consumers: a.n, rebalancing: REBALANCE_TICKS };
    case "keyed":
      return { ...initial(a.keyed, s.consumers), running: s.running };
    case "running":
      return { ...s, running: a.running };
    case "reset":
      return initial(s.keyed, s.consumers);
  }
}

export function ConsumerGroupRebalance() {
  const t = useVisualTracker("consumer-groups");
  const [s, dispatch] = useReducer(reducer, undefined, () => initial());

  useEffect(() => {
    if (!s.running) return;
    const id = setInterval(() => dispatch({ type: "tick" }), TICK_MS);
    return () => clearInterval(id);
  }, [s.running]);

  const lag = s.queues.reduce((n, q) => n + q.length, 0);
  const capacity = Math.min(s.consumers, PARTITIONS) * CAPACITY_PER_CONSUMER;
  const ownerOf = (p: number) => p % s.consumers;

  function setConsumers(n: number) {
    if (n < 1 || n > 8 || n === s.consumers) return;
    t();
    dispatch({ type: "consumers", n });
  }

  return (
    <VisualShell
      title="One consumer group, six partitions"
      hint="Press play. Add consumers until the lag stops growing, go past six, then switch keys off and watch the order of each booking's events."
    >
      <div className="flex flex-wrap items-center gap-2">
        <VisualButton
          tone="accent"
          onClick={() => {
            t();
            dispatch({ type: "running", running: !s.running });
          }}
        >
          {s.running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {s.running ? "Pause" : "Play"}
        </VisualButton>
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => setConsumers(s.consumers - 1)}
            disabled={s.consumers <= 1}
            aria-label="Remove a consumer"
            className="grid size-6 place-items-center rounded-md text-muted outline-none hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-30"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="min-w-[88px] text-center font-mono text-[12px] text-fg tabular-nums">
            {s.consumers} consumer{s.consumers > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => setConsumers(s.consumers + 1)}
            disabled={s.consumers >= 8}
            aria-label="Add a consumer"
            className="grid size-6 place-items-center rounded-md text-muted outline-none hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-30"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <Segmented
          label="Partition key"
          value={s.keyed ? "keyed" : "none"}
          onChange={(v) => {
            t();
            dispatch({ type: "keyed", keyed: v === "keyed" });
          }}
          options={[
            { value: "keyed", label: "Key: booking id" },
            { value: "none", label: "No key" },
          ]}
        />
        <VisualButton
          onClick={() => {
            t();
            dispatch({ type: "reset" });
          }}
          title="Reset"
          className="ml-auto"
        >
          <RotateCcw className="size-3.5" />
          <span className="sr-only">Reset</span>
        </VisualButton>
      </div>

      <div className="mt-4 grid gap-1.5" aria-label="Partitions">
        {s.queues.map((q, p) => {
          const owner = ownerOf(p);
          return (
            <div key={p} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2 py-1.5">
              <span className="w-7 shrink-0 font-mono text-[11px] text-subtle">P{p}</span>
              <span
                className={cn(
                  "w-9 shrink-0 rounded-md border text-center font-mono text-[10.5px]",
                  s.rebalancing ? "border-dashed border-line-strong text-subtle" : CONSUMER_TONE[owner],
                )}
                title={`Owned by consumer ${owner + 1}`}
              >
                {s.rebalancing ? "…" : `C${owner + 1}`}
              </span>
              <div className="flex h-5 min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
                {q.slice(0, 22).map((ev) => (
                  <span
                    key={ev.id}
                    title={`Booking #${ev.booking}: ${STEP[ev.step].name}`}
                    className={cn("grid h-4 w-3.5 shrink-0 place-items-center rounded-[3px] font-mono text-[8.5px] font-bold", STEP[ev.step].cls)}
                  >
                    {STEP[ev.step].short}
                  </span>
                ))}
              </div>
              <span className={cn("w-8 shrink-0 text-right font-mono text-[11px] tabular-nums", q.length > 15 ? "text-warn" : "text-muted")}>
                {q.length}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Consumers">
        {Array.from({ length: s.consumers }, (_, c) => {
          const mine = owned(c, s.consumers);
          return (
            <span
              key={c}
              className={cn(
                "rounded-lg border bg-surface-2 px-2 py-1 font-mono text-[11px]",
                mine.length ? CONSUMER_TONE[c] : "border-dashed border-line-strong text-subtle",
              )}
            >
              C{c + 1}: {s.rebalancing ? "waiting" : mine.length ? mine.map((p) => `P${p}`).join(" ") : "idle"}
            </span>
          );
        })}
      </div>

      <p
        className={cn(
          "mt-3 min-h-10 rounded-xl border px-3 py-2 text-[13px]",
          s.rebalancing ? "border-warn/40 bg-warn/5 text-warn" : "border-line bg-bg text-muted",
        )}
        aria-live="polite"
      >
        {s.rebalancing
          ? "Rebalancing: the group stopped consuming while partitions are reassigned. Lag grows during the pause."
          : s.lastViolation
            ? `Out of order! ${s.lastViolation}`
            : s.consumers > PARTITIONS
              ? `${s.consumers - PARTITIONS} consumer${s.consumers - PARTITIONS > 1 ? "s are" : " is"} idle: a partition is read by at most one consumer in the group.`
              : s.keyed
                ? "Each booking's events share a partition, so one consumer handles them in order."
                : "Events are sprayed across partitions. A booking's events may sit in partitions with different backlogs."}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="In / out per tick" value={`${PRODUCE_PER_TICK} / ${s.rebalancing ? 0 : "~" + capacity}`} tone={capacity < PRODUCE_PER_TICK ? "warn" : "ok"} />
        <Stat label="Lag" value={lag} tone={lag > 40 ? "err" : lag > 15 ? "warn" : undefined} />
        <Stat label="Handled" value={s.processed} />
        <Stat label="Out of order" value={s.violations} tone={s.violations ? "err" : "ok"} />
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11.5px] text-subtle">
        {STEP.map((st) => (
          <span key={st.short} className="flex items-center gap-1.5">
            <span className={cn("grid h-4 w-3.5 place-items-center rounded-[3px] font-mono text-[8.5px] font-bold", st.cls)}>{st.short}</span>
            {st.name}
          </span>
        ))}
      </div>
    </VisualShell>
  );
}
