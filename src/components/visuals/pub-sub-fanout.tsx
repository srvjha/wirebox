"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowRight, ChartColumn, Armchair, Mail, MessageSquare, Power, RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Segmented, Stat, VisualButton, VisualShell, useVisualTracker } from "./visual-shell";

type Mode = "chain" | "pubsub";

type Sub = {
  id: string;
  name: string;
  /** Time this service takes when booking calls it directly, in ms. */
  callMs: number;
  up: boolean;
  inbox: number[];
  done: number;
};

const ICONS = { seats: Armchair, email: Mail, sms: MessageSquare, analytics: ChartColumn } as const;

const initialSubs = (): Sub[] => [
  { id: "seats", name: "Seat map", callMs: 40, up: true, inbox: [], done: 0 },
  { id: "email", name: "Email", callMs: 180, up: true, inbox: [], done: 0 },
  { id: "sms", name: "SMS", callMs: 420, up: true, inbox: [], done: 0 },
  { id: "analytics", name: "Analytics", callMs: 60, up: true, inbox: [], done: 0 },
];

const SAVE_MS = 25;

function FlowArrow() {
  return (
    <div className="flex items-center justify-center text-subtle" aria-hidden>
      <ArrowDown className="size-4 sm:hidden" />
      <ArrowRight className="hidden size-4 sm:block" />
    </div>
  );
}
const TICK_MS = 750;

export function PubSubFanout() {
  const t = useVisualTracker("pub-sub-fanout");
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode>("pubsub");
  const [subs, setSubs] = useState<Sub[]>(initialSubs);
  const [nextId, setNextId] = useState(1);
  const [recent, setRecent] = useState<number[]>([]);
  const [ok, setOk] = useState(0);
  const [failed, setFailed] = useState(0);
  const [lastWait, setLastWait] = useState<number | null>(null);
  const [message, setMessage] = useState("Publish a booking to see who hears about it.");

  const waiting = subs.reduce((n, s) => n + s.inbox.length, 0);

  // Each running subscriber takes one message from its own queue per tick.
  useEffect(() => {
    if (mode !== "pubsub" || waiting === 0) return;
    const id = setInterval(() => {
      setSubs((ss) => ss.map((s) => (s.up && s.inbox.length ? { ...s, inbox: s.inbox.slice(1), done: s.done + 1 } : s)));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [mode, waiting]);

  function reset(nextMode: Mode = mode) {
    setSubs(initialSubs());
    setNextId(1);
    setRecent([]);
    setOk(0);
    setFailed(0);
    setLastWait(null);
    setMessage(nextMode === "pubsub" ? "Publish a booking to see who hears about it." : "Book a ticket. Booking calls each service in turn.");
  }

  function publish(count: number) {
    t("publish", count);
    const ids = Array.from({ length: count }, (_, i) => nextId + i);
    setNextId((n) => n + count);
    if (mode === "chain") {
      const down = subs.find((s) => !s.up);
      if (down) {
        // The first call that fails fails the whole booking.
        const before = subs.slice(0, subs.indexOf(down));
        const waited = SAVE_MS + before.reduce((n, s) => n + s.callMs, 0) + 2000;
        setFailed((f) => f + count);
        setLastWait(waited);
        setMessage(
          `${down.name} didn't answer within 2 s, so booking ${count > 1 ? "attempts" : "#" + ids[0]} failed and rolled back, even though ${down.name.toLowerCase()} only needed to hear about it.`,
        );
        return;
      }
      setSubs((ss) => ss.map((s) => ({ ...s, done: s.done + count })));
      setOk((n) => n + count);
      const waited = SAVE_MS + subs.reduce((n, s) => n + s.callMs, 0);
      setLastWait(waited);
      setMessage(`Booking${count > 1 ? "s" : " #" + ids[0]} succeeded after calling four services one after another.`);
      return;
    }
    setSubs((ss) => ss.map((s) => ({ ...s, inbox: [...s.inbox, ...ids] })));
    setRecent((r) => [...r, ...ids].slice(-6));
    setOk((n) => n + count);
    setLastWait(SAVE_MS + 5);
    const downs = subs.filter((s) => !s.up).map((s) => s.name);
    setMessage(
      downs.length
        ? `Booking${count > 1 ? "s" : " #" + ids[0]} succeeded. ${downs.join(" and ")} ${downs.length > 1 ? "are" : "is"} down, so ${count > 1 ? "the events wait" : "the event waits"} in ${downs.length > 1 ? "their queues" : "its queue"}.`
        : `Published BookingCreated #${ids[ids.length - 1]}. Every subscriber gets its own copy.`,
    );
  }

  function toggle(id: string) {
    const s = subs.find((x) => x.id === id)!;
    t(`toggle-${id}`, !s.up);
    setSubs((ss) => ss.map((x) => (x.id === id ? { ...x, up: !x.up } : x)));
    if (mode === "pubsub" && !s.up && s.inbox.length) {
      setMessage(`${s.name} is back and catching up on ${s.inbox.length} missed event${s.inbox.length > 1 ? "s" : ""}.`);
    } else if (s.up) {
      setMessage(`${s.name} is down. ${mode === "pubsub" ? "Keep publishing and watch its queue." : "Now try to book."}`);
    }
  }

  return (
    <VisualShell
      title="One booking, four services that care"
      hint="Publish bookings, then switch a service off. Compare a chain of direct calls with publishing one event."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Wiring"
          value={mode}
          onChange={(m) => {
            t("mode", m);
            setMode(m);
            reset(m);
          }}
          options={[
            { value: "chain", label: "Direct calls" },
            { value: "pubsub", label: "Pub/sub" },
          ]}
        />
        <div className="ml-auto flex gap-2">
          <VisualButton tone="accent" onClick={() => publish(1)}>
            <Send className="size-3.5" /> {mode === "pubsub" ? "Publish" : "Book"}
          </VisualButton>
          <VisualButton onClick={() => publish(5)}>×5</VisualButton>
          <VisualButton
            onClick={() => {
              t("reset", true);
              reset();
            }}
            title="Reset"
          >
            <RotateCcw className="size-3.5" />
            <span className="sr-only">Reset</span>
          </VisualButton>
        </div>
      </div>

      <div className="mt-4 grid items-center gap-2 sm:grid-cols-[1fr_auto_1.15fr_auto_1.6fr]">
        <div className="rounded-xl border border-req/50 bg-surface-2 p-3">
          <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">Publisher</p>
          <p className="text-[14px] font-semibold text-fg">Booking service</p>
          <p className="mt-1 text-[12px] text-muted">
            {mode === "pubsub" ? "Saves the booking, publishes one event." : "Saves the booking, then calls everyone."}
          </p>
        </div>
        <FlowArrow />
        <div className={cn("rounded-xl border bg-surface-2 p-3", mode === "pubsub" ? "border-info/50" : "border-dashed border-line-strong")}>
          <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">{mode === "pubsub" ? "Topic" : "No broker"}</p>
          <p className="font-mono text-[13px] font-semibold text-fg">{mode === "pubsub" ? "booking-events" : "4 sequential calls"}</p>
          {mode === "pubsub" ? (
            <div className="mt-2 flex min-h-6 flex-wrap gap-1" aria-live="polite">
              <AnimatePresence initial={false}>
                {recent.map((id) => (
                  <motion.span
                    key={id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? undefined : { opacity: 0, scale: 0.6 }}
                    className="rounded-md border border-info/40 bg-info/10 px-1.5 py-0.5 font-mono text-[10.5px] text-info"
                  >
                    #{id}
                  </motion.span>
                ))}
              </AnimatePresence>
              {recent.length === 0 && <span className="text-[12px] text-subtle">empty</span>}
            </div>
          ) : (
            <p className="mt-1 text-[12px] text-muted">The user waits for every call to return.</p>
          )}
        </div>
        <FlowArrow />
        <div role="list" className="grid gap-2">
          {subs.map((s) => {
            const Icon = ICONS[s.id as keyof typeof ICONS];
            return (
              <div
                role="listitem"
                key={s.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border bg-surface-2 px-2.5 py-2 transition-colors",
                  s.up ? "border-line" : "border-err/50 bg-err/5",
                )}
              >
                <Icon className={cn("size-4 shrink-0", s.up ? "text-res" : "text-err")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-tight font-medium text-fg">{s.name}</p>
                  <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1">
                    {mode === "pubsub" ? (
                      <>
                        <AnimatePresence initial={false}>
                          {s.inbox.slice(0, 7).map((id) => (
                            <motion.span
                              key={id}
                              layout={!reduce}
                              initial={reduce ? false : { opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={reduce ? undefined : { opacity: 0, scale: 0.4 }}
                              className={cn(
                                "rounded border px-1 font-mono text-[10px]",
                                s.up ? "border-req/40 text-req" : "border-err/40 text-err",
                              )}
                            >
                              #{id}
                            </motion.span>
                          ))}
                        </AnimatePresence>
                        {s.inbox.length > 7 && <span className="font-mono text-[10px] text-subtle">+{s.inbox.length - 7}</span>}
                        {s.inbox.length === 0 && <span className="font-mono text-[10px] text-subtle">queue empty</span>}
                      </>
                    ) : (
                      <span className="font-mono text-[10px] text-subtle">{s.callMs} ms per call</span>
                    )}
                  </div>
                </div>
                <span className="font-mono text-[11px] text-muted tabular-nums" title="Events handled">
                  ✓{s.done}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-pressed={!s.up}
                  aria-label={`${s.up ? "Take down" : "Bring back"} ${s.name}`}
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                    s.up ? "border-line text-muted hover:text-err" : "border-err/50 bg-err/10 text-err",
                  )}
                >
                  <Power className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 min-h-10 rounded-xl border border-line bg-bg px-3 py-2 text-[13px] text-muted" aria-live="polite">
        {message}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Bookings ok" value={ok} tone="ok" />
        <Stat label="Bookings failed" value={failed} tone={failed ? "err" : undefined} />
        <Stat label="User waited" value={lastWait === null ? "–" : `${lastWait.toLocaleString("en-US")} ms`} tone={lastWait && lastWait > 500 ? "warn" : undefined} />
        <Stat label="Events queued" value={mode === "pubsub" ? waiting : "–"} tone={waiting > 5 ? "warn" : undefined} />
      </div>
    </VisualShell>
  );
}
