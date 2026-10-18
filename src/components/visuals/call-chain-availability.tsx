"use client";

import { useState } from "react";
import { ArrowDown, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { Segmented, Stat, VisualFrame, useVisualTracker, type StatTone } from "./distributed-visual-kit";

type Mode = "sync" | "async";

type Svc = {
  id: string;
  name: string;
  job: string;
  ms: number;
  /** Must the booking wait for this service even in async mode? */
  critical: boolean;
};

const SERVICES: Svc[] = [
  { id: "booking", name: "Booking", job: "creates the booking", ms: 15, critical: true },
  { id: "events", name: "Events", job: "checks the seat is still on sale", ms: 20, critical: true },
  { id: "payments", name: "Payments", job: "charges the card", ms: 250, critical: true },
  { id: "notifications", name: "Notifications", job: "emails and texts the ticket", ms: 400, critical: false },
  { id: "analytics", name: "Analytics", job: "records the sale", ms: 30, critical: false },
];

const LEVELS = [99, 99.5, 99.9, 99.95, 99.99];
const BROKER = 99.95;
const PUBLISH_MS = 5;
const MONTH_MIN = 30 * 24 * 60;

function pct(a: number) {
  const p = a * 100;
  if (p >= 99.995) return p.toFixed(3) + "%";
  return p.toFixed(2) + "%";
}

function downtime(a: number) {
  const m = (1 - a) * MONTH_MIN;
  if (m < 60) return `${Math.round(m)} min/month`;
  return `${(m / 60).toFixed(1)} h/month`;
}

export function CallChainAvailability() {
  const t = useVisualTracker("call-chain-availability");
  const [mode, setMode] = useState<Mode>("sync");
  const [avail, setAvail] = useState<Record<string, number>>(() =>
    Object.fromEntries(SERVICES.map((s) => [s.id, 99.9])),
  );
  const [down, setDown] = useState<Record<string, boolean>>({});

  const waitsFor = (s: Svc) => mode === "sync" || s.critical;
  const inPath = SERVICES.filter(waitsFor);

  let a = inPath.reduce((acc, s) => acc * (avail[s.id] / 100), 1);
  if (mode === "async") a *= BROKER / 100;
  const latency = inPath.reduce((acc, s) => acc + s.ms, 0) + (mode === "async" ? PUBLISH_MS : 0);
  const failedPer100k = Math.round((1 - a) * 100_000);

  const downPath = inPath.filter((s) => down[s.id]);
  const downAside = SERVICES.filter((s) => !waitsFor(s) && down[s.id]);

  let verdict: { tone: StatTone; text: string };
  if (downPath.length) {
    verdict = {
      tone: "err",
      text: `Every booking fails. ${downPath.map((s) => s.name).join(" and ")} ${downPath.length > 1 ? "are" : "is"} down, and the booking waits for ${downPath.length > 1 ? "them" : "it"}.`,
    };
  } else if (downAside.length) {
    verdict = {
      tone: "ok",
      text: `Bookings still succeed. Events for ${downAside.map((s) => s.name).join(" and ")} pile up in the broker and are delivered when ${downAside.length > 1 ? "they recover" : "it recovers"}.`,
    };
  } else {
    verdict = { tone: "default", text: "Everything is up. Click a power button to take a service down." };
  }

  return (
    <VisualFrame
      eyebrow="Try it · availability multiplies"
      title="One booking, five services"
      hint="Set each service's availability, switch between a synchronous chain and events, and knock services over."
    >
      <Segmented<Mode>
        label="Communication style"
        value={mode}
        onChange={(m) => {
          setMode(m);
          t("mode", m);
        }}
        options={[
          { value: "sync", label: "Sync: wait for everyone" },
          { value: "async", label: "Async: publish an event" },
        ]}
      />

      <div role="list" className="mt-4 space-y-1.5">
        {SERVICES.map((s, i) => {
          const waits = waitsFor(s);
          const isDown = !!down[s.id];
          return (
            <div role="listitem" key={s.id}>
              {mode === "async" && i === 3 && (
                <div className="my-2 flex items-center gap-2 rounded-xl border border-dashed border-info/50 px-3 py-2 text-[12.5px] text-info">
                  <ArrowDown className="size-3.5 shrink-0" />
                  <span>
                    Booking publishes <code className="font-mono">booking.confirmed</code> to the broker ({BROKER}%) and
                    returns. These two read it later.
                  </span>
                </div>
              )}
              <div
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2",
                  isDown ? "border-err/40 bg-err/5" : waits ? "border-line bg-surface-2" : "border-dashed border-line bg-bg",
                )}
              >
                <button
                  type="button"
                  aria-pressed={isDown}
                  aria-label={`${isDown ? "Bring up" : "Take down"} ${s.name}`}
                  disabled={s.id === "booking"}
                  onClick={() => {
                    setDown((d) => ({ ...d, [s.id]: !isDown }));
                    t(`down:${s.id}`, !isDown);
                  }}
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-30",
                    isDown ? "border-err/50 text-err" : "border-line text-ok hover:border-line-strong",
                  )}
                >
                  <Power className="size-3.5" />
                </button>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-[14px] font-medium text-fg">
                    {s.name}{" "}
                    <span className="font-mono text-[11px] font-normal text-subtle">
                      {s.ms} ms · {waits ? "booking waits" : "async"}
                    </span>
                  </p>
                  <p className="text-[12.5px] text-subtle">{s.job}</p>
                </div>
                <label className="flex items-center gap-2 text-[12px] text-muted">
                  <span className="sr-only">{s.name} availability</span>
                  <select
                    value={avail[s.id]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setAvail((x) => ({ ...x, [s.id]: v }));
                      t(`availability:${s.id}`, v);
                    }}
                    className="rounded-lg border border-line bg-bg px-2 py-1 font-mono text-[12.5px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat
          label="End-to-end"
          value={pct(a)}
          tone={a >= 0.999 ? "ok" : a >= 0.995 ? "warn" : "err"}
          sub={`≈ ${downtime(a)} of failed bookings`}
        />
        <Stat label="User waits" value={`${latency} ms`} sub={mode === "sync" ? "sum of every hop" : "only the critical path"} />
        <Stat
          className="col-span-2 sm:col-span-1"
          label="Failed per 100k"
          value={failedPer100k.toLocaleString("en-US")}
          sub="bookings, from availability alone"
        />
      </div>

      <p
        role="status"
        className={cn(
          "mt-3 rounded-xl border px-3 py-2.5 text-[13.5px] leading-relaxed",
          verdict.tone === "err" && "border-err/30 bg-err/5 text-fg",
          verdict.tone === "ok" && "border-ok/30 bg-ok/5 text-fg",
          verdict.tone === "default" && "border-line text-muted",
        )}
      >
        {verdict.text}
      </p>
    </VisualFrame>
  );
}
