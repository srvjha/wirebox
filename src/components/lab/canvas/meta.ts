import { Database, Gauge, Server, Split, Users, Zap, type LucideIcon } from "lucide-react";
import { SPECS, nodeCap, nodeCost, serverSize, type Kind } from "@/sim";
import type { LabNode } from "@/lib/lab/types";

export const KIND_META: Record<Kind, { icon: LucideIcon; label: string; blurb: string }> = {
  client: { icon: Users, label: "Users", blurb: "Browsers and phones clicking links." },
  limiter: { icon: Gauge, label: "Rate limiter", blurb: "Turns away clients that send too much." },
  lb: { icon: Split, label: "Load balancer", blurb: "Spreads requests over several servers." },
  server: { icon: Server, label: "API server", blurb: "Runs your code for each request." },
  cache: { icon: Zap, label: "Redis cache", blurb: "Keeps hot answers in memory." },
  db: { icon: Database, label: "Database", blurb: "Stores every link, durably." },
};

export const SIZE_LABEL: Record<string, string> = { s: "Small", m: "Medium", l: "Large", xl: "X-large", "2xl": "2X-large" };

export function compact(n: number) {
  if (!Number.isFinite(n)) return "∞";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${Math.round(n)}`;
}

export function nodeTitle(n: LabNode, dbLabel: string) {
  if (n.kind === "db") return `${dbLabel}${n.role === "replica" ? " replica" : ""}`;
  return KIND_META[n.kind].label;
}

export function nodeSub(n: LabNode) {
  if (n.kind === "client") return "sends the test traffic";
  if (n.kind === "server") {
    const s = serverSize(n.size);
    return `${s.vcpu} vCPU · ${compact(s.cap)} req/s`;
  }
  if (n.kind === "db") return `${n.role === "replica" ? "read-only copy" : "primary"} · $${nodeCost(n)}/mo`;
  return `${compact(nodeCap(n))} ops/s · $${SPECS[n.kind].monthlyUsd}/mo`;
}

/** Placement for a new node of this kind, by column, below whatever is already there. */
export function placeNew(kind: Kind, nodes: LabNode[]) {
  const col: Record<Kind, number> = { client: 0, limiter: 220, lb: 440, server: 680, cache: 940, db: 940 };
  const same = nodes.filter((n) => Math.abs(n.x - col[kind]) < 120);
  const y = same.length ? Math.max(...same.map((n) => n.y)) + 100 : 0;
  return { x: col[kind], y };
}

let counter = 0;
export function newId(kind: Kind) {
  counter += 1;
  return `${kind}-${Date.now().toString(36)}${counter}`;
}
