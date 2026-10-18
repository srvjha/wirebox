"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Segmented, VisualFrame, useVisualTracker } from "./distributed-visual-kit";

type Mode = "leader" | "multi" | "leaderless";
type Tone = "req" | "res" | "err" | "info" | "warn";

type NodeDef = { id: string; label: string; x: number; y: number; client?: boolean };
type NodeState = { value?: string; role?: string; tone?: "ok" | "warn" | "err" | "accent"; down?: boolean };
type Msg = { from: string; to: string; label: string; tone: Tone; lost?: boolean };
type Step = { text: string; msgs: Msg[]; nodes: Record<string, NodeState> };

const toneVar: Record<string, string> = {
  req: "var(--req)",
  res: "var(--res)",
  err: "var(--err)",
  info: "var(--info)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  accent: "var(--accent)",
};

const TRIANGLE: NodeDef[] = [
  { id: "c", label: "Fan's app", x: 58, y: 130, client: true },
  { id: "n1", label: "Node 1", x: 210, y: 46 },
  { id: "n2", label: "Node 2", x: 300, y: 150 },
  { id: "n3", label: "Node 3", x: 170, y: 214 },
];

const MULTI: NodeDef[] = [
  { id: "cm", label: "Fan, Mumbai", x: 58, y: 60, client: true },
  { id: "cd", label: "Fan, Delhi", x: 58, y: 200, client: true },
  { id: "lm", label: "Mumbai", x: 250, y: 60 },
  { id: "ld", label: "Delhi", x: 250, y: 200 },
];

const MODES: Record<Mode, { label: string; nodes: NodeDef[]; steps: Step[] }> = {
  leader: {
    label: "Leader-follower",
    nodes: TRIANGLE,
    steps: [
      {
        text: "A fan books seat C14. Every write goes to the one leader, Node 1.",
        msgs: [{ from: "c", to: "n1", label: "C14 = fan", tone: "req" }],
        nodes: { n1: { role: "leader", value: "C14 free", tone: "accent" }, n2: { role: "follower", value: "C14 free" }, n3: { role: "follower", value: "C14 free" } },
      },
      {
        text: "The leader applies the write, appends it to its log as entry #57, and replies OK. With async replication it doesn't wait for followers.",
        msgs: [{ from: "n1", to: "c", label: "OK", tone: "res" }],
        nodes: { n1: { role: "leader", value: "C14 fan", tone: "accent" }, n2: { role: "follower", value: "C14 free" }, n3: { role: "follower", value: "C14 free" } },
      },
      {
        text: "The leader streams log entries to followers, in order. Node 2 is caught up; Node 3 is a few hundred ms behind.",
        msgs: [
          { from: "n1", to: "n2", label: "#57", tone: "info" },
          { from: "n1", to: "n3", label: "#57", tone: "info" },
        ],
        nodes: { n1: { role: "leader", value: "C14 fan", tone: "accent" }, n2: { role: "follower", value: "C14 fan", tone: "ok" }, n3: { role: "follower · lag", value: "C14 free", tone: "warn" } },
      },
      {
        text: "The app reads from Node 3 to spread load, and gets the old value. That's replication lag: the fan's own booking seems to vanish.",
        msgs: [
          { from: "c", to: "n3", label: "read C14", tone: "req" },
          { from: "n3", to: "c", label: "free (stale)", tone: "warn" },
        ],
        nodes: { n1: { role: "leader", value: "C14 fan", tone: "accent" }, n2: { role: "follower", value: "C14 fan" }, n3: { role: "follower · lag", value: "C14 free", tone: "warn" } },
      },
      {
        text: "The leader crashes. Node 2 is promoted and takes writes. Anything the old leader accepted but never shipped would be lost, and if Node 1 comes back still thinking it leads, you have two leaders.",
        msgs: [{ from: "c", to: "n2", label: "new writes", tone: "req" }],
        nodes: { n1: { role: "crashed", value: "C14 fan", down: true }, n2: { role: "new leader", value: "C14 fan", tone: "accent" }, n3: { role: "follower", value: "C14 fan" } },
      },
    ],
  },
  multi: {
    label: "Multi-leader",
    nodes: MULTI,
    steps: [
      {
        text: "Each region has its own leader. Fans write to the nearest one, so writes are fast and a region can work on its own.",
        msgs: [
          { from: "cm", to: "lm", label: "C14 = M", tone: "req" },
          { from: "cd", to: "ld", label: "C14 = D", tone: "req" },
        ],
        nodes: { lm: { role: "leader", value: "C14 free", tone: "accent" }, ld: { role: "leader", value: "C14 free", tone: "accent" } },
      },
      {
        text: "Both leaders accept their local write and reply OK. Neither knows about the other's write yet.",
        msgs: [
          { from: "lm", to: "cm", label: "OK", tone: "res" },
          { from: "ld", to: "cd", label: "OK", tone: "res" },
        ],
        nodes: { lm: { role: "leader", value: "C14 M", tone: "accent" }, ld: { role: "leader", value: "C14 D", tone: "accent" } },
      },
      {
        text: "The leaders exchange changes asynchronously across regions, tens of milliseconds later.",
        msgs: [
          { from: "lm", to: "ld", label: "C14 = M", tone: "info" },
          { from: "ld", to: "lm", label: "C14 = D", tone: "info" },
        ],
        nodes: { lm: { role: "leader", value: "C14 M", tone: "accent" }, ld: { role: "leader", value: "C14 D", tone: "accent" } },
      },
      {
        text: "Conflict. The same seat was changed in two places, both writes were confirmed, and both fans think they own C14. A single leader would have refused one of them.",
        msgs: [],
        nodes: { lm: { role: "conflict", value: "M or D?", tone: "err" }, ld: { role: "conflict", value: "M or D?", tone: "err" } },
      },
      {
        text: "Both leaders must resolve it identically or they'll diverge forever. Last write wins keeps D and silently drops M's booking. Better: never let seat writes be multi-leader. Route each show's seats to one home region.",
        msgs: [],
        nodes: { lm: { role: "resolved", value: "C14 D", tone: "warn" }, ld: { role: "resolved", value: "C14 D", tone: "warn" } },
      },
    ],
  },
  leaderless: {
    label: "Leaderless",
    nodes: TRIANGLE,
    steps: [
      {
        text: "No leader. The client (or a coordinator) sends the write to all three replicas at once. Node 3 is down. N = 3, W = 2.",
        msgs: [
          { from: "c", to: "n1", label: "v2", tone: "req" },
          { from: "c", to: "n2", label: "v2", tone: "req" },
          { from: "c", to: "n3", label: "v2", tone: "req", lost: true },
        ],
        nodes: { n1: { value: "C14 free v1" }, n2: { value: "C14 free v1" }, n3: { value: "C14 free v1", down: true, role: "down" } },
      },
      {
        text: "Two replicas acknowledge. W = 2, so the write counts as successful even though one replica missed it.",
        msgs: [
          { from: "n1", to: "c", label: "ack", tone: "res" },
          { from: "n2", to: "c", label: "ack", tone: "res" },
        ],
        nodes: { n1: { value: "C14 fan v2", tone: "ok" }, n2: { value: "C14 fan v2", tone: "ok" }, n3: { value: "C14 free v1", down: true, role: "down" } },
      },
      {
        text: "Node 3 comes back. It still has the old version.",
        msgs: [],
        nodes: { n1: { value: "C14 fan v2" }, n2: { value: "C14 fan v2" }, n3: { value: "C14 free v1", tone: "warn", role: "stale" } },
      },
      {
        text: "A read asks two replicas, R = 2, and happens to hit Node 2 and Node 3. The answers disagree, so the client keeps the higher version, v2. Because R + W > N, at least one replica in any read has the latest write.",
        msgs: [
          { from: "n2", to: "c", label: "v2", tone: "res" },
          { from: "n3", to: "c", label: "v1", tone: "warn" },
        ],
        nodes: { n1: { value: "C14 fan v2" }, n2: { value: "C14 fan v2", tone: "ok" }, n3: { value: "C14 free v1", tone: "warn", role: "stale" } },
      },
      {
        text: "Read repair: having seen Node 3 is stale, the client writes v2 back to it. A background anti-entropy process also compares replicas and fixes the ones nobody reads.",
        msgs: [{ from: "c", to: "n3", label: "repair v2", tone: "info" }],
        nodes: { n1: { value: "C14 fan v2" }, n2: { value: "C14 fan v2" }, n3: { value: "C14 fan v2", tone: "ok", role: "repaired" } },
      },
    ],
  },
};

const NW = 96;
const NH = 44;

function edge(a: NodeDef, b: NodeDef, offset: number) {
  // Shorten the line so arrows stop at box edges, and offset parallel lines.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const shrink = (u: number, v: number) => Math.min(NW / 2 / Math.max(Math.abs(u), 1e-6), NH / 2 / Math.max(Math.abs(v), 1e-6)) + 4;
  const s = shrink(ux, uy);
  const ox = -uy * offset;
  const oy = ux * offset;
  return { x1: a.x + ux * s + ox, y1: a.y + uy * s + oy, x2: b.x - ux * s + ox, y2: b.y - uy * s + oy };
}

export function ReplicationModesExplorer() {
  const tr = useVisualTracker("replication-modes-explorer");
  const [mode, setMode] = useState<Mode>("leader");
  const [i, setI] = useState(0);
  const m = MODES[mode];
  const step = m.steps[i];
  const byId = new Map(m.nodes.map((n) => [n.id, n]));

  const go = (n: number) => {
    setI(n);
    tr(`step:${mode}`, n + 1);
  };

  return (
    <VisualFrame
      eyebrow="Try it · who accepts writes?"
      title="Three ways to keep copies"
      hint="Pick a replication mode and step through a write, a read and a failure."
    >
      <Segmented<Mode>
        label="Replication mode"
        size="sm"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setI(0);
          tr("mode", v);
        }}
        options={(Object.keys(MODES) as Mode[]).map((k) => ({ value: k, label: MODES[k].label }))}
      />

      <div className="mt-3 rounded-xl border border-line bg-bg">
        <svg viewBox="0 0 360 260" className="mx-auto block h-auto w-full max-w-[520px]" role="img" aria-label={step.text}>
          <defs>
            {Object.entries(toneVar).map(([k, v]) => (
              <marker key={k} id={`rme-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill={v} />
              </marker>
            ))}
          </defs>

          {mode === "multi" && (
            <>
              <rect x={8} y={12} width={344} height={98} rx={12} fill="none" stroke="var(--border-strong)" strokeDasharray="4 4" />
              <rect x={8} y={152} width={344} height={98} rx={12} fill="none" stroke="var(--border-strong)" strokeDasharray="4 4" />
              <text x={344} y={104} textAnchor="end" fontSize={9.5} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
                REGION MUMBAI
              </text>
              <text x={344} y={244} textAnchor="end" fontSize={9.5} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
                REGION DELHI
              </text>
            </>
          )}

          <g key={`${mode}-${i}`}>
            {step.msgs.map((msg, k) => {
              const a = byId.get(msg.from)!;
              const b = byId.get(msg.to)!;
              const reverse = step.msgs.some((o) => o.from === msg.to && o.to === msg.from);
              const e = edge(a, b, reverse ? 7 : 0);
              const ex = msg.lost ? e.x1 + (e.x2 - e.x1) * 0.6 : e.x2;
              const ey = msg.lost ? e.y1 + (e.y2 - e.y1) * 0.6 : e.y2;
              const mx = (e.x1 + ex) / 2;
              const my = (e.y1 + ey) / 2;
              const color = toneVar[msg.tone];
              return (
                <g key={k}>
                  <motion.line
                    x1={e.x1}
                    y1={e.y1}
                    x2={ex}
                    y2={ey}
                    stroke={color}
                    strokeWidth={1.6}
                    markerEnd={msg.lost ? undefined : `url(#rme-${msg.tone})`}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: k * 0.15 }}
                  />
                  {msg.lost && (
                    <g stroke="var(--err)" strokeWidth={2} strokeLinecap="round">
                      <line x1={ex - 5} y1={ey - 5} x2={ex + 5} y2={ey + 5} />
                      <line x1={ex - 5} y1={ey + 5} x2={ex + 5} y2={ey - 5} />
                    </g>
                  )}
                  <g>
                    <rect
                      x={mx - msg.label.length * 3.1 - 5}
                      y={my - 9}
                      width={msg.label.length * 6.2 + 10}
                      height={17}
                      rx={5}
                      fill="var(--surface)"
                      stroke={color}
                      strokeOpacity={0.5}
                    />
                    <text x={mx} y={my + 3.5} textAnchor="middle" fontSize={10} fill={color} fontFamily="var(--font-geist-mono)">
                      {msg.label}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>

          {m.nodes.map((n) => {
            const s: NodeState = step.nodes[n.id] ?? {};
            const stroke = s.down ? "var(--err)" : s.tone ? toneVar[s.tone] : "var(--border-strong)";
            return (
              <g key={n.id} opacity={s.down ? 0.55 : 1}>
                <rect
                  x={n.x - NW / 2}
                  y={n.y - NH / 2}
                  width={NW}
                  height={NH}
                  rx={10}
                  fill="var(--surface-2)"
                  stroke={stroke}
                  strokeWidth={s.tone || s.down ? 1.6 : 1}
                  strokeDasharray={n.client ? "4 3" : s.down ? "3 3" : undefined}
                />
                <text x={n.x} y={n.client ? n.y + 4 : n.y - 3} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--fg)">
                  {n.label}
                </text>
                {!n.client && (
                  <text x={n.x} y={n.y + 12} textAnchor="middle" fontSize={10} fill={s.tone ? toneVar[s.tone] : "var(--fg-muted)"} fontFamily="var(--font-geist-mono)">
                    {s.value ?? ""}
                  </text>
                )}
                {s.role && (
                  <text x={n.x} y={n.y - NH / 2 - 5} textAnchor="middle" fontSize={9.5} fill={s.down ? "var(--err)" : "var(--fg-subtle)"} fontFamily="var(--font-geist-mono)">
                    {s.role.toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-subtle">
            Step {i + 1} of {m.steps.length}
          </p>
          <p className="mt-0.5 min-h-[66px] text-[14px] leading-relaxed text-fg" aria-live="polite">
            {step.text}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5 pt-1">
          <Button size="sm" variant="secondary" aria-label="Previous step" disabled={i === 0} onClick={() => go(i - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="sm" variant="primary" aria-label="Next step" disabled={i === m.steps.length - 1} onClick={() => go(i + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {m.steps.map((_, k) => (
          <span key={k} className={cn("h-1 flex-1 rounded-full", k <= i ? "bg-accent" : "bg-surface-3")} />
        ))}
      </div>
    </VisualFrame>
  );
}
