"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Box, Diagram, Wire } from "@/components/diagram/kit";
import { trackVisual } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Stat, VisualFrame } from "./scale-visual-parts";

const VISUAL = "gatepass-design-builder";

type Step = { name: string; time: string; body: ReactNode };

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-muted">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[12.5px] text-fg">{children}</code>
);

const STEPS: Step[] = [
  {
    name: "Requirements",
    time: "5 min",
    body: (
      <>
        <p className="text-[14px] text-fg">In scope: browse events, see the seat map, hold seats, pay, receive and scan a ticket. Parked: organiser payouts, resale, refunds.</p>
        <List
          items={[
            <>Never sell the same seat twice, even under a surge. <strong className="text-fg">Consistency beats availability</strong> for inventory.</>,
            <>A paid booking is never lost: <strong className="text-fg">durable</strong>.</>,
            <>Browsing under 300 ms at the 95th percentile. Booking can take a few seconds.</>,
            <>Spikes: popular on-sales draw many times normal traffic for a minute.</>,
          ]}
        />
      </>
    ),
  },
  {
    name: "Estimates",
    time: "5 min",
    body: (
      <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Daily views" value="10M" sub="~115/s avg, ~1k/s peak" />
          <Stat label="Bookings" value="200k/day" sub="~2/s average" />
          <Stat label="On-sale peak" value="2k/s" sub="one event, one minute" tone="warn" />
          <Stat label="Data" value="~73 GB/yr" sub="images in object storage" />
        </div>
        <p className="mt-3 text-[14px] text-fg">Consequence: average load is small and one database holds the data. The hard problem is the spike on one event.</p>
      </>
    ),
  },
  {
    name: "API",
    time: "5 min",
    body: (
      <List
        items={[
          <><Code>GET /events?city=&amp;date=</Code> list, paginated, cacheable</>,
          <><Code>GET /events/:id/seats</Code> seat map, short cache</>,
          <><Code>POST /events/:id/holds</Code> hold seats for 5 minutes, takes an idempotency key</>,
          <><Code>POST /bookings</Code> pay for a hold, idempotent</>,
          <><Code>GET /me/tickets</Code> my tickets and QR codes</>,
        ]}
      />
    ),
  },
  {
    name: "Data model",
    time: "5 min",
    body: (
      <>
        <List
          items={[
            <><Code>events</Code>, <Code>seats(event_id, seat_no, status)</Code>, <Code>holds(seat, user, expires_at)</Code>, <Code>bookings(user, hold, payment_ref)</Code>, <Code>users</Code></>,
            <>Relational database: claiming a seat and recording the booking need one transaction.</>,
            <>Unique constraint on <Code>(event_id, seat_no)</Code> in bookings is the last line of defence against double-selling.</>,
          ]}
        />
      </>
    ),
  },
  {
    name: "High-level design",
    time: "8 min",
    body: (
      <List
        items={[
          <>Client reaches a <strong className="text-fg">CDN</strong> for images and event pages, and a <strong className="text-fg">load balancer</strong> for the API.</>,
          <>Stateless API servers read through a <strong className="text-fg">cache</strong> for the event list.</>,
          <>One <strong className="text-fg">Postgres</strong> primary for seats and bookings. The numbers don&apos;t need more.</>,
        ]}
      />
    ),
  },
  {
    name: "Deep dive: the on-sale",
    time: "12 min",
    body: (
      <List
        items={[
          <>A <strong className="text-fg">waiting room</strong> admits fans to a hot event at a rate the database can take, instead of 2,000 requests a second hitting one table.</>,
          <>Seat holds live in <strong className="text-fg">Redis with a TTL</strong>; the atomic <Code>SET NX</Code> decides who gets the seat, and expiry frees it with no cleanup job.</>,
          <>Payment is slow and flaky, so it goes through a <strong className="text-fg">queue and workers</strong> with retries, backoff, idempotency keys and a dead-letter queue. Tickets and emails are produced after the booking commits.</>,
        ]}
      />
    ),
  },
  {
    name: "Wrap-up and 10x",
    time: "5 min",
    body: (
      <List
        items={[
          <><strong className="text-fg">Rate limiter</strong> at the edge by IP, and by user on booking routes.</>,
          <>At 10x: add <strong className="text-fg">read replicas</strong> for the seat map, archive old bookings, partition bookings by month. Shard by event only if one primary can&apos;t keep up with writes.</>,
          <>Watch: booking p99, seat-hold conflicts, queue depth and oldest-job age, replica lag, cache hit rate.</>,
        ]}
      />
    ),
  },
];


export function GatepassDesignBuilder() {
  const [step, setStep] = useState(0);
  const n = step + 1; // 1-based
  const go = (to: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, to));
    if (next === step) return;
    setStep(next);
    trackVisual(VISUAL);
  };
  const show = (s: number) => n >= s;
  const tone = (s: number) => (n === s ? "accent" : "default") as "accent" | "default";
  const wt = (s: number) => (n === s ? "accent" : "muted") as "accent" | "muted";

  return (
    <VisualFrame
      title="Build the Gatepass design, one step at a time"
      hint="Use Next and Back (or click a step). The picture grows as the framework moves from requirements to the finished system. The newest parts are highlighted."
    >
      <ol className="flex flex-wrap gap-1.5" aria-label="Design steps">
        {STEPS.map((s, i) => (
          <li key={s.name}>
            <button
              type="button"
              onClick={() => go(i)}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                i === step ? "border-accent bg-accent-soft text-accent" : i < step ? "border-line text-fg" : "border-line text-subtle hover:text-fg",
              )}
            >
              {i + 1}
              <span className="hidden sm:inline"> {s.name.split(":")[0]}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-medium text-fg">
            {n}. {STEPS[step].name}
          </p>
          <span className="font-mono text-[11px] text-subtle">{STEPS[step].time}</span>
        </div>
        <div className="mt-2">{STEPS[step].body}</div>
      </div>

      {n >= 5 && (
        <div className="mt-4">
          <Diagram w={680} h={310} label={`Gatepass architecture after step ${n}`}>
            {show(5) && (
              <>
                <Box x={10} y={130} label="Fans" sub="web + app" icon="client" tone={tone(5)} />
                <Box x={10} y={30} label="CDN" sub="images, pages" icon="cdn" tone={tone(5)} />
                <Box x={165} y={130} label="Load balancer" icon="lb" tone={tone(5)} />
                <Box x={340} y={130} label="API servers" sub="stateless" icon="server" tone={tone(5)} />
                <Box x={340} y={30} label="Cache" sub="event list" icon="cache" tone={tone(5)} />
                <Box x={520} y={130} label="Postgres" sub={n >= 7 ? "primary + replicas" : "seats, bookings"} icon="db" tone={n >= 7 ? "accent" : tone(5)} />
                <Wire points={[[138, 156], [165, 156]]} tone="req" />
                <Wire points={[[74, 130], [74, 82]]} tone="req" />
                <Wire points={[[293, 156], [340, 156]]} tone="req" />
                <Wire points={[[404, 130], [404, 82]]} tone={wt(5) === "accent" ? "accent" : "muted"} />
                <Wire points={[[468, 156], [520, 156]]} tone="req" />
              </>
            )}
            {show(6) && (
              <>
                <Box x={520} y={30} label="Redis" sub="seat holds, TTL" icon="cache" tone={tone(6)} />
                <Box x={165} y={230} label="Waiting room" sub="admits per event" icon="queue" tone={tone(6)} />
                <Box x={340} y={230} label="Job queue" sub="pay, ticket, email" icon="queue" tone={tone(6)} />
                <Box x={520} y={230} label="Workers" sub="retry + DLQ" icon="worker" tone={tone(6)} />
                <Wire points={[[468, 140], [500, 140], [500, 56], [520, 56]]} tone="req" />
                <Wire points={[[229, 182], [229, 230]]} tone="req" />
                <Wire points={[[293, 256], [340, 256]]} tone="req" />
                <Wire points={[[468, 256], [520, 256]]} tone="req" />
                <Wire points={[[584, 230], [584, 182]]} tone="req" />
              </>
            )}
            {show(7) && (
              <>
                <Box x={10} y={230} label="Rate limiter" sub="IP, user, route" icon="limiter" tone={tone(7)} />
                <Wire points={[[74, 182], [74, 230]]} tone="req" />
              </>
            )}
          </Diagram>
        </div>
      )}
      {n < 5 && (
        <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-subtle">
          No boxes yet. A good design starts with words and numbers; the diagram appears at step 5.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(step - 1)}
          disabled={step === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-[13px] text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40"
        >
          <ChevronLeft className="size-4" /> Back
        </button>
        <span className="font-mono text-[11px] text-subtle">
          {n} / {STEPS.length}
        </span>
        <button
          type="button"
          onClick={() => go(step + 1)}
          disabled={step === STEPS.length - 1}
          className="inline-flex items-center gap-1 rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-[13px] text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40"
        >
          Next <ChevronRight className="size-4" />
        </button>
      </div>
    </VisualFrame>
  );
}
