"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { trackVisual } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { RangeControl, Stat, VisualFrame, fmtMs } from "./scale-visual-parts";

const VISUAL = "sync-async-latency";
const TIMEOUT = 5000;
const ENQUEUE = 4;

type StepId = "seat" | "pay" | "pdf" | "email" | "sms";
const STEPS: { id: StepId; label: string; ms: number; color: string; canDefer: boolean; why: string }[] = [
  { id: "seat", label: "Reserve seat", ms: 40, color: "var(--info)", canDefer: false, why: "The answer depends on it: did you get the seat?" },
  { id: "pay", label: "Charge card", ms: 700, color: "var(--accent)", canDefer: false, why: "The user must know if the payment worked." },
  { id: "pdf", label: "Make PDF", ms: 350, color: "var(--warn)", canDefer: true, why: "The ticket can arrive a few seconds later." },
  { id: "email", label: "Send email", ms: 250, color: "var(--res)", canDefer: true, why: "Nobody stares at their inbox waiting." },
  { id: "sms", label: "Send SMS", ms: 300, color: "var(--err)", canDefer: true, why: "A text 20 seconds later is fine." },
];

export function SyncAsyncLatency() {
  const [smsMs, setSmsMs] = useState(300);
  const [deferred, setDeferred] = useState<Set<StepId>>(() => new Set());

  const ms = (id: StepId) => (id === "sms" ? smsMs : STEPS.find((s) => s.id === id)!.ms);
  const syncTotal = STEPS.reduce((n, s) => n + ms(s.id), 0);
  const inline = STEPS.filter((s) => !deferred.has(s.id));
  const later = STEPS.filter((s) => deferred.has(s.id));
  const splitTotal = inline.reduce((n, s) => n + ms(s.id), 0) + (later.length ? ENQUEUE : 0);
  const axis = Math.max(6000, syncTotal * 1.05);

  const toggle = (id: StepId) => {
    setDeferred((d) => {
      const next = new Set(d);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    trackVisual(VISUAL);
  };

  return (
    <VisualFrame
      title="What is the fan actually waiting for?"
      hint="Slow the SMS provider down, then move steps out of the request. The dashed line is the app's 5-second timeout."
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
        <RangeControl
          visual={VISUAL}
          label="SMS provider response time"
          value={smsMs}
          min={100}
          max={6000}
          step={100}
          onChange={setSmsMs}
          format={fmtMs}
        />
        <div>
          <p className="text-[12.5px] text-muted">Run after the response (in a queue)</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {STEPS.map((s) => {
              const on = deferred.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!s.canDefer}
                  aria-pressed={on}
                  title={s.why}
                  onClick={() => toggle(s.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                    !s.canDefer && "cursor-not-allowed border-line text-subtle opacity-60",
                    s.canDefer && (on ? "border-ok bg-ok/10 text-ok" : "border-line text-muted hover:text-fg"),
                  )}
                >
                  {on && <Check className="size-3" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <Bar title="Everything in the request" steps={STEPS} ms={ms} axis={axis} total={syncTotal} />
        <Bar title="Your split" steps={inline} ms={ms} axis={axis} total={splitTotal} enqueue={later.length > 0} />
        {later.length > 0 && (
          <div>
            <p className="mb-1 text-[12px] text-subtle">After the response, in a worker (the fan isn&rsquo;t waiting):</p>
            <div className="relative h-5 w-full">
              {later.map((s, i) => {
                const start = splitTotal + later.slice(0, i).reduce((n, x) => n + ms(x.id), 0);
                return (
                  <div
                    key={s.id}
                    style={{ left: `${(start / axis) * 100}%`, width: `${(ms(s.id) / axis) * 100}%`, background: s.color }}
                    className="absolute inset-y-0 rounded-sm border-r border-surface opacity-60"
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-subtle">
        {STEPS.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label} {fmtMs(ms(s.id))}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="All in request" value={fmtMs(syncTotal)} tone={syncTotal > TIMEOUT ? "err" : "default"} sub={syncTotal > TIMEOUT ? "times out" : "user waits"} />
        <Stat label="Your split" value={fmtMs(splitTotal)} tone={splitTotal > TIMEOUT ? "err" : splitTotal < 1000 ? "ok" : "default"} sub={splitTotal > TIMEOUT ? "times out" : "user waits"} />
        <div className="col-span-2 sm:col-span-1">
          <Stat
            label="If SMS is down"
            value={deferred.has("sms") ? "Booking OK" : "Booking fails"}
            tone={deferred.has("sms") ? "ok" : "err"}
            sub={deferred.has("sms") ? "SMS retried later" : "an SMS outage = a booking outage"}
          />
        </div>
      </div>
    </VisualFrame>
  );
}

function Bar({
  title,
  steps,
  ms,
  axis,
  total,
  enqueue,
}: {
  title: string;
  steps: typeof STEPS;
  ms: (id: StepId) => number;
  axis: number;
  total: number;
  enqueue?: boolean;
}) {
  const over = total > TIMEOUT;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-medium text-fg">{title}</p>
        <p className={cn("font-mono text-[12px] tabular-nums", over ? "text-err" : "text-muted")}>
          {fmtMs(total)}
          {over && " · timed out"}
        </p>
      </div>
      <div className="relative h-7 w-full rounded-md bg-surface-2">
        <div className="flex h-full overflow-hidden rounded-md">
          {steps.map((s) => (
            <div
              key={s.id}
              title={`${s.label}: ${fmtMs(ms(s.id))}`}
              style={{ width: `${(ms(s.id) / axis) * 100}%`, background: s.color }}
              className="h-full border-r border-surface transition-[width] duration-300"
            />
          ))}
          {enqueue && <div style={{ width: `${(ENQUEUE / axis) * 100}%` }} className="h-full min-w-[3px] bg-fg" title="Enqueue jobs: 4 ms" />}
        </div>
        <div className="absolute inset-y-[-4px] border-l-2 border-dashed border-err" style={{ left: `${(TIMEOUT / axis) * 100}%` }} aria-hidden="true" />
      </div>
    </div>
  );
}
