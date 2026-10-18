"use client";

import { useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisualButton, VisualShell, useVisualTracker } from "./visual-shell";

type Ev =
  | { type: "SeatHeld"; seat: string; at: number }
  | { type: "SeatReleased"; seat: string; at: number }
  | { type: "PaymentCaptured"; amount: number; at: number }
  | { type: "TicketIssued"; at: number }
  | { type: "BookingCancelled"; at: number }
  | { type: "RefundIssued"; amount: number; at: number };

type Booking = {
  status: "empty" | "holding" | "paid" | "ticketed" | "cancelled" | "refunded";
  seats: string[];
  paid: number;
  refunded: number;
};

const PRICE = 900;
const START = 10 * 3600 + 41 * 60; // 10:41:00

const SEED: Ev[] = [
  { type: "SeatHeld", seat: "A12", at: START + 2 },
  { type: "SeatHeld", seat: "A13", at: START + 5 },
  { type: "SeatReleased", seat: "A13", at: START + 40 },
  { type: "SeatHeld", seat: "A14", at: START + 52 },
  { type: "PaymentCaptured", amount: 1800, at: START + 90 },
  { type: "TicketIssued", at: START + 91 },
];

const EMPTY: Booking = { status: "empty", seats: [], paid: 0, refunded: 0 };

/** The whole model: current state is a left fold over the events. */
function apply(b: Booking, e: Ev): Booking {
  switch (e.type) {
    case "SeatHeld":
      return { ...b, status: "holding", seats: [...b.seats, e.seat] };
    case "SeatReleased":
      return { ...b, seats: b.seats.filter((s) => s !== e.seat), status: b.seats.length > 1 ? "holding" : "empty" };
    case "PaymentCaptured":
      return { ...b, status: "paid", paid: b.paid + e.amount };
    case "TicketIssued":
      return { ...b, status: "ticketed" };
    case "BookingCancelled":
      return { ...b, status: "cancelled" };
    case "RefundIssued":
      return { ...b, status: "refunded", refunded: b.refunded + e.amount };
  }
}

const fold = (evs: Ev[]) => evs.reduce(apply, EMPTY);

const clock = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");

function describe(e: Ev) {
  switch (e.type) {
    case "SeatHeld":
    case "SeatReleased":
      return `seat: ${e.seat}`;
    case "PaymentCaptured":
    case "RefundIssued":
      return `amount: ₹${e.amount.toLocaleString("en-IN")}`;
    default:
      return "";
  }
}

const SEATS = ["A12", "A13", "A14", "A15", "A16"];

export function EventSourcingReplay() {
  const t = useVisualTracker("event-sourcing");
  const [events, setEvents] = useState<Ev[]>(SEED);
  const [cursor, setCursor] = useState(SEED.length);
  const [snapshots, setSnapshots] = useState(false);

  const head = fold(events);
  const view = fold(events.slice(0, cursor));
  const atHead = cursor === events.length;
  const lastAt = events.length ? events[events.length - 1].at : START;
  const snapAt = snapshots ? Math.floor(cursor / 4) * 4 : 0;
  const replayed = cursor - snapAt;

  const nextSeat = SEATS.find((s) => !head.seats.includes(s) && !events.some((e) => e.type === "SeatHeld" && e.seat === s));
  const open = head.status === "empty" || head.status === "holding";
  const commands: { label: string; ev: Ev | null }[] = [
    { label: "Hold seat", ev: open && nextSeat && head.seats.length < 4 ? { type: "SeatHeld", seat: nextSeat, at: lastAt + 13 } : null },
    {
      label: "Release seat",
      ev: open && head.seats.length ? { type: "SeatReleased", seat: head.seats[head.seats.length - 1], at: lastAt + 9 } : null,
    },
    { label: "Pay", ev: head.status === "holding" ? { type: "PaymentCaptured", amount: head.seats.length * PRICE, at: lastAt + 31 } : null },
    { label: "Issue ticket", ev: head.status === "paid" ? { type: "TicketIssued", at: lastAt + 1 } : null },
    { label: "Cancel", ev: head.status === "paid" || head.status === "ticketed" ? { type: "BookingCancelled", at: lastAt + 3600 } : null },
    { label: "Refund", ev: head.status === "cancelled" ? { type: "RefundIssued", amount: head.paid, at: lastAt + 120 } : null },
  ];

  function append(ev: Ev) {
    t("append", ev.type);
    setEvents((es) => [...es, ev]);
    setCursor(events.length + 1);
  }

  return (
    <VisualShell
      title="One booking, stored as events"
      hint="Append events with the commands, then drag the slider back in time. The state on the right is rebuilt from the log every time."
    >
      <div className="flex flex-wrap gap-1.5">
        {commands.map((c) => (
          <VisualButton key={c.label} onClick={() => c.ev && append(c.ev)} disabled={!c.ev}>
            <Plus className="size-3" /> {c.label}
          </VisualButton>
        ))}
        <VisualButton
          onClick={() => {
            t("reset", true);
            setEvents(SEED);
            setCursor(SEED.length);
          }}
          title="Reset"
          className="ml-auto"
        >
          <RotateCcw className="size-3.5" />
          <span className="sr-only">Reset</span>
        </VisualButton>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1.35fr_1fr]">
        <div className="rounded-xl border border-line bg-bg p-2">
          <p className="px-1 pb-1.5 font-mono text-[10px] tracking-wider text-subtle uppercase">
            Event store · booking b_8812 · append-only
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {events.map((e, i) => {
              const applied = i < cursor;
              const fromSnap = snapshots && i < snapAt;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-opacity",
                    applied ? "border-line bg-surface-2" : "border-dashed border-line opacity-40",
                  )}
                >
                  <span className="w-5 font-mono text-[10.5px] text-subtle">{i + 1}</span>
                  <span className={cn("font-mono text-[12px] font-semibold", e.type.includes("Cancel") || e.type.includes("Released") ? "text-warn" : e.type.includes("Refund") ? "text-info" : "text-res")}>
                    {e.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">{describe(e)}</span>
                  {fromSnap && applied ? (
                    <span className="font-mono text-[9.5px] text-info uppercase">in snapshot</span>
                  ) : (
                    <span className="font-mono text-[10.5px] text-subtle">{clock(e.at)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">
            State {atHead ? "now" : `as of ${cursor ? clock(events[cursor - 1].at) : "the start"}`}
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            <dt className="text-subtle">Status</dt>
            <dd className="font-mono font-semibold text-fg">{view.status}</dd>
            <dt className="text-subtle">Seats</dt>
            <dd className="font-mono text-fg">{view.seats.length ? view.seats.join(", ") : "–"}</dd>
            <dt className="text-subtle">Paid</dt>
            <dd className="font-mono text-fg">₹{view.paid.toLocaleString("en-IN")}</dd>
            <dt className="text-subtle">Refunded</dt>
            <dd className="font-mono text-fg">₹{view.refunded.toLocaleString("en-IN")}</dd>
          </dl>
          <p className="mt-3 font-mono text-[11px] text-subtle">
            rebuilt by applying {replayed} event{replayed === 1 ? "" : "s"}
            {snapshots && snapAt > 0 ? ` on top of snapshot @${snapAt}` : " from empty"}
          </p>
          {!atHead && <p className="mt-2 text-[12px] text-info">Time travel: this is exactly what the booking looked like then. Nothing was stored for this moment.</p>}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="es-cursor" className="flex items-center justify-between text-[12.5px] text-muted">
          <span>Replay up to event</span>
          <span className="font-mono text-fg">
            {cursor} / {events.length}
          </span>
        </label>
        <input
          id="es-cursor"
          type="range"
          min={0}
          max={events.length}
          value={cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
          onPointerUp={() => t("cursor", cursor)}
          onKeyUp={() => t("cursor", cursor)}
          className="mt-1 w-full accent-[var(--accent)]"
        />
        <label className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
          <input
            type="checkbox"
            checked={snapshots}
            onChange={(e) => {
              t("snapshots", e.target.checked);
              setSnapshots(e.target.checked);
            }}
            className="size-3.5 accent-[var(--accent)]"
          />
          Take a snapshot every 4 events
        </label>
      </div>
    </VisualShell>
  );
}
