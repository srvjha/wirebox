"use client";

import { useState } from "react";
import { Skull, Vote, Split, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Toggle, VisualFrame, useVisualTracker } from "./distributed-visual-kit";

type Role = "follower" | "candidate" | "leader";
type Node = { role: Role; term: number; votedFor: number | null; alive: boolean; votes: number };
type Sim = { nodes: Node[]; log: string[]; round: number };

const N = 5;
const MAJORITY = 3;
const POS = [0, 1, 2, 3, 4].map((i) => {
  const a = (-90 + i * 72) * (Math.PI / 180);
  return { x: 200 + 120 * Math.cos(a), y: 130 + 95 * Math.sin(a) };
});

function initial(): Sim {
  const nodes: Node[] = Array.from({ length: N }, () => ({ role: "follower", term: 1, votedFor: 0, alive: true, votes: 0 }));
  nodes[0].role = "leader";
  nodes[0].votes = N;
  return { nodes, log: ["Term 1: S1 is leader and sends heartbeats."], round: 0 };
}

/** Heartbeats from a live leader reset everyone alive to follower in the leader's term. */
function settle(s: Sim): Sim {
  const lead = s.nodes.findIndex((n) => n.role === "leader" && n.alive);
  if (lead < 0) return s;
  const term = Math.max(...s.nodes.filter((n) => n.role === "leader" && n.alive).map((n) => n.term));
  const nodes = s.nodes.map((n, i) =>
    n.alive && i !== lead && (n.role !== "follower" || n.term < term)
      ? { ...n, role: "follower" as Role, term: Math.max(n.term, term), votes: 0 }
      : n,
  );
  return { ...s, nodes };
}

export function RaftElectionSim() {
  const tr = useVisualTracker("raft-election-sim");
  const [sim, setSim] = useState<Sim>(initial);
  const [split, setSplit] = useState(false);

  const alive = sim.nodes.filter((n) => n.alive).length;
  const leader = sim.nodes.findIndex((n) => n.role === "leader" && n.alive);
  const nm = (i: number) => `S${i + 1}`;

  const killLeader = () => {
    if (leader < 0) return;
    tr();
    setSim((s) => {
      const nodes = s.nodes.map((n, i) => (i === leader ? { ...n, alive: false } : n));
      return { ...s, nodes, log: [`${nm(leader)} crashes. Followers stop hearing heartbeats.`, ...s.log].slice(0, 8) };
    });
  };

  const toggleAlive = (i: number) => {
    tr();
    setSim((s) => {
      const nodes = s.nodes.map((n, k) => (k === i ? { ...n, alive: !n.alive } : n));
      const msg = nodes[i].alive ? `${nm(i)} comes back (term ${nodes[i].term}).` : `${nm(i)} goes down.`;
      return settle({ ...s, nodes, log: [msg, ...s.log].slice(0, 8) });
    });
  };

  const election = () => {
    tr();
    setSim((s) => {
      if (s.nodes.some((n) => n.role === "leader" && n.alive)) {
        return { ...s, log: ["A live leader exists, so nobody times out. Kill it first.", ...s.log].slice(0, 8) };
      }
      const live = s.nodes.map((n, i) => i).filter((i) => s.nodes[i].alive);
      if (!live.length) return s;
      const round = s.round + 1;
      // Randomised timeouts: a deterministic rotation stands in for the random draw.
      const order = [...live].sort((a, b) => ((a * 7 + round * 3) % 11) - ((b * 7 + round * 3) % 11));
      const nodes = s.nodes.map((n) => ({ ...n, votes: 0, role: n.role === "leader" ? ("follower" as Role) : n.role }));
      const newTerm = Math.max(...live.map((i) => nodes[i].term)) + 1;
      const cands = split && order.length >= 2 ? order.slice(0, 2) : order.slice(0, 1);
      const log: string[] = [];
      cands.forEach((c) => {
        nodes[c] = { ...nodes[c], role: "candidate", term: newTerm, votedFor: c, votes: 1 };
      });
      log.push(`Term ${newTerm}: ${cands.map(nm).join(" and ")} time${cands.length > 1 ? "" : "s"} out and ask${cands.length > 1 ? "" : "s"} for votes.`);
      live.forEach((i, k) => {
        if (cands.includes(i)) return;
        // Each voter answers the first request it sees; with a split, voters alternate.
        const pick = cands[cands.length > 1 ? k % cands.length : 0];
        nodes[i] = { ...nodes[i], term: newTerm, votedFor: pick };
        nodes[pick] = { ...nodes[pick], votes: nodes[pick].votes + 1 };
      });
      let won = -1;
      cands.forEach((c) => {
        if (nodes[c].votes >= MAJORITY) won = c;
      });
      if (won >= 0) {
        nodes[won] = { ...nodes[won], role: "leader" };
        log.push(`${nm(won)} gets ${nodes[won].votes} of ${N} votes (needs ${MAJORITY}) and becomes leader of term ${newTerm}.`);
      } else if (cands.length > 1) {
        log.push(`Split vote: ${cands.map((c) => `${nm(c)} has ${nodes[c].votes}`).join(", ")}. Nobody has ${MAJORITY}. Timeouts expire and a new term starts.`);
      } else {
        log.push(`${nm(cands[0])} gets only ${nodes[cands[0]].votes} of ${N} votes. A majority needs ${MAJORITY}, so it cannot lead. Bring a node back.`);
      }
      return settle({ nodes, round, log: [...log.reverse(), ...s.log].slice(0, 8) });
    });
  };

  const stateText = leader >= 0 ? `${nm(leader)} leads term ${sim.nodes[leader].term}` : alive >= MAJORITY ? "No leader: an election is due" : "No leader and no majority alive";

  return (
    <VisualFrame
      eyebrow="Try it · Raft"
      title="Kill the leader, watch the vote"
      hint="Crash the leader, then start an election. Turn on the split vote to see what happens when two nodes time out together. Click any node to take it down or bring it back."
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-bg p-2">
          <svg viewBox="0 0 400 260" className="h-auto w-full" role="group" aria-label="Five Raft nodes">
            {POS.map((p, i) => (
              <line key={i} x1={p.x} y1={p.y} x2={POS[(i + 2) % N].x} y2={POS[(i + 2) % N].y} stroke="var(--border)" strokeWidth={1} />
            ))}
            {sim.nodes.map((n, i) => {
              const p = POS[i];
              const color = !n.alive ? "var(--fg-subtle)" : n.role === "leader" ? "var(--accent)" : n.role === "candidate" ? "var(--info)" : "var(--fg-muted)";
              return (
                <g
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`${nm(i)}, ${n.alive ? n.role : "down"}, term ${n.term}. Activate to toggle.`}
                  onClick={() => toggleAlive(i)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleAlive(i))}
                  className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[3]"
                  opacity={n.alive ? 1 : 0.45}
                >
                  <circle cx={p.x} cy={p.y} r={30} fill="var(--surface)" stroke={color} strokeWidth={n.role === "leader" && n.alive ? 3 : 2} strokeDasharray={n.alive ? undefined : "4 3"} />
                  <text x={p.x} y={p.y - 4} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--fg)" fontFamily="var(--font-mono)">{nm(i)}</text>
                  <text x={p.x} y={p.y + 11} textAnchor="middle" fontSize={9.5} fill={color} fontFamily="var(--font-mono)">
                    {n.alive ? `${n.role === "candidate" ? "cand" : n.role === "leader" ? "LEAD" : "foll"} t${n.term}` : "down"}
                  </text>
                  {n.alive && n.role === "candidate" && (
                    <text x={p.x} y={p.y - 36} textAnchor="middle" fontSize={10} fill="var(--info)" fontFamily="var(--font-mono)">{n.votes} votes</text>
                  )}
                </g>
              );
            })}
          </svg>
          <p role="status" className={cn("px-2 pb-1 text-center font-mono text-[11.5px]", leader >= 0 ? "text-ok" : "text-warn")}>{stateText}</p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={killLeader} disabled={leader < 0}>
              <Skull className="size-3.5" /> Kill leader
            </Button>
            <Button size="sm" onClick={election}>
              <Vote className="size-3.5" /> Run election
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSim(initial());
                tr();
              }}
            >
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          </div>
          <Toggle label="Two nodes time out together (split vote)" checked={split} onChange={(v) => { setSplit(v); tr(); }} />
          <ol className="flex-1 space-y-1.5 rounded-xl border border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed" aria-live="polite">
            {sim.log.map((l, i) => (
              <li key={`${l}-${i}`} className={cn(i === 0 ? "text-fg" : "text-muted")}>
                <Split className={cn("mr-1.5 inline size-3", i === 0 ? "text-accent" : "text-subtle")} aria-hidden />
                {l}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </VisualFrame>
  );
}
