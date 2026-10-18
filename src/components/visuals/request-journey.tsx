"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Segmented, Toggle, VisualFrame } from "./foundations-kit";

type Where = "city" | "continent";
type Phase = { key: string; label: string; detail: string; ms: number; kind: "network" | "server"; skipped?: string };

const RTT: Record<Where, number> = { city: 12, continent: 190 };

function phases(where: Where, cachedDns: boolean, reuse: boolean): Phase[] {
  const rtt = RTT[where];
  return [
    {
      key: "dns",
      label: "DNS lookup",
      detail: "Ask a resolver for gatepass.app's IP address",
      ms: cachedDns ? 0 : where === "city" ? 35 : 110,
      kind: "network",
      skipped: cachedDns ? "answer cached on the phone" : undefined,
    },
    {
      key: "tcp",
      label: "TCP handshake",
      detail: "SYN → SYN-ACK → ACK: one round trip",
      ms: reuse ? 0 : rtt,
      kind: "network",
      skipped: reuse ? "connection kept alive" : undefined,
    },
    {
      key: "tls",
      label: "TLS handshake",
      detail: "Agree on keys (TLS 1.3): one more round trip",
      ms: reuse ? 0 : rtt,
      kind: "network",
      skipped: reuse ? "session already encrypted" : undefined,
    },
    { key: "send", label: "Request travels", detail: "GET /events/42 goes out: half a round trip", ms: rtt / 2, kind: "network" },
    { key: "app", label: "Server code", detail: "Route, check auth, build the response", ms: 8, kind: "server" },
    { key: "db", label: "Database query", detail: "SELECT … FROM events WHERE id = 42", ms: 4, kind: "server" },
    { key: "back", label: "Response travels", detail: "~6 KB of JSON comes back: half a round trip", ms: rtt / 2 + 2, kind: "network" },
  ];
}

/** A request's timeline from tap to response, with the toggles that shrink it. */
export function RequestJourney() {
  const [where, setWhere] = useState<Where>("city");
  const [cachedDns, setCachedDns] = useState(false);
  const [reuse, setReuse] = useState(false);
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  const list = phases(where, cachedDns, reuse);
  const total = list.reduce((n, p) => n + p.ms, 0);
  const network = list.filter((p) => p.kind === "network").reduce((n, p) => n + p.ms, 0);
  const rows = list.map((p, i) => ({ ...p, start: list.slice(0, i).reduce((n, q) => n + q.ms, 0) }));
  const elapsed = t * total;

  useEffect(() => {
    if (!playing) return;
    const began = performance.now();
    // Real time, slowed so a 12 ms hop is visible: the whole journey takes ~3 s.
    const span = 3000;
    const tick = (now: number) => {
      const p = Math.min(1, (now - began) / span);
      setT(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const change = (control: string, value: string | boolean) => {
    setT(1);
    setPlaying(false);
    track("visual_interacted", { visual: "request-journey", control, value });
  };

  return (
    <VisualFrame
      title="One tap, seven steps"
      caption="Times are typical, not exact. Press play to watch the request move, then flip the toggles: most of the time is spent waiting on the network, not running code."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Distance"
          value={where}
          onChange={(w) => {
            setWhere(w);
            change("distance", w);
          }}
          options={[
            { value: "city", label: "Server in the same city" },
            { value: "continent", label: "Server on another continent" },
          ]}
        />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Toggle
          label="DNS answer cached"
          hint="the phone looked it up recently"
          checked={cachedDns}
          onChange={(v) => {
            setCachedDns(v);
            change("cached_dns", v);
          }}
        />
        <Toggle
          label="Reuse the connection"
          hint="keep-alive skips TCP and TLS"
          checked={reuse}
          onChange={(v) => {
            setReuse(v);
            change("keep_alive", v);
          }}
        />
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11.5px] text-subtle">Tap to response</p>
          <p className="font-mono text-2xl font-semibold text-fg tabular-nums">{Math.round(total)} ms</p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] text-subtle">Waiting on the network</p>
          <p className="font-mono text-lg font-semibold text-req tabular-nums">{Math.round((network / total) * 100)}%</p>
        </div>
      </div>

      <ol className="mt-4 space-y-2.5">
        {rows.map((r) => {
          const active = playing && elapsed >= r.start && elapsed < r.start + r.ms;
          const fill = r.ms ? Math.min(1, Math.max(0, (elapsed - r.start) / r.ms)) : 0;
          return (
            <li key={r.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_3.5rem] items-center gap-x-3 sm:grid-cols-[9.5rem_1fr_3.5rem]">
              <div className="min-w-0">
                <p className={cn("truncate text-[13px]", r.skipped ? "text-subtle line-through" : "text-fg")}>{r.label}</p>
                <p className="hidden truncate text-[11px] text-subtle sm:block">{r.skipped ?? r.detail}</p>
              </div>
              <div className="relative h-5 rounded-md bg-surface-2">
                {r.ms > 0 && (
                  <div
                    className={cn(
                      "absolute inset-y-0 rounded-md border",
                      r.kind === "network" ? "border-req/40 bg-req/15" : "border-res/40 bg-res/15",
                      active && "ring-2 ring-accent/40",
                    )}
                    style={{ left: `${(r.start / total) * 100}%`, width: `max(3px, ${(r.ms / total) * 100}%)` }}
                  >
                    <div
                      className={cn("h-full rounded-md", r.kind === "network" ? "bg-req/60" : "bg-res/60")}
                      style={{ width: `${fill * 100}%` }}
                    />
                  </div>
                )}
              </div>
              <span className={cn("text-right font-mono text-[12px] tabular-nums", r.ms ? "text-muted" : "text-subtle")}>
                {r.ms ? `${Math.round(r.ms)} ms` : "0"}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            setT(reduce ? 1 : 0);
            setPlaying(!reduce);
            track("visual_interacted", { visual: "request-journey", control: "play", value: where });
          }}
          disabled={playing}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 text-[13px] text-fg hover:bg-surface-3 disabled:opacity-60"
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {playing ? `${Math.round(elapsed)} ms…` : "Play the request"}
        </button>
        <span className="flex items-center gap-3 text-[12px] text-subtle">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-req/60" /> network
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-res/60" /> your servers
          </span>
        </span>
      </div>
    </VisualFrame>
  );
}
