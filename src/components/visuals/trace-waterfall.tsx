"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Segmented, VisualFrame, useVisualTracker } from "./distributed-visual-kit";

type Span = {
  id: string;
  parent?: string;
  service: "gateway" | "booking" | "events" | "payments" | "postgres" | "bank" | "kafka";
  op: string;
  start: number;
  dur: number;
  error?: string;
  attrs?: Record<string, string>;
};

type Scenario = {
  id: string;
  label: string;
  spans: Span[];
  culprits: string[];
  why: string;
};

const svcColor: Record<Span["service"], string> = {
  gateway: "var(--fg-subtle)",
  booking: "var(--accent)",
  events: "var(--info)",
  payments: "var(--ok)",
  postgres: "var(--warn)",
  bank: "var(--res)",
  kafka: "var(--fg-muted)",
};

function base(paymentsSpans: Span[], extra: Partial<Record<string, Partial<Span>>> = {}, eventsSpans?: Span[]): Span[] {
  const end = Math.max(...paymentsSpans.map((s) => s.start + s.dur)) + 2;
  const eventsEnd = eventsSpans ? Math.max(...eventsSpans.map((s) => s.start + s.dur)) + 2 : 30;
  const shift = eventsEnd - 30;
  const pay = paymentsSpans.map((s) => ({ ...s, start: s.start + shift }));
  const payEnd = end + shift;
  const spans: Span[] = [
    { id: "gw", service: "gateway", op: "POST /bookings", start: 0, dur: payEnd + 22, attrs: { "http.status": "201" } },
    { id: "bk", parent: "gw", service: "booking", op: "CreateBooking", start: 4, dur: payEnd + 14 },
    { id: "ev", parent: "bk", service: "events", op: "GET /shows/88/seats", start: 8, dur: eventsEnd - 8 },
    ...(eventsSpans ?? [{ id: "evdb", parent: "ev", service: "postgres" as const, op: "SELECT seats", start: 12, dur: 14 }]),
    { id: "hold", parent: "bk", service: "postgres", op: "INSERT seat_hold", start: eventsEnd + 2, dur: 8 },
    ...pay,
    { id: "conf", parent: "bk", service: "postgres", op: "UPDATE booking", start: payEnd + 1, dur: 8 },
    { id: "pub", parent: "bk", service: "kafka", op: "publish booking.confirmed", start: payEnd + 10, dur: 4 },
  ];
  return spans.map((s) => ({ ...s, ...(extra[s.id] ?? {}) }));
}

const SCENARIOS: Scenario[] = [
  {
    id: "normal",
    label: "Normal",
    spans: base([
      { id: "pay", parent: "bk", service: "payments", op: "POST /charges", start: 42, dur: 128 },
      { id: "bank", parent: "pay", service: "bank", op: "gateway: authorise", start: 48, dur: 117 },
    ]),
    culprits: ["bank"],
    why: "Nothing is wrong, but the bank's authorisation is still the biggest slice. That's normal: most of a booking is waiting on the card network.",
  },
  {
    id: "slow-bank",
    label: "Slow bank",
    spans: base([
      { id: "pay", parent: "bk", service: "payments", op: "POST /charges", start: 42, dur: 2108 },
      { id: "bank", parent: "pay", service: "bank", op: "gateway: authorise", start: 48, dur: 2094, attrs: { "bank.region": "ap-south" } },
    ]),
    culprits: ["bank"],
    why: "The bank call takes over 2 seconds on its own. Payments, booking and the gateway look slow only because they wait for it: their self time is tiny.",
  },
  {
    id: "n-plus-one",
    label: "N+1 queries",
    spans: base(
      [
        { id: "pay", parent: "bk", service: "payments", op: "POST /charges", start: 42, dur: 128 },
        { id: "bank", parent: "pay", service: "bank", op: "gateway: authorise", start: 48, dur: 117 },
      ],
      {},
      Array.from({ length: 10 }, (_, i) => ({
        id: `q${i}`,
        parent: "ev",
        service: "postgres" as const,
        op: `SELECT price WHERE section='${"ABCDEFGHJK"[i]}'`,
        start: 12 + i * 58,
        dur: 54,
      })),
    ),
    culprits: ["ev", ...Array.from({ length: 10 }, (_, i) => `q${i}`)],
    why: "No single query is slow. Events runs ten nearly identical queries one after another, one per section. The staircase shape is the giveaway. One query with WHERE section IN (...) fixes it.",
  },
  {
    id: "retries",
    label: "Retry storm",
    spans: base([
      { id: "pay", parent: "bk", service: "payments", op: "POST /charges", start: 42, dur: 2226 },
      { id: "a1", parent: "pay", service: "bank", op: "authorise (try 1)", start: 48, dur: 1000, error: "timeout after 1000 ms" },
      { id: "a2", parent: "pay", service: "bank", op: "authorise (try 2)", start: 1068, dur: 1000, error: "timeout after 1000 ms" },
      { id: "a3", parent: "pay", service: "bank", op: "authorise (try 3)", start: 2088, dur: 170 },
    ]),
    culprits: ["a1", "a2"],
    why: "Two attempts hit the 1-second timeout before the third succeeded. Each retry is visible as its own span, in red. Without tracing this looks like 'payments is slow'; with it you can see the timeouts, and ask whether the bank charged twice.",
  },
  {
    id: "self-time",
    label: "Missing span",
    spans: base(
      [
        { id: "pay", parent: "bk", service: "payments", op: "POST /charges", start: 42, dur: 128 },
        { id: "bank", parent: "pay", service: "bank", op: "gateway: authorise", start: 48, dur: 117 },
      ],
      {},
    ).map((s) => {
      if (s.id === "conf") return { ...s, start: s.start + 640 };
      if (s.id === "pub") return { ...s, start: s.start + 640 };
      if (s.id === "bk") return { ...s, dur: s.dur + 640, attrs: { note: "renders ticket PDF inline" } };
      if (s.id === "gw") return { ...s, dur: s.dur + 640 };
      return s;
    }),
    culprits: ["bk"],
    why: "There's a 640 ms gap inside booking where none of its children run. That's self time: work booking does itself without a span, here rendering the ticket PDF before replying. Gaps between child spans are as telling as long spans.",
  },
];

function selfTime(span: Span, spans: Span[]) {
  const kids = spans
    .filter((s) => s.parent === span.id)
    .map((s) => [Math.max(s.start, span.start), Math.min(s.start + s.dur, span.start + span.dur)] as const)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cur = -Infinity;
  let curEnd = -Infinity;
  for (const [a, b] of kids) {
    if (a > curEnd) {
      if (curEnd > cur) covered += curEnd - cur;
      cur = a;
      curEnd = b;
    } else curEnd = Math.max(curEnd, b);
  }
  if (curEnd > cur) covered += curEnd - cur;
  return Math.max(0, span.dur - covered);
}

function depth(span: Span, byId: Map<string, Span>) {
  let d = 0;
  let p = span.parent;
  while (p) {
    d++;
    p = byId.get(p)?.parent;
  }
  return d;
}

function ms(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
}

export function TraceWaterfall() {
  const t = useVisualTracker("trace-waterfall");
  const [scenarioId, setScenarioId] = useState("slow-bank");
  const [selected, setSelected] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{ id: string; ok: boolean } | null>(null);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const { spans, total, byId } = useMemo(() => {
    const byId = new Map(scenario.spans.map((s) => [s.id, s]));
    // Order depth-first so children sit under their parent.
    const ordered: Span[] = [];
    const walk = (parent?: string) => {
      scenario.spans
        .filter((s) => s.parent === parent)
        .sort((a, b) => a.start - b.start)
        .forEach((s) => {
          ordered.push(s);
          walk(s.id);
        });
    };
    walk(undefined);
    const total = Math.max(...scenario.spans.map((s) => s.start + s.dur));
    return { spans: ordered, total, byId };
  }, [scenario]);

  const sel = selected ? byId.get(selected) : undefined;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * total);

  return (
    <VisualFrame
      eyebrow="Try it · read a trace"
      title="Trace of one POST /bookings"
      hint="Each bar is a span: one unit of work in one service. Pick a scenario, click spans to inspect them, then blame the one that made this booking slow."
    >
      <Segmented
        label="Scenario"
        size="sm"
        value={scenarioId}
        onChange={(v) => {
          setScenarioId(v);
          setSelected(null);
          setVerdict(null);
          t("scenario", v);
        }}
        options={SCENARIOS.map((s) => ({ value: s.id, label: s.label }))}
      />

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-bg">
        <div className="flex border-b border-line font-mono text-[10px] text-subtle">
          <div className="hidden w-[34%] shrink-0 px-2 py-1.5 sm:block">span</div>
          <div className="relative mr-3 ml-2 flex-1 py-1.5 sm:ml-0">
            {ticks.map((v, i) => (
              <span
                key={i}
                className={cn("absolute top-1.5 whitespace-nowrap", (i === 1 || i === 3) && "hidden sm:inline")}
                style={{ left: `${(v / total) * 100}%`, transform: i === 0 ? "none" : i === 4 ? "translateX(-100%)" : "translateX(-50%)" }}
              >
                {ms(v)}
              </span>
            ))}
            &nbsp;
          </div>
        </div>
        <div role="listbox" aria-label="Spans">
          {spans.map((s) => {
            const d = depth(s, byId);
            const active = s.id === selected;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setSelected(s.id);
                  setVerdict(null);
                  t("span", s.id);
                }}
                className={cn(
                  "flex w-full flex-col text-left outline-none focus-visible:bg-surface-3 sm:flex-row sm:items-center",
                  active ? "bg-surface-3" : "hover:bg-surface-2",
                )}
              >
                <span
                  className="w-full shrink-0 truncate pt-1 pr-2 text-[11.5px] sm:w-[34%] sm:py-1 sm:text-[12px]"
                  style={{ paddingLeft: 8 + d * 8 }}
                >
                  <span className="font-medium" style={{ color: svcColor[s.service] }}>
                    {s.service}
                  </span>{" "}
                  <span className="text-muted">{s.op}</span>
                </span>
                <span className="relative mr-3 ml-2 block h-5 sm:ml-0 sm:h-6 sm:flex-1">
                  <span
                    className={cn("absolute top-1 h-3 rounded-[3px] sm:top-1.5", s.error && "ring-1 ring-err")}
                    style={{
                      left: `${(s.start / total) * 100}%`,
                      width: `max(2px, ${(s.dur / total) * 100}%)`,
                      background: s.error ? "var(--err)" : svcColor[s.service],
                      opacity: active ? 1 : 0.75,
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 min-h-[118px] rounded-xl border border-line bg-surface-2 p-3 text-[13px]">
        {sel ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-fg">
                <span style={{ color: svcColor[sel.service] }}>{sel.service}</span> · {sel.op}
              </p>
              <button
                type="button"
                onClick={() => {
                  const ok = scenario.culprits.includes(sel.id);
                  setVerdict({ id: sel.id, ok });
                  t(`blame:${scenario.id}`, ok);
                }}
                className="rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                Blame this span
              </button>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11.5px]">
              <div>
                <dt className="text-subtle">starts</dt>
                <dd className="text-fg">{ms(sel.start)}</dd>
              </div>
              <div>
                <dt className="text-subtle">duration</dt>
                <dd className="text-fg">{ms(sel.dur)}</dd>
              </div>
              <div>
                <dt className="text-subtle">self time</dt>
                <dd className="text-fg">{ms(selfTime(sel, scenario.spans))}</dd>
              </div>
            </dl>
            {(sel.error || sel.attrs) && (
              <p className="mt-2 font-mono text-[11.5px] text-muted">
                {sel.error && <span className="text-err">error: {sel.error} </span>}
                {sel.attrs &&
                  Object.entries(sel.attrs)
                    .map(([k, v]) => `${k}=${v}`)
                    .join("  ")}
              </p>
            )}
            {verdict?.id === sel.id && (
              <p role="status" className={cn("mt-2 leading-relaxed", verdict.ok ? "text-fg" : "text-muted")}>
                <span className={cn("font-semibold", verdict.ok ? "text-ok" : "text-err")}>
                  {verdict.ok ? "Found it. " : "Not this one. "}
                </span>
                {verdict.ok
                  ? scenario.why
                  : "Look at self time, not duration: a parent is long whenever its children are. Find where the time is actually spent."}
              </p>
            )}
          </>
        ) : (
          <p className="text-subtle">
            Total {ms(total)}. Click a span to see its duration and its <strong className="text-muted">self time</strong>, the part not
            covered by its children.
          </p>
        )}
      </div>
    </VisualFrame>
  );
}
