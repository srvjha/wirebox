// Relative imports keep this file runnable under vitest (no path aliases there).
import type { ServerSize } from "../../../sim";
import type { LabGraph, LabNode } from "../../../lib/lab/types";

/** A design, described by its parts. Used by the calibration tests to lay out reference and naive designs. */
export type Shape = {
  cdn?: boolean;
  limiter?: boolean;
  lb?: boolean;
  servers?: number;
  size?: ServerSize;
  cache?: boolean;
  shards?: number;
  replica?: boolean;
  queue?: boolean;
  workers?: number;
  /** A third-party API (payments, SMS). Wired from workers, and from servers when `directExternal`. */
  external?: boolean;
  directExternal?: boolean;
  /** WebSocket gateways, and a pub/sub broker joining them. */
  gateways?: number;
  pubsub?: boolean;
};

export function buildGraph(s: Shape): LabGraph {
  const nodes: LabNode[] = [];
  const edges: LabGraph["edges"] = [];
  const wire = (from: string, to: string) => edges.push({ id: `${from}>${to}`, from, to });
  const add = (id: string, kind: LabNode["kind"], extra: Partial<LabNode> = {}) => nodes.push({ id, kind, x: 0, y: 0, ...extra });
  const servers = s.servers ?? 1;
  const gateways = s.gateways ?? 0;

  add("users", "client");
  let fronts = ["users"];
  const chain = (id: string, kind: LabNode["kind"]) => {
    add(id, kind);
    for (const f of fronts) wire(f, id);
    fronts = [id];
  };
  if (s.cdn) chain("cdn", "cdn");
  if (s.limiter) chain("limiter", "limiter");
  if (s.lb) chain("lb", "lb");
  add("db", "db", { role: "primary", shards: s.shards ?? 1 });
  if (s.replica) add("replica", "db", { role: "replica", shards: s.shards ?? 1 });
  if (s.cache) add("redis", "cache");
  if (s.queue) add("queue", "queue");
  if (s.external) add("provider", "external");
  if (s.pubsub) add("pubsub", "pubsub");
  for (let i = 0; i < servers; i++) {
    const id = `server-${i}`;
    add(id, "server", { size: s.size ?? "s" });
    for (const f of fronts) wire(f, id);
    wire(id, "db");
    if (s.replica) wire(id, "replica");
    if (s.cache) wire(id, "redis");
    if (s.queue) wire(id, "queue");
    if (s.external && s.directExternal) wire(id, "provider");
    if (s.pubsub) wire(id, "pubsub");
  }
  for (let i = 0; i < gateways; i++) {
    const id = `ws-${i}`;
    add(id, "ws");
    wire("users", id);
    if (s.pubsub) {
      wire(id, "pubsub");
      wire("pubsub", id);
    }
    if (s.cache) wire(id, "redis");
    wire(id, "db");
  }
  for (let i = 0; i < (s.workers ?? 0); i++) {
    const id = `worker-${i}`;
    add(id, "worker");
    if (s.queue) wire("queue", id);
    wire(id, "db");
    if (s.cache) wire(id, "redis");
    if (s.external) wire(id, "provider");
  }
  return { nodes, edges };
}
