"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Power, Ticket } from "lucide-react";
import { Box, Diagram, Wire } from "@/components/diagram/kit";
import { Button } from "@/components/ui/button";
import { trackVisual } from "@/lib/analytics";
import { Segmented, Stat, VisualFrame } from "./scale-visual-parts";

const VISUAL = "websocket-fanout";
const SERVER_X = [20, 180, 340];
const SERVER_W = 120;
const SERVER_Y = 132;
const SEATS = ["C14", "D2", "A7", "F9", "B3", "E11", "G5", "H1"];

type Phone = { id: number; server: number; seen: number; online: boolean; reconnectAt?: number };
type Flash = { source: number; targets: number[]; pubsub: boolean; key: number } | null;

const initialPhones = (): Phone[] =>
  Array.from({ length: 9 }, (_, i) => ({ id: i, server: i % 3, seen: 1832, online: true }));

export function WebSocketFanout() {
  const reduced = useReducedMotion();
  const [pubsub, setPubsub] = useState<"off" | "on">("off");
  const [version, setVersion] = useState(1832);
  const [phones, setPhones] = useState<Phone[]>(initialPhones);
  const [down, setDown] = useState<number | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [log, setLog] = useState<string[]>(["9 phones connected, 3 per server. Everyone has seat map v1832."]);
  const rr = useRef(0);
  const versionRef = useRef(1832);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, reduced ? 0 : ms));
  };
  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 4));

  const book = () => {
    const up = [0, 1, 2].filter((s) => s !== down);
    const source = up[rr.current++ % up.length];
    const v = versionRef.current + 1;
    versionRef.current = v;
    const seat = SEATS[(v - 1833) % SEATS.length];
    setVersion(v);
    const usePubsub = pubsub === "on";
    const targets = usePubsub ? up : [source];
    setFlash({ source, targets, pubsub: usePubsub, key: v });
    trackVisual(VISUAL);
    later(900, () => {
      setPhones((ps) => ps.map((p) => (p.online && targets.includes(p.server) ? { ...p, seen: v } : p)));
      say(
        usePubsub
          ? `S${source + 1} saved ${seat} (v${v}) and published it. Redis sent it to ${targets.map((t) => `S${t + 1}`).join(", ")}, which pushed it to every phone they hold.`
          : `S${source + 1} saved ${seat} (v${v}) and pushed it to its own phones only. Phones on other servers never hear about it.`,
      );
    });
    later(1500, () => setFlash(null));
  };

  const restart = () => {
    if (down !== null) return;
    const victim = 1;
    setDown(victim);
    trackVisual(VISUAL);
    setPhones((ps) => ps.map((p) => (p.server === victim ? { ...p, online: false } : p)));
    say("S2 restarts for a deploy. Its 3 phones lose their sockets and wait a random 1–3 s before reconnecting.");
    const leaving = phones.filter((p) => p.server === victim).map((p) => p.id);
    leaving.forEach((id, k) => {
      later(1200 + k * 700, () => {
        // Resubscribe with `since`: the server replays anything newer, so the phone catches up.
        const latest = versionRef.current;
        setPhones((ps) =>
          ps.map((p) => (p.id === id ? { ...p, online: true, server: k % 2 === 0 ? 0 : 2, seen: latest } : p)),
        );
      });
    });
    later(1200 + leaving.length * 700, () =>
      say("Each phone reconnected through the load balancer to S1 or S3 and sent since=<last version>, so it caught up on anything it missed."),
    );
    later(4200, () => {
      setDown(null);
      say("S2 is back, with zero connections. Existing sockets don't move back on their own; only new ones will land on S2.");
    });
  };

  const reset = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setPhones(initialPhones());
    setVersion(1832);
    versionRef.current = 1832;
    setDown(null);
    setFlash(null);
    rr.current = 0;
    setLog(["9 phones connected, 3 per server. Everyone has seat map v1832."]);
    trackVisual(VISUAL);
  };

  const online = phones.filter((p) => p.online);
  const fresh = online.filter((p) => p.seen === version).length;
  const stale = online.length - fresh;
  const offline = phones.length - online.length;

  return (
    <VisualFrame
      title="One booking, nine phones, three servers"
      hint="Book a seat and see which phones hear about it. Then turn on pub/sub, and try restarting a server in the middle of the on-sale."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          visual={VISUAL}
          label="Fan-out"
          value={pubsub}
          onChange={setPubsub}
          options={[
            { value: "off", label: "No pub/sub" },
            { value: "on", label: "Redis pub/sub" },
          ]}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" onClick={book}>
            <Ticket className="size-3.5" /> Book a seat
          </Button>
          <Button size="sm" variant="secondary" onClick={restart} disabled={down !== null}>
            <Power className="size-3.5" /> Restart S2
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            Reset
          </Button>
        </div>
      </div>

      <Diagram w={480} h={330} className="my-4" label="Three WebSocket servers, a pub/sub channel and nine phones">
        <Box x={20} y={14} w={120} h={46} label="POST /bookings" sub="via load balancer" icon="client" tone={flash ? "req" : "default"} />
        <Box
          x={250}
          y={14}
          w={150}
          h={46}
          label="Redis pub/sub"
          sub="channel event:42"
          icon="stream"
          tone={pubsub === "on" ? "info" : "muted"}
          dashed={pubsub === "off"}
          dim={pubsub === "off"}
        />
        {/* booking request to the server that handles it */}
        {flash && (
          <Wire
            key={`req-${flash.key}`}
            points={[[80, 60], [80, 96], [SERVER_X[flash.source] + 60, 96], [SERVER_X[flash.source] + 60, SERVER_Y - 2]]}
            tone="req"
            flow
          />
        )}
        {/* subscriptions */}
        {pubsub === "on" &&
          SERVER_X.map((x, i) => (
            <Wire
              key={`sub-${i}`}
              points={[[x + 92, SERVER_Y], [x + 92, 110], [325, 110], [325, 62]]}
              tone={flash && flash.pubsub ? "info" : "muted"}
              arrow={false}
              dashed={!(flash && flash.pubsub) || down === i}
              flow={!!(flash && flash.pubsub && flash.targets.includes(i))}
            />
          ))}
        {SERVER_X.map((x, i) => {
          const count = phones.filter((p) => p.online && p.server === i).length;
          return (
            <Box
              key={`srv-${i}`}
              x={x}
              y={SERVER_Y}
              w={SERVER_W}
              h={50}
              label={`S${i + 1}`}
              sub={down === i ? "restarting…" : `${count} sockets`}
              icon="server"
              tone={down === i ? "err" : flash?.targets.includes(i) ? "res" : "default"}
              dim={down === i}
            />
          );
        })}
        {SERVER_X.map((x, i) => {
          const here = phones.filter((p) => p.online && p.server === i);
          return here.map((p, k) => {
            const px = x + SERVER_W / 2 + (k - (here.length - 1) / 2) * 30;
            return (
              <Wire
                key={`ws-${p.id}`}
                points={[[x + SERVER_W / 2, SERVER_Y + 50], [px, 250]]}
                tone={flash?.targets.includes(i) ? "res" : "muted"}
                arrow={false}
                flow={!!flash?.targets.includes(i)}
              />
            );
          });
        })}
        {SERVER_X.map((x, i) => {
          const here = phones.filter((p) => p.online && p.server === i);
          return here.map((p, k) => (
            <PhoneGlyph key={`ph-${p.id}`} x={x + SERVER_W / 2 + (k - (here.length - 1) / 2) * 30} y={250} state={p.seen === version ? "fresh" : "stale"} />
          ));
        })}
        {phones
          .filter((p) => !p.online)
          .map((p, k) => (
            <PhoneGlyph key={`off-${p.id}`} x={SERVER_X[1] + SERVER_W / 2 + (k - 1) * 30} y={290} state="offline" />
          ))}
      </Diagram>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Up to date" value={`${fresh}/${phones.length}`} tone={fresh === phones.length ? "ok" : "default"} sub={`seat map v${version}`} />
        <Stat label="Stale" value={stale} tone={stale ? "warn" : "default"} sub="showing sold seats as free" />
        <Stat label="Reconnecting" value={offline} tone={offline ? "err" : "default"} />
      </div>
      <ol className="mt-3 space-y-1.5" aria-live="polite">
        {log.map((line, i) => (
          <li key={`${i}-${line}`} className={i === 0 ? "text-[13.5px] text-fg" : "text-[12.5px] text-subtle"}>
            {line}
          </li>
        ))}
      </ol>
    </VisualFrame>
  );
}

function PhoneGlyph({ x, y, state }: { x: number; y: number; state: "fresh" | "stale" | "offline" }) {
  const color = state === "fresh" ? "var(--ok)" : state === "stale" ? "var(--warn)" : "var(--err)";
  return (
    <g>
      <rect x={x - 11} y={y} width={22} height={36} rx={5} fill="var(--surface-2)" stroke={color} strokeWidth={1.6} strokeDasharray={state === "offline" ? "3 3" : undefined} />
      {state === "fresh" && <path d={`M${x - 5} ${y + 18} l4 4 l7 -8`} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {state === "stale" && (
        <text x={x} y={y + 23} textAnchor="middle" fontSize={14} fontWeight={700} fill={color}>
          !
        </text>
      )}
      {state === "offline" && <path d={`M${x - 5} ${y + 13} l10 10 M${x + 5} ${y + 13} l-10 10`} stroke={color} strokeWidth={1.8} strokeLinecap="round" />}
    </g>
  );
}
