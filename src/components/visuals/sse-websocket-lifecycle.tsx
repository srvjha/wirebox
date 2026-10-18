"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Segmented, VisualFrame } from "./scale-visual-parts";

const VISUAL = "sse-websocket-lifecycle";

type Dir = "up" | "down" | "drop" | "both";
type Step = { dir: Dir; label: string; wire?: string; detail: string; tone?: "req" | "res" | "info" | "err" | "muted" };

const STEPS: Record<"sse" | "ws", Step[]> = {
  sse: [
    {
      dir: "up",
      label: "GET /events/42/stream",
      wire: "GET /events/42/stream HTTP/1.1\nAccept: text/event-stream\nCookie: session=…",
      detail: "A normal HTTP request. Cookies, auth headers, load balancers and CDNs all treat it like any other GET.",
    },
    {
      dir: "down",
      label: "200 text/event-stream",
      wire: "HTTP/1.1 200 OK\nContent-Type: text/event-stream\nCache-Control: no-cache",
      detail: "The server answers but never finishes the body. The response stays open and the server writes to it whenever it has news.",
      tone: "res",
    },
    {
      dir: "down",
      label: "id: 1833  seat C14 taken",
      wire: 'id: 1833\nevent: seat\ndata: {"seat":"C14","status":"taken"}\n',
      detail: "Each event is a few lines of text ending in a blank line. The id is what makes reconnects lossless, so make it your seat-map version.",
      tone: "res",
    },
    {
      dir: "down",
      label: ": ping  (every 15 s)",
      wire: ": ping\n",
      detail: "A comment line the browser ignores. It exists only so load balancers and mobile networks don't close a connection that looks idle.",
      tone: "muted",
    },
    {
      dir: "up",
      label: "POST /holds  (new request)",
      wire: 'POST /holds HTTP/1.1\n\n{"seat":"D2"}',
      detail: "SSE is one way. When the fan taps a seat to hold it, the app sends an ordinary HTTP request, which may land on a different server.",
    },
    {
      dir: "drop",
      label: "connection lost",
      detail: "The phone enters a tunnel. The TCP connection dies, and any events sent meanwhile are gone from this connection.",
      tone: "err",
    },
    {
      dir: "up",
      label: "GET …/stream  Last-Event-ID: 1833",
      wire: "GET /events/42/stream HTTP/1.1\nLast-Event-ID: 1833",
      detail: "The browser's EventSource reconnects on its own after a short delay, and sends the last id it saw. You write no reconnect code.",
    },
    {
      dir: "down",
      label: "id: 1834, id: 1835 (catch-up)",
      wire: 'id: 1834\ndata: {"seat":"D2","status":"held"}\n\nid: 1835\ndata: {"seat":"A7","status":"taken"}\n',
      detail: "The server replays everything after 1833, then carries on streaming. The fan's map is correct again.",
      tone: "res",
    },
  ],
  ws: [
    {
      dir: "up",
      label: "GET /ws  Upgrade: websocket",
      wire: "GET /ws HTTP/1.1\nConnection: Upgrade\nUpgrade: websocket\nSec-WebSocket-Key: dGhlIHNhbXBsZQ==",
      detail: "It starts as HTTP, asking to switch protocols. Every proxy on the path has to understand and allow the upgrade.",
    },
    {
      dir: "down",
      label: "101 Switching Protocols",
      wire: "HTTP/1.1 101 Switching Protocols\nUpgrade: websocket\nSec-WebSocket-Accept: s3pPLMBiTxaQ9k…",
      detail: "From here on the TCP connection is no longer HTTP. It carries small frames in both directions, with no headers per message.",
      tone: "res",
    },
    {
      dir: "up",
      label: "subscribe event 42 since 1832",
      wire: '{"type":"subscribe","event":42,"since":1832}',
      detail: "There are no URLs or methods inside the socket. You design your own little protocol: message types, subscriptions, errors.",
    },
    {
      dir: "down",
      label: "seat C14 taken (v1833)",
      wire: '{"type":"seat","seat":"C14","status":"taken","v":1833}',
      detail: "The server pushes a frame. A few bytes of framing plus your JSON.",
      tone: "res",
    },
    {
      dir: "both",
      label: "hold D2  ⇄  ok",
      wire: '→ {"type":"hold","seat":"D2","req":7}\n← {"type":"ack","req":7,"ok":true}',
      detail: "The client talks back on the same connection. Because replies don't come back as HTTP responses, you match them to requests yourself (req: 7).",
      tone: "info",
    },
    {
      dir: "drop",
      label: "connection lost",
      detail: "The phone enters a tunnel. The browser fires onclose (sometimes only after a ping goes unanswered), and nothing else happens.",
      tone: "err",
    },
    {
      dir: "up",
      label: "upgrade again + since 1833",
      wire: 'GET /ws (Upgrade)  …101…\n{"type":"subscribe","event":42,"since":1833}',
      detail: "Reconnecting is your job: wait with backoff and jitter, open a new socket, resubscribe, and send the last version you saw.",
    },
    {
      dir: "down",
      label: "catch-up 1834, 1835",
      wire: '{"type":"seat","seat":"D2","status":"held","v":1834}\n{"type":"seat","seat":"A7","status":"taken","v":1835}',
      detail: "Same idea as Last-Event-ID, but you built it. Forget the since field and fans silently miss bookings after every reconnect.",
      tone: "res",
    },
  ],
};

const W = 400;
const PHONE_X = 64;
const SERVER_X = 336;
const ROW = 40;
const TOP = 52;

export function SseWebSocketLifecycle() {
  const [proto, setProto] = useState<"sse" | "ws">("sse");
  const [step, setStep] = useState(0);
  const steps = STEPS[proto];
  const h = TOP + steps.length * ROW + 10;
  const dropIdx = steps.findIndex((s) => s.dir === "drop");
  const current = steps[step];

  const go = (n: number) => {
    const next = Math.max(0, Math.min(steps.length - 1, n));
    setStep(next);
    track("visual_interacted", { visual: VISUAL, control: "step", value: `${proto}:${next}` });
  };

  return (
    <VisualFrame
      title="Open, push, drop, reconnect"
      hint="Step through the life of one seat-map connection. Switch protocols and compare who does the work at each step."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          visual={VISUAL}
          control="protocol"
          label="Protocol"
          value={proto}
          onChange={(v) => {
            setProto(v);
            setStep(0);
          }}
          options={[
            { value: "sse", label: "Server-sent events" },
            { value: "ws", label: "WebSocket" },
          ]}
        />
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="secondary" aria-label="Previous step" onClick={() => go(step - 1)} disabled={step === 0}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="w-12 text-center font-mono text-[12px] text-muted tabular-nums" aria-live="polite">
            {step + 1} / {steps.length}
          </span>
          <Button size="sm" variant="primary" aria-label="Next step" onClick={() => go(step + 1)} disabled={step === steps.length - 1}>
            <ChevronRight className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" aria-label="Start over" onClick={() => go(0)}>
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <svg viewBox={`0 0 ${W} ${h}`} className="mx-auto block h-auto w-full max-w-[460px]" role="img" aria-label={`Sequence diagram, step ${step + 1}: ${current.label}`}>
          <defs>
            {(["req", "res", "info", "muted"] as const).map((t) => (
              <marker key={t} id={`ssews-${t}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill={t === "muted" ? "var(--fg-subtle)" : `var(--${t})`} />
              </marker>
            ))}
          </defs>
          <Head x={PHONE_X} label="Phone" />
          <Head x={SERVER_X} label="Server" />
          {/* lifelines */}
          <line x1={PHONE_X} x2={PHONE_X} y1={40} y2={h - 6} stroke="var(--border-strong)" strokeDasharray="3 4" />
          <line x1={SERVER_X} x2={SERVER_X} y1={40} y2={h - 6} stroke="var(--border-strong)" strokeDasharray="3 4" />
          {/* connection state along the phone's lifeline */}
          {step >= 1 && (
            <rect
              x={PHONE_X - 3}
              y={TOP + ROW * 1 - 4}
              width={6}
              height={ROW * (Math.min(step, dropIdx) - 1) + 8}
              rx={3}
              fill="var(--ok)"
              opacity={0.75}
            />
          )}
          {step > dropIdx + 1 && (
            <rect x={PHONE_X - 3} y={TOP + ROW * (dropIdx + 2) - 4} width={6} height={ROW * (step - dropIdx - 2) + 8} rx={3} fill="var(--ok)" opacity={0.75} />
          )}
          {steps.map((s, i) => {
            if (i > step) return null;
            const y = TOP + i * ROW + 10;
            const active = i === step;
            const tone = s.tone ?? "req";
            const color = tone === "muted" ? "var(--fg-subtle)" : `var(--${tone})`;
            return (
              <g key={`${proto}-${i}`} opacity={active ? 1 : 0.5}>
                {s.dir === "drop" ? (
                  <>
                    <line x1={PHONE_X + 8} x2={SERVER_X - 8} y1={y} y2={y} stroke="var(--err)" strokeDasharray="4 5" />
                    <g transform={`translate(${W / 2} ${y})`} stroke="var(--err)" strokeWidth={2.2} strokeLinecap="round">
                      <path d="M-6 -6 L6 6 M6 -6 L-6 6" />
                    </g>
                  </>
                ) : (
                  <line
                    x1={s.dir === "down" ? SERVER_X - 4 : PHONE_X + 4}
                    x2={s.dir === "down" ? PHONE_X + 6 : SERVER_X - 6}
                    y1={y}
                    y2={y + (s.dir === "both" ? 0 : 6)}
                    stroke={color}
                    strokeWidth={active ? 2 : 1.4}
                    markerEnd={`url(#ssews-${tone === "err" ? "req" : tone})`}
                    markerStart={s.dir === "both" ? `url(#ssews-${tone})` : undefined}
                  />
                )}
                <text x={W / 2} y={y - 6} textAnchor="middle" fontSize={12} fontFamily="var(--font-geist-mono)" fill={active ? "var(--fg)" : "var(--fg-muted)"}>
                  {s.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-wider text-subtle uppercase">Step {step + 1}</p>
          <p className="mt-1 text-[14.5px] leading-relaxed text-muted">{current.detail}</p>
          {current.wire ? (
            <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-sunken px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre text-fg">
              {current.wire}
            </pre>
          ) : (
            <p className="mt-3 rounded-xl border border-err/30 bg-err/10 px-3 py-2.5 text-[13px] text-err">Nothing on the wire.</p>
          )}
          <p className={cn("mt-3 text-[12.5px]", proto === "sse" ? "text-ok" : "text-warn")}>
            {proto === "sse"
              ? "Reconnect and resume: built into the browser."
              : "Reconnect, resubscribe and resume: your code."}
          </p>
        </div>
      </div>
    </VisualFrame>
  );
}

function Head({ x, label }: { x: number; label: string }) {
  return (
    <g>
      <rect x={x - 46} y={6} width={92} height={32} rx={9} fill="var(--surface-2)" stroke="var(--border-strong)" />
      <text x={x} y={26.5} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--fg)">
        {label}
      </text>
    </g>
  );
}
