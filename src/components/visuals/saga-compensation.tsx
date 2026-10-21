"use client";

import { useEffect, useReducer } from "react";
import { ArrowDown, Check, Pause, Play, RotateCcw, StepForward, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Segmented, VisualButton, VisualShell, useVisualTracker } from "./visual-shell";

type Status = "pending" | "done" | "failed" | "compensated" | "retrying";
type Phase = "idle" | "forward" | "compensating" | "completed" | "rolled-back";
type Fail = "none" | "charge" | "ticket" | "notify";

const STEPS = [
  { name: "Hold seats A12, A13", service: "Seats", undo: "Release seats" },
  { name: "Charge ₹1,800", service: "Payments", undo: "Refund ₹1,800" },
  { name: "Issue ticket", service: "Tickets", undo: "Void ticket" },
  { name: "Send confirmation", service: "Notifications", undo: null },
] as const;

const FAIL_AT: Record<Fail, number> = { none: -1, charge: 1, ticket: 2, notify: 3 };

type World = { seat: "free" | "held" | "sold"; card: "not charged" | "charged" | "refunded"; ticket: "none" | "issued" | "void"; fan: string };

type State = {
  fail: Fail;
  flakyRefund: boolean;
  phase: Phase;
  idx: number;
  steps: Status[];
  refundTries: number;
  notifyRetried: boolean;
  running: boolean;
  world: World;
  log: { text: string; tone: "fg" | "ok" | "err" | "warn" | "info" }[];
};

const initial = (fail: Fail = "charge", flakyRefund = false): State => ({
  fail,
  flakyRefund,
  phase: "idle",
  idx: 0,
  steps: ["pending", "pending", "pending", "pending"],
  refundTries: 0,
  notifyRetried: false,
  running: false,
  world: { seat: "free", card: "not charged", ticket: "none", fan: "Booking…" },
  log: [{ text: "Saga b_8812 created. The orchestrator records each step in its saga log before moving on.", tone: "fg" }],
});

function apply(w: World, i: number, undo: boolean): World {
  if (!undo) {
    if (i === 0) return { ...w, seat: "held" };
    if (i === 1) return { ...w, card: "charged" };
    if (i === 2) return { ...w, ticket: "issued", seat: "sold" };
    return { ...w, fan: "Booked! Ticket in inbox" };
  }
  if (i === 0) return { ...w, seat: "free" };
  if (i === 1) return { ...w, card: "refunded" };
  if (i === 2) return { ...w, ticket: "void", seat: "held" };
  return w;
}

function step(s: State): State {
  const log = [...s.log];
  const steps = [...s.steps];
  let { idx, phase, world, refundTries, notifyRetried } = s;
  if (phase === "completed" || phase === "rolled-back") return { ...s, running: false };
  if (phase === "idle") phase = "forward";

  if (phase === "forward") {
    if (idx === FAIL_AT[s.fail]) {
      if (idx === 3 && !notifyRetried) {
        notifyRetried = true;
        steps[idx] = "retrying";
        log.push({ text: "Send confirmation failed (SMS provider timeout). This step comes after the point of no return, so the saga retries it instead of undoing.", tone: "warn" });
        return { ...s, steps, log, notifyRetried, phase };
      }
      if (idx < 3) {
        steps[idx] = "failed";
        log.push({
          text: idx === 1 ? "Charge failed: card declined. Start compensating the steps that already succeeded, newest first." : "Issue ticket failed: tickets service is down after retries. Compensate backwards.",
          tone: "err",
        });
        return { ...s, steps, log, idx: idx - 1, phase: "compensating" };
      }
    }
    steps[idx] = "done";
    world = apply(world, idx, false);
    log.push({ text: `${STEPS[idx].service}: ${STEPS[idx].name} ✓ (local transaction committed)`, tone: "ok" });
    idx++;
    if (idx === STEPS.length) {
      log.push({ text: "Saga completed. Every local transaction committed.", tone: "ok" });
      return { ...s, steps, log, idx, phase: "completed", world, notifyRetried, running: false };
    }
    return { ...s, steps, log, idx, phase, world, notifyRetried };
  }

  // compensating
  if (idx < 0) {
    world = { ...world, fan: "Booking failed. You were not charged." };
    log.push({ text: "Saga rolled back. Every completed step has been compensated.", tone: "info" });
    return { ...s, phase: "rolled-back", world, log, running: false };
  }
  if (idx === 1 && s.flakyRefund && refundTries === 0) {
    refundTries++;
    log.push({ text: "Refund timed out. Retrying with the same idempotency key, so the fan can't be refunded twice.", tone: "warn" });
    return { ...s, refundTries, log };
  }
  steps[idx] = "compensated";
  world = apply(world, idx, true);
  log.push({ text: `${STEPS[idx].service}: ${STEPS[idx].undo} ↩`, tone: "info" });
  return { ...s, steps, log, world, idx: idx - 1 };
}

type Action = { type: "step" } | { type: "run"; running: boolean } | { type: "fail"; fail: Fail } | { type: "flaky"; on: boolean } | { type: "reset" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "step":
      return step(s);
    case "run":
      return { ...(s.phase === "completed" || s.phase === "rolled-back" ? initial(s.fail, s.flakyRefund) : s), running: a.running };
    case "fail":
      return initial(a.fail, s.flakyRefund);
    case "flaky":
      return initial(s.fail, a.on);
    case "reset":
      return initial(s.fail, s.flakyRefund);
  }
}

const STATUS_STYLE: Record<Status, string> = {
  pending: "border-line text-subtle",
  done: "border-ok/50 bg-ok/10 text-fg",
  failed: "border-err/60 bg-err/10 text-fg",
  compensated: "border-info/50 bg-info/10 text-fg",
  retrying: "border-warn/60 bg-warn/10 text-fg",
};

export function SagaCompensation() {
  const t = useVisualTracker("saga-compensation");
  const [s, dispatch] = useReducer(reducer, undefined, () => initial());

  useEffect(() => {
    if (!s.running) return;
    const id = setInterval(() => dispatch({ type: "step" }), 1000);
    return () => clearInterval(id);
  }, [s.running]);

  const over = s.phase === "completed" || s.phase === "rolled-back";

  return (
    <VisualShell
      title="A booking saga with undo steps"
      hint="Pick what fails, then run the saga. Completed steps are compensated in reverse order. Watch what the rest of the system sees in between."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10.5px] tracking-wider text-subtle uppercase">Inject</span>
        <Segmented
          label="Failure to inject"
          value={s.fail}
          onChange={(v) => {
            t();
            dispatch({ type: "fail", fail: v });
          }}
          options={[
            { value: "none", label: "Nothing" },
            { value: "charge", label: "Card declined" },
            { value: "ticket", label: "Tickets down" },
            { value: "notify", label: "SMS timeout" },
          ]}
        />
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          <input
            type="checkbox"
            checked={s.flakyRefund}
            onChange={(e) => {
              t();
              dispatch({ type: "flaky", on: e.target.checked });
            }}
            className="size-3.5 accent-[var(--accent)]"
          />
          Refund times out once
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1.3fr_1fr]">
        <div className="grid gap-1.5" role="list" aria-label="Saga steps">
          {STEPS.map((st, i) => {
            const status = s.steps[i];
            const active = !over && s.phase !== "idle" && s.idx === i;
            return (
              <div key={st.name} role="listitem">
                <div
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors",
                    STATUS_STYLE[status],
                    active && "ring-2 ring-accent/50",
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border border-current font-mono text-[10.5px]">
                    {status === "done" ? (
                      <Check className="size-3.5 text-ok" />
                    ) : status === "failed" ? (
                      <X className="size-3.5 text-err" />
                    ) : status === "compensated" ? (
                      <Undo2 className="size-3.5 text-info" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{st.name}</p>
                    <p className="font-mono text-[10.5px] text-subtle">
                      {st.service} · undo: {st.undo ?? "none (retry instead)"}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-subtle uppercase">{status === "pending" ? "" : status}</span>
                </div>
                {i === 2 && (
                  <p className="my-1 flex items-center gap-1.5 pl-3 font-mono text-[10px] tracking-wider text-warn uppercase">
                    <ArrowDown className="size-3" /> point of no return
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">What everyone else sees right now</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            <dt className="text-subtle">Seat A12</dt>
            <dd className={cn("font-mono", s.world.seat === "held" ? "text-warn" : s.world.seat === "sold" ? "text-ok" : "text-fg")}>{s.world.seat}</dd>
            <dt className="text-subtle">Card</dt>
            <dd className={cn("font-mono", s.world.card === "charged" ? "text-warn" : "text-fg")}>{s.world.card}</dd>
            <dt className="text-subtle">Ticket</dt>
            <dd className="font-mono text-fg">{s.world.ticket}</dd>
            <dt className="text-subtle">Fan&apos;s screen</dt>
            <dd className="text-fg">{s.world.fan}</dd>
          </dl>
          {s.world.seat === "held" && !over && (
            <p className="mt-2 text-[12px] text-warn">Other fans see A12 as taken, even though this booking might still be undone.</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <VisualButton
          tone="accent"
          onClick={() => {
            t();
            dispatch({ type: "run", running: !s.running });
          }}
        >
          {s.running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {s.running ? "Pause" : over ? "Run again" : "Run"}
        </VisualButton>
        <VisualButton
          onClick={() => {
            t();
            dispatch({ type: "step" });
          }}
          disabled={s.running || over}
        >
          <StepForward className="size-3.5" /> Step
        </VisualButton>
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

      <div className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-line bg-bg px-3 py-2" aria-live="polite">
        <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">Saga log</p>
        {s.log.map((l, i) => (
          <p
            key={i}
            className={cn(
              "text-[12.5px] leading-relaxed",
              l.tone === "ok" && "text-ok",
              l.tone === "err" && "text-err",
              l.tone === "warn" && "text-warn",
              l.tone === "info" && "text-info",
              l.tone === "fg" && "text-muted",
            )}
          >
            {l.text}
          </p>
        ))}
      </div>
    </VisualShell>
  );
}
