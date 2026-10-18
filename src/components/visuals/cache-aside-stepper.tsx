"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Segmented, VisualFrame, fmtMs, trackVisual, useInterval, usePrefersReducedMotion } from "./caching-scaling-ui";

const VISUAL = "cache-aside-stepper";

type Node = "fan" | "app" | "cache" | "db";
type Step = { from: Node; to: Node; label: string; detail: string; line: number; ms: number; tone: "req" | "res" | "err" | "ok" };

const HIT: Step[] = [
  { from: "fan", to: "app", label: "GET /events/the-band-mumbai", detail: "A fan opens the event page.", line: 0, ms: 0, tone: "req" },
  { from: "app", to: "cache", label: "GET event:the-band-mumbai", detail: "The app asks the cache first, using a key built from the event's id.", line: 2, ms: 0.3, tone: "req" },
  { from: "cache", to: "app", label: "HIT · 4 KB of JSON", detail: "The cache has it. No database involved.", line: 3, ms: 0.4, tone: "ok" },
  { from: "app", to: "fan", label: "200 OK", detail: "The page is served from memory.", line: 3, ms: 1, tone: "res" },
];

const MISS: Step[] = [
  { from: "fan", to: "app", label: "GET /events/the-band-mumbai", detail: "A fan opens the event page.", line: 0, ms: 0, tone: "req" },
  { from: "app", to: "cache", label: "GET event:the-band-mumbai", detail: "The app asks the cache first.", line: 2, ms: 0.3, tone: "req" },
  { from: "cache", to: "app", label: "MISS · nil", detail: "Not there: never loaded, expired, or deleted after a change.", line: 3, ms: 0.4, tone: "err" },
  { from: "app", to: "db", label: "SELECT … JOIN venues, tiers", detail: "The app does the slow work itself.", line: 4, ms: 1, tone: "req" },
  { from: "db", to: "app", label: "1 row · 26 ms", detail: "The database answers. This is the expensive step the cache exists to skip.", line: 4, ms: 26, tone: "res" },
  { from: "app", to: "cache", label: "SET event:… EX 60", detail: "The app stores the answer with a 60-second expiry, so the next fan gets a hit.", line: 5, ms: 0.4, tone: "req" },
  { from: "app", to: "fan", label: "200 OK", detail: "The fan gets the page. Everyone after them for the next 60 s gets a hit.", line: 6, ms: 1, tone: "res" },
];

const CODE = [
  "async function getEvent(id) {",
  "  const key = `event:${id}`;",
  "  const cached = await cache.get(key);",
  "  if (cached) return JSON.parse(cached);",
  "  const event = await db.query(EVENT_SQL, [id]);",
  "  await cache.set(key, JSON.stringify(event), { EX: 60 });",
  "  return event;",
  "}",
];

const POS: Record<Node, { x: number; y: number; label: string; sub: string }> = {
  fan: { x: 14, y: 96, label: "Fan", sub: "browser" },
  app: { x: 158, y: 96, label: "App server", sub: "getEvent()" },
  cache: { x: 316, y: 18, label: "Cache", sub: "Redis" },
  db: { x: 316, y: 174, label: "Database", sub: "Postgres" },
};
const toneText = { req: "text-req", res: "text-res", err: "text-err", ok: "text-ok" } as const;
const BW = 112;
const BH = 46;

function anchor(from: Node, to: Node): [number, number] {
  const a = POS[from];
  const b = POS[to];
  const ax = a.x + BW / 2;
  const ay = a.y + BH / 2;
  const bx = b.x + BW / 2;
  const by = b.y + BH / 2;
  // exit on the side facing the target
  if (Math.abs(bx - ax) > Math.abs(by - ay) * 1.2) return [bx > ax ? a.x + BW : a.x, ay];
  return [ax + (bx > ax ? 26 : -26), by > ay ? a.y + BH : a.y];
}

function edge(from: Node, to: Node) {
  const s = anchor(from, to);
  const e = anchor(to, from);
  // offset request and response lanes so they don't overlap
  const key = [from, to].sort().join("-");
  const dir = from < to ? 1 : -1;
  const off = key === "app-fan" ? 7 * dir : 0;
  return { x1: s[0], y1: s[1] + off, x2: e[0], y2: e[1] + off };
}

export function CacheAsideStepper() {
  const reduced = usePrefersReducedMotion();
  const [inCache, setInCache] = useState(false);
  const [path, setPath] = useState<"hit" | "miss">("miss");
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const steps = path === "hit" ? HIT : MISS;
  const current = step >= 0 ? steps[step] : null;
  const done = step === steps.length - 1;
  const elapsed = steps.slice(0, step + 1).reduce((a, s) => a + s.ms, 0);

  function start() {
    const p = inCache ? "hit" : "miss";
    setPath(p);
    setStep(0);
    return p;
  }

  function next() {
    if (step === -1 || done) {
      start();
      return;
    }
    const n = step + 1;
    setStep(n);
    if (n === steps.length - 1) {
      setPlaying(false);
      if (path === "miss") setInCache(true);
    }
  }

  useInterval(next, reduced ? 1600 : 1100, playing);

  function setCached(v: boolean) {
    setInCache(v);
    setStep(-1);
    setPlaying(false);
    trackVisual(VISUAL, "key_in_cache", v);
  }

  return (
    <VisualFrame
      title="Cache-aside, one request at a time"
      hint="Send a request and step through it. A miss fills the cache, so the next request is a hit. Expire the key to see the slow path again."
      caption="In cache-aside the application does all the work: check the cache, fall back to the database, then fill the cache. The cache never talks to the database."
    >
      <div className="flex flex-wrap items-end gap-3">
        <Segmented
          label="event:the-band-mumbai"
          value={inCache ? "in" : "out"}
          options={[
            { value: "out", label: "Not in cache" },
            { value: "in", label: "In cache" },
          ]}
          onChange={(v) => setCached(v === "in")}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              if (playing) return setPlaying(false);
              if (step === -1 || done) {
                const p = start();
                trackVisual(VISUAL, "send_request", p);
              }
              setPlaying(true);
            }}
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {playing ? "Pause" : step === -1 || done ? "Send request" : "Play"}
          </Button>
          <Button size="sm" variant="secondary" aria-label="Previous step" disabled={step <= 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            <SkipBack className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            aria-label="Next step"
            onClick={() => {
              setPlaying(false);
              next();
            }}
          >
            <SkipForward className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCached(false);
              trackVisual(VISUAL, "expire", true);
            }}
          >
            <RotateCcw className="size-3.5" /> Expire key
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <svg viewBox="0 0 444 232" className="mx-auto block h-auto w-full max-w-[520px]" role="img" aria-label={current ? `${current.from} to ${current.to}: ${current.label}` : "Fan, app server, cache and database"}>
          <defs>
            {(["req", "res", "err", "ok"] as const).map((t) => (
              <marker key={t} id={`ca-arrow-${t}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill={`var(--${t})`} />
              </marker>
            ))}
          </defs>
          {/* idle wires */}
          {(
            [
              ["fan", "app"],
              ["app", "cache"],
              ["app", "db"],
            ] as [Node, Node][]
          ).map(([a, b]) => {
            const e = edge(a, b);
            return <line key={a + b} {...e} stroke="var(--border-strong)" strokeDasharray="3 4" />;
          })}
          {steps.slice(0, step + 1).map((s, i) => {
            const e = edge(s.from, s.to);
            const active = i === step;
            return (
              <line
                key={`${path}-${i}`}
                {...e}
                stroke={`var(--${s.tone})`}
                strokeWidth={active ? 2 : 1.2}
                opacity={active ? 1 : 0.35}
                markerEnd={`url(#ca-arrow-${s.tone})`}
              />
            );
          })}
          {(Object.keys(POS) as Node[]).map((n) => {
            const p = POS[n];
            const lit = current && (current.from === n || current.to === n);
            const tone = n === "cache" && inCache ? "var(--ok)" : lit ? "var(--accent)" : "var(--border-strong)";
            return (
              <g key={n}>
                <rect x={p.x} y={p.y} width={BW} height={BH} rx={10} fill="var(--surface-2)" stroke={tone} strokeWidth={lit ? 1.6 : 1} />
                <text x={p.x + BW / 2} y={p.y + 20} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--fg)">
                  {p.label}
                </text>
                <text x={p.x + BW / 2} y={p.y + 35} textAnchor="middle" fontSize={10.5} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
                  {n === "cache" ? (inCache ? "1 key · TTL 60s" : "empty") : p.sub}
                </text>
              </g>
            );
          })}
          {current && (
            <motion.circle
              key={`${path}-${step}`}
              r={5}
              fill={`var(--${current.tone})`}
              initial={reduced ? false : { cx: edge(current.from, current.to).x1, cy: edge(current.from, current.to).y1 }}
              animate={{ cx: edge(current.from, current.to).x2, cy: edge(current.from, current.to).y2 }}
              transition={{ duration: reduced ? 0 : 0.7, ease: "easeInOut" }}
            />
          )}
        </svg>

        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border border-line bg-bg p-3" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10.5px] tracking-wider text-subtle uppercase">
                {current ? `${path === "hit" ? "Hit path" : "Miss path"} · step ${step + 1}/${steps.length}` : "Ready"}
              </p>
              <span className="inline-flex items-center gap-1 font-mono text-[11.5px] text-muted tabular-nums">
                <Timer className="size-3" /> {fmtMs(elapsed)}
              </span>
            </div>
            <p className={cn("mt-1 font-mono text-[12.5px] break-words", current ? toneText[current.tone] : "text-fg")}>
              {current ? current.label : inCache ? "The key is cached. Send a request." : "The cache is empty. Send a request."}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-muted">
              {current?.detail ?? "Watch which boxes the request touches, and how long it takes."}
            </p>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-line bg-sunken p-3 font-mono text-[11.5px] leading-[1.7]">
            {CODE.map((l, i) => (
              <div key={i} className={cn("-mx-3 px-3 whitespace-pre", current && current.line === i ? "bg-accent-soft text-fg" : "text-subtle")}>
                {l}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </VisualFrame>
  );
}
