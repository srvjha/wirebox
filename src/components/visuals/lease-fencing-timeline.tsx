"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider, Toggle, VisualFrame, useVisualTracker } from "./distributed-visual-kit";

type Lane = "A" | "B" | "lock" | "db";
type Ev = { t: number; lane: Lane; text: string; tone: "default" | "ok" | "warn" | "err" | "info" };

const LANES: { id: Lane; label: string }[] = [
  { id: "A", label: "Worker A" },
  { id: "B", label: "Worker B" },
  { id: "lock", label: "Lock service" },
  { id: "db", label: "Seats DB" },
];

const toneVar = { default: "var(--fg-muted)", ok: "var(--ok)", warn: "var(--warn)", err: "var(--err)", info: "var(--info)" };

function simulate(ttl: number, pause: number, fencing: boolean) {
  const ev: Ev[] = [];
  const PAUSE_AT = 2.5;
  const wake = PAUSE_AT + pause;
  ev.push({ t: 0, lane: "lock", text: "Grants A the lock, lease " + ttl + " s, token 33", tone: "info" });
  ev.push({ t: 1, lane: "A", text: "Reads seat C14: free", tone: "default" });
  if (pause > 0) ev.push({ t: PAUSE_AT, lane: "A", text: `Freezes: GC pause of ${pause} s`, tone: "warn" });

  let outcome: { tone: "ok" | "err"; title: string; text: string };
  let aLeaseEnd: number;
  let bAcq: number;
  const bAsk = 3;

  if (wake < ttl) {
    // A wakes while its lease is still valid.
    ev.push({ t: wake, lane: "A", text: "Writes C14 → fan A (token 33)", tone: "default" });
    ev.push({ t: wake, lane: "db", text: "Accepts token 33. C14 sold to fan A", tone: "ok" });
    aLeaseEnd = wake + 0.5;
    ev.push({ t: aLeaseEnd, lane: "A", text: "Releases the lock", tone: "default" });
    if (aLeaseEnd > bAsk) ev.push({ t: bAsk, lane: "B", text: "Asks for the lock: held by A, waits", tone: "default" });
    bAcq = Math.max(bAsk, aLeaseEnd);
    ev.push({ t: bAcq, lane: "lock", text: "Grants B the lock, token 34", tone: "info" });
    ev.push({ t: bAcq + 0.5, lane: "B", text: "Reads C14: sold. Offers fan B another seat", tone: "ok" });
    outcome = {
      tone: "ok",
      title: "Safe",
      text: "A finished inside its lease. The lock did its job: B only ran after A was done.",
    };
  } else {
    aLeaseEnd = ttl;
    ev.push({ t: bAsk, lane: "B", text: "Asks for the lock: held by A, waits", tone: "default" });
    ev.push({ t: ttl, lane: "lock", text: "A's lease expires. Grants B the lock, token 34", tone: "warn" });
    bAcq = ttl;
    ev.push({ t: ttl + 0.2, lane: "B", text: "Reads C14: free. Writes C14 → fan B (token 34)", tone: "default" });
    ev.push({ t: ttl + 0.2, lane: "db", text: "Accepts token 34. C14 sold to fan B", tone: "ok" });
    ev.push({ t: wake, lane: "A", text: "Wakes up, still thinks it holds the lock. Writes C14 → fan A (token 33)", tone: "warn" });
    if (fencing) {
      ev.push({ t: wake, lane: "db", text: "Rejects token 33: already saw 34", tone: "ok" });
      outcome = {
        tone: "ok",
        title: "Saved by the fencing token",
        text: "A's lease expired during its pause and B took over. A's late write carried an old token, so the database refused it. A gets an error and tells fan A the seat is gone.",
      };
    } else {
      ev.push({ t: wake, lane: "db", text: "Accepts. C14 overwritten → fan A", tone: "err" });
      outcome = {
        tone: "err",
        title: "Double sold",
        text: "A's lease expired while it was frozen, so B legitimately took the lock and sold C14. Then A woke up and overwrote it. Both fans were charged; the database says fan A, fan B's ticket is for a seat they don't have.",
      };
    }
  }
  ev.sort((a, b) => a.t - b.t);
  const end = Math.max(...ev.map((e) => e.t)) + 3;
  return { ev, end, wake, aLeaseEnd, bAcq, outcome, PAUSE_AT };
}

export function LeaseFencingTimeline() {
  const tr = useVisualTracker("lease-fencing-timeline");
  const [ttl, setTtl] = useState(10);
  const [pause, setPause] = useState(15);
  const [fencing, setFencing] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const sim = useMemo(() => simulate(ttl, pause, fencing), [ttl, pause, fencing]);
  const now = cursor ?? sim.end;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCursor((c) => {
        const next = (c ?? 0) + 0.25;
        if (next >= sim.end) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, 50);
    return () => clearInterval(id);
  }, [playing, sim.end]);

  const x = (t: number) => `${(Math.min(t, sim.end) / sim.end) * 100}%`;
  const w = (a: number, b: number) => `${((Math.min(b, sim.end) - a) / sim.end) * 100}%`;
  const reset = () => {
    setPlaying(false);
    setCursor(null);
  };

  return (
    <VisualFrame
      eyebrow="Try it · leases and fencing"
      title="Two workers, one lock, the last seat"
      hint="Worker A takes the lock, then freezes. Make the pause longer than the lease and watch what happens when it wakes up. Then turn on fencing tokens."
    >
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Slider
          label="Lease length"
          value={ttl}
          min={5}
          max={30}
          onChange={(v) => {
            setTtl(v);
            reset();
          }}
          onCommit={tr}
          format={(v) => `${v} s`}
        />
        <Slider
          label="A's pause"
          value={pause}
          min={0}
          max={40}
          onChange={(v) => {
            setPause(v);
            reset();
          }}
          onCommit={tr}
          format={(v) => `${v} s`}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Toggle
          label="Fencing tokens"
          checked={fencing}
          onChange={(v) => {
            setFencing(v);
            reset();
            tr();
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (playing) {
              setPlaying(false);
            } else {
              setCursor(0);
              setPlaying(true);
              tr();
            }
          }}
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {playing ? "Pause" : "Play from start"}
        </Button>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-bg p-3">
        <div className="relative">
          {LANES.map((lane) => (
            <div key={lane.id} className="flex items-center gap-2 py-1.5">
              <span className="w-16 shrink-0 text-[11.5px] leading-tight text-muted sm:w-24 sm:text-[12.5px]">{lane.label}</span>
              <div className="relative h-6 flex-1 rounded-md bg-surface-2">
                {lane.id === "A" && (
                  <>
                    <span
                      className="absolute inset-y-1 rounded-sm"
                      style={{ left: x(0), width: w(0, sim.aLeaseEnd), background: "var(--accent-soft)", border: "1px solid var(--accent)" }}
                      title="A's lease"
                    />
                    {pause > 0 && (
                      <span
                        className="absolute inset-y-2 rounded-sm"
                        style={{
                          left: x(sim.PAUSE_AT),
                          width: w(sim.PAUSE_AT, sim.wake),
                          background: "repeating-linear-gradient(135deg, var(--warn) 0 3px, transparent 3px 7px)",
                          opacity: 0.7,
                        }}
                        title="A is frozen"
                      />
                    )}
                  </>
                )}
                {lane.id === "B" && (
                  <span
                    className="absolute inset-y-1 rounded-sm"
                    style={{ left: x(sim.bAcq), width: w(sim.bAcq, sim.end), background: "rgb(184 156 255 / 0.15)", border: "1px solid var(--info)" }}
                    title="B's lease"
                  />
                )}
                {sim.ev
                  .map((e, i) => ({ e, i }))
                  .filter(({ e }) => e.lane === lane.id)
                  .map(({ e, i }) => (
                    <span
                      key={i}
                      className="absolute top-1/2 grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-mono text-[9px] font-semibold text-bg transition-opacity"
                      style={{ left: x(e.t), background: toneVar[e.tone], opacity: e.t <= now ? 1 : 0.15 }}
                    >
                      {i + 1}
                    </span>
                  ))}
              </div>
            </div>
          ))}
          <div className="pointer-events-none absolute inset-y-0 right-0 left-[72px] sm:left-[104px]">
            <span className="absolute inset-y-0 w-px bg-fg/60" style={{ left: x(now) }} />
          </div>
        </div>
        <div className="mt-1 flex justify-between pl-[72px] font-mono text-[10px] text-subtle sm:pl-[104px]">
          <span>0 s</span>
          <span>{Math.round(sim.end / 2)} s</span>
          <span>{Math.round(sim.end)} s</span>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {sim.ev.map((e, i) => (
          <div
            key={i}
            className={cn("flex gap-2 text-[13px] leading-snug transition-opacity", e.t <= now ? "opacity-100" : "opacity-30")}
          >
            <span
              className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full font-mono text-[9px] font-semibold text-bg"
              style={{ background: toneVar[e.tone] }}
            >
              {i + 1}
            </span>
            <span className="w-12 shrink-0 font-mono text-[11.5px] text-subtle">{e.t.toFixed(1)} s</span>
            <span className="min-w-0 text-muted">
              <span className="font-medium text-fg">{LANES.find((l) => l.id === e.lane)!.label}:</span> {e.text}
            </span>
          </div>
        ))}
      </div>

      <div
        role="status"
        className={cn(
          "mt-3 rounded-xl border px-3 py-2.5 text-[13.5px] leading-relaxed transition-opacity",
          sim.outcome.tone === "ok" ? "border-ok/30 bg-ok/5" : "border-err/30 bg-err/5",
          now >= sim.end - 3 ? "opacity-100" : "opacity-0",
        )}
      >
        <span className={cn("font-semibold", sim.outcome.tone === "ok" ? "text-ok" : "text-err")}>{sim.outcome.title}. </span>
        <span className="text-fg">{sim.outcome.text}</span>
      </div>
    </VisualFrame>
  );
}
