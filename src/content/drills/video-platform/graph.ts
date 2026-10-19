// Relative imports keep this file runnable under vitest (no path aliases there).
import type { Kind, ServerSize } from "../../../sim";
import type { DrillGraph, DrillNode } from "../../../lib/drill/types";

/**
 * Reference-design builder used by the calibration tests: give it how many of each
 * component you want and it lays them out and wires the usual way (users → front
 * door → servers → stores; queue → workers → stores).
 */
export type Spec = Partial<Record<Exclude<Kind, "client">, number>> & {
  size?: ServerSize;
  shards?: number;
  /** Edges to leave out, e.g. "server>storage". */
  skip?: string[];
};

const FRONT: Kind[] = ["cdn", "limiter", "lb"];
const SERVER_OUT: Kind[] = ["cache", "db", "storage", "queue", "external", "search", "pubsub"];
const WORKER_OUT: Kind[] = ["db", "storage", "external", "cache", "pubsub", "search"];
const COLS: Kind[][] = [["client"], FRONT, ["server", "ws"], ["cache", "pubsub", "queue", "db", "storage", "search"], ["worker"], ["external"]];

export function build(spec: Spec): DrillGraph {
  const nodes: DrillNode[] = [{ id: "users", kind: "client", x: 0, y: 0 }];
  const edges: DrillGraph["edges"] = [];
  const ids = new Map<Kind, string[]>([["client", ["users"]]]);
  const skip = new Set(spec.skip ?? []);
  const count = (k: Kind) => (spec as Record<string, number | undefined>)[k] ?? 0;
  for (const kind of Object.keys(SPEC_KINDS) as Kind[]) {
    for (let i = 0; i < count(kind); i++) {
      const id = count(kind) === 1 ? kind : `${kind}-${i}`;
      const extra: Partial<DrillNode> = kind === "server" ? { size: spec.size ?? "m" } : kind === "db" ? { shards: spec.shards ?? 1, role: "primary" } : {};
      nodes.push({ id, kind, x: 0, y: 0, ...extra });
      ids.set(kind, [...(ids.get(kind) ?? []), id]);
    }
  }
  const wire = (a: Kind, b: Kind) => {
    if (skip.has(`${a}>${b}`)) return;
    for (const f of ids.get(a) ?? []) for (const t of ids.get(b) ?? []) edges.push({ id: `${f}>${t}`, from: f, to: t });
  };
  const chain = ["client", ...FRONT.filter((k) => count(k))] as Kind[];
  const entry: Kind = count("server") ? "server" : "ws";
  for (let i = 0; i < chain.length; i++) wire(chain[i], chain[i + 1] ?? entry);
  if (count("server") && count("ws")) wire("ws", "server");
  for (const k of SERVER_OUT) wire("server", k);
  wire("ws", "pubsub");
  wire("pubsub", "ws");
  wire("ws", "cache");
  wire("ws", "db");
  wire("queue", "worker");
  for (const k of WORKER_OUT) wire("worker", k);
  nodes.forEach((n) => {
    const col = COLS.findIndex((c) => c.includes(n.kind));
    const sameKind = ids.get(n.kind) ?? [];
    n.x = col * 220;
    n.y = sameKind.indexOf(n.id) * 90;
  });
  return { nodes, edges };
}

const SPEC_KINDS: Record<Exclude<Kind, "client">, true> = {
  cdn: true, limiter: true, lb: true, server: true, ws: true, cache: true, pubsub: true, queue: true, db: true, storage: true, search: true, worker: true, external: true,
};
