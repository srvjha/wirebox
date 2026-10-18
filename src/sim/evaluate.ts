import {
  ALLOWED_TARGETS,
  DB_WRITE_CAP,
  DB_WRITE_MS,
  HOT_UTIL,
  LARGEST_SERVER,
  SPECS,
  TIMEOUT_MS,
  monthlyCost,
  nodeCap,
  serverSize,
  type Kind,
  type ServerSize,
} from "./spec";
import { TRAFFIC, limiterEffect, type CacheProfile, type LimiterConfig } from "./traffic";

export type SimNode = {
  id: string;
  kind: Kind;
  size?: ServerSize;
  role?: "primary" | "replica";
  /** Databases: shard count (1-16). */
  shards?: number;
  /** cdn / cache: share of cacheable requests answered here (flow steps). */
  hitRate?: number;
};
export type SimEdge = { from: string; to: string };

export type Resilience = {
  /** Load balancer stops routing to servers that fail health checks. */
  healthChecks: boolean;
  /** A replica is promoted when the primary database dies. */
  failover: boolean;
  /** Where servers send reads: any wired database, or only the primary. */
  readFrom: "any" | "primary";
};

export const DEFAULT_RESILIENCE: Resilience = { healthChecks: false, failover: false, readFrom: "any" };

export type Load = {
  /** Real users' reads per second. */
  reads: number;
  /** Real users' writes per second. */
  writes: number;
  /** Abusive reads per second (a scraper asking for random keys). */
  attack: number;
  /** Reads answered by browsers without reaching us (counted as served). */
  clientCached?: number;
};

export type CacheState = CacheProfile & {
  /** 0 = empty, 1 = fully warm. */
  warmth: number;
  coalesce: boolean;
  writeThrough: boolean;
};

export type EvalInput = {
  nodes: SimNode[];
  edges: SimEdge[];
  load: Load;
  cache: CacheState;
  limiter: LimiterConfig | null;
  resilience: Resilience;
  /** Nodes that are dead right now. */
  down?: string[];
  /** Dead servers the load balancer hasn't noticed yet. */
  undetected?: string[];
  /** Replica currently acting as the primary after a failover. */
  promoted?: string | null;
  dbLabel?: string;
};

export type NodeStat = {
  load: number;
  cap: number;
  util: number;
  down: boolean;
  reads?: number;
  writes?: number;
  p99?: number;
  /** ws gateways (flow steps): open connections vs the gateway's limit. */
  conns?: number;
  connCap?: number;
  /** workers / queues (flow steps): jobs waiting. */
  backlog?: number;
  /** Databases (flow steps): shard count and the hottest shard's utilisation. */
  shards?: number;
  hotUtil?: number;
};

export type EvalResult = {
  /** Real requests offered (incl. browser-cached). */
  legit: number;
  /** Real requests answered correctly. */
  served: number;
  /** Real requests that got a 404 for something that exists (stale replica read). */
  stale: number;
  /** Real requests answered with another key's data. */
  wrong: number;
  /** Real requests rejected by the rate limiter. */
  limitedLegit: number;
  attack: number;
  limitedAttack: number;
  /** Replica lag in ms (0 without replicas). */
  lagMs: number;
  p99: number;
  cost: number;
  nodes: Record<string, NodeStat>;
  edges: Record<string, number>;
  issues: string[];
};

type Flow = { r: number; w: number; a: number };
const ZERO: Flow = { r: 0, w: 0, a: 0 };
const add = (x: Flow, y: Flow): Flow => ({ r: x.r + y.r, w: x.w + y.w, a: x.a + y.a });
const scale = (x: Flow, k: number): Flow => ({ r: x.r * k, w: x.w * k, a: x.a * k });
const total = (x: Flow) => x.r + x.w + x.a;

const NETWORK_HOP_MS = 0.5;

/** p99 response time of a node with mean service time `ms` at utilisation `util` (M/M/1). */
export function p99Of(ms: number, util: number) {
  if (ms === 0) return 0;
  if (util >= 0.98) return TIMEOUT_MS;
  return Math.min(TIMEOUT_MS, (ms * 4.6) / (1 - util));
}

export function replicaLagMs(primaryUtil: number) {
  return Math.round(250 + 2500 * Math.max(0, primaryUtil - 0.6));
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function evaluate(input: EvalInput): EvalResult {
  const { nodes, edges, load, cache, limiter, resilience } = input;
  const dbLabel = input.dbLabel ?? "Postgres";
  const down = new Set(input.down ?? []);
  const undetected = new Set(input.undetected ?? []);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const issues: string[] = [];
  const label = (k: Kind) => (k === "db" ? dbLabel : SPECS[k].label);

  const stats: Record<string, NodeStat> = {};
  for (const n of nodes) {
    stats[n.id] = { load: 0, cap: nodeCap(n), util: 0, down: down.has(n.id) };
  }
  const edgeRps: Record<string, number> = {};
  const flowEdge = (from: string, to: string, rps: number) => {
    edgeRps[`${from}>${to}`] = (edgeRps[`${from}>${to}`] ?? 0) + rps;
  };

  const outs = (id: string) => {
    const from = byId.get(id);
    if (!from) return [];
    return edges
      .filter((e) => e.from === id)
      .map((e) => byId.get(e.to))
      .filter((n): n is SimNode => !!n && ALLOWED_TARGETS[from.kind].includes(n.kind));
  };

  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (a && b && !ALLOWED_TARGETS[a.kind].includes(b.kind)) {
      issues.push(`${label(a.kind)} can't send requests to ${label(b.kind)}. That wire is ignored.`);
    }
  }

  const clientCached = load.clientCached ?? 0;
  const legit = load.reads + load.writes + clientCached;
  const result = (partial: Partial<EvalResult>): EvalResult => ({
    legit,
    served: clientCached,
    stale: 0,
    wrong: 0,
    limitedLegit: 0,
    attack: load.attack,
    limitedAttack: 0,
    lagMs: 0,
    p99: TIMEOUT_MS,
    cost: monthlyCost(nodes),
    nodes: stats,
    edges: edgeRps,
    issues,
    ...partial,
  });

  const client = nodes.find((n) => n.kind === "client");
  if (!client) {
    issues.push("Add Users so there's traffic to test.");
    return result({});
  }
  const entry = outs(client.id);
  if (entry.length === 0) {
    issues.push("Wire Users to an API server, a load balancer or a rate limiter.");
    return result({});
  }
  if (entry.length > 1) {
    issues.push("Users send to one address. To spread traffic over several machines, put a load balancer in front.");
  }

  // ---- Front tier: limiter -> load balancer -> servers ----
  const serverIn = new Map<string, Flow>();
  let limitedLegit = 0;
  let limitedAttack = 0;
  let frontFailed = 0;
  const frontPath = new Map<string, string[]>(); // server id -> node ids before it

  const toServer = (id: string, f: Flow, path: string[]) => {
    serverIn.set(id, add(serverIn.get(id) ?? ZERO, f));
    if (!frontPath.has(id)) frontPath.set(id, path);
  };

  const deliver = (node: SimNode, f: Flow, from: string, path: string[]) => {
    flowEdge(from, node.id, total(f));
    stats[node.id].load += total(f);
    stats[node.id].util = stats[node.id].load / stats[node.id].cap;
    if (node.kind === "server") return toServer(node.id, f, path);

    if (node.kind === "limiter") {
      const eff = limiter
        ? limiterEffect(limiter, { legit: f.r + f.w, attack: f.a })
        : { legitPass: 1, attackPass: 1, note: "" };
      limitedLegit += (f.r + f.w) * (1 - eff.legitPass);
      limitedAttack += f.a * (1 - eff.attackPass);
      if (limiter && eff.note && eff.legitPass < 0.999) issues.push(eff.note);
      const passed: Flow = { r: f.r * eff.legitPass, w: f.w * eff.legitPass, a: f.a * eff.attackPass };
      const next = outs(node.id);
      if (next.length === 0) {
        issues.push("Wire the rate limiter to a load balancer or an API server.");
        frontFailed += passed.r + passed.w;
        return;
      }
      if (next.length > 1) issues.push("The rate limiter sends to one place. Put a load balancer after it.");
      return deliver(next[0], passed, node.id, [...path, node.id]);
    }

    if (node.kind === "lb") {
      const cap = stats[node.id].cap;
      const ok = Math.min(1, cap / Math.max(1, stats[node.id].load));
      const targets = outs(node.id);
      if (targets.length === 0) {
        issues.push("The load balancer has no API servers to send to.");
        frontFailed += f.r + f.w;
        return;
      }
      const pool = resilience.healthChecks
        ? targets.filter((t) => !down.has(t.id) || undetected.has(t.id))
        : targets;
      if (pool.length === 0) {
        frontFailed += f.r + f.w;
        return;
      }
      frontFailed += (f.r + f.w) * (1 - ok);
      const share = scale(f, ok / pool.length);
      for (const t of pool) deliver(t, share, node.id, [...path, node.id]);
    }
  };

  deliver(entry[0], { r: load.reads, w: load.writes, a: load.attack }, client.id, []);

  // ---- Servers ----
  type Plan = {
    id: string;
    r: number;
    w: number;
    a: number;
    hit: number;
    cacheId?: string;
    readDbs: string[];
    writeDb?: string;
  };
  const plans: Plan[] = [];
  const cacheOps = new Map<string, number>();
  const dbReads = new Map<string, number>();
  const dbWrites = new Map<string, number>();
  let serverFailed = 0;
  const dbs = nodes.filter((n) => n.kind === "db");
  const primaryId =
    input.promoted ??
    dbs.find((d) => (d.role ?? "primary") === "primary")?.id ??
    dbs[0]?.id;
  const isPrimary = (id: string) => id === primaryId;

  let noDbWarned = false;
  let replicaWriteWarned = false;
  let primaryDownWarned = false;

  for (const [id, f] of serverIn) {
    const node = byId.get(id)!;
    const st = stats[id];
    const offered = total(f);
    if (down.has(id)) {
      serverFailed += f.r + f.w;
      continue;
    }
    const ok = Math.min(1, st.cap / Math.max(1e-9, offered));
    st.util = offered / st.cap;
    serverFailed += (f.r + f.w) * (1 - ok);

    const r = f.r * ok;
    const w = f.w * ok;
    const a = f.a * ok;
    const targets = outs(id);
    const cacheNode = targets.find((t) => t.kind === "cache" && !down.has(t.id));
    const wiredDbs = targets.filter((t) => t.kind === "db");
    if (wiredDbs.length === 0) {
      if (!noDbWarned) issues.push(`An API server has no database, so every request it takes fails.`);
      noDbWarned = true;
      serverFailed += r + w;
      continue;
    }
    const upDbs = wiredDbs.filter((d) => !down.has(d.id));
    const writable = upDbs.filter((d) => isPrimary(d.id));
    const readable = resilience.readFrom === "primary" ? writable : upDbs;

    if (writable.length === 0 && w > 0) {
      const wiredToPrimary = wiredDbs.some((d) => isPrimary(d.id));
      if (!wiredToPrimary && !replicaWriteWarned) {
        issues.push(`An API server isn't wired to the primary ${dbLabel}. Replicas are read-only, so its writes fail.`);
        replicaWriteWarned = true;
      } else if (wiredToPrimary && !primaryDownWarned) {
        issues.push(`The primary ${dbLabel} is down, so every write fails until a replica is promoted.`);
        primaryDownWarned = true;
      }
    }

    const hit = cacheNode ? cache.hit * cache.warmth : 0;
    let readsToDb = r * (1 - hit) + a;
    if (cacheNode && cache.coalesce && cache.warmth < 1 && !cache.wrong) {
      // Concurrent misses on a hot key wait for one refill instead of all querying.
      const hotMiss = r * TRAFFIC.hotShare * (1 - cache.warmth);
      readsToDb -= hotMiss - Math.min(hotMiss, TRAFFIC.hotKeys * 5);
    }
    if (cache.hitNeedsDb) readsToDb += r * hit;

    if (cacheNode) {
      const ops = r + a + (cache.writeThrough ? w : 0);
      cacheOps.set(cacheNode.id, (cacheOps.get(cacheNode.id) ?? 0) + ops);
      flowEdge(id, cacheNode.id, ops);
    }
    for (const d of readable) {
      dbReads.set(d.id, (dbReads.get(d.id) ?? 0) + readsToDb / readable.length);
      flowEdge(id, d.id, readsToDb / readable.length);
    }
    if (writable[0]) {
      dbWrites.set(writable[0].id, (dbWrites.get(writable[0].id) ?? 0) + w);
      flowEdge(id, writable[0].id, w);
    }
    plans.push({
      id,
      r,
      w,
      a,
      hit,
      cacheId: cacheNode?.id,
      readDbs: readable.map((d) => d.id),
      writeDb: writable[0]?.id,
    });
    if (st.util >= 1) {
      const size = serverSize(node.size);
      issues.push(
        size.id === LARGEST_SERVER.id
          ? `An API server is at ${pct(st.util)}, and it's already the biggest machine (${size.vcpu} vCPU, ${fmt(size.cap)} req/s). One box can't go further: add more servers.`
          : `An API server is at ${pct(st.util)}. A ${size.vcpu} vCPU server handles ${fmt(size.cap)} req/s, so ${pct(1 - ok)} of its requests time out.`,
      );
    } else if (st.util >= HOT_UTIL) {
      issues.push(`An API server is at ${pct(st.util)}. Past ~${pct(HOT_UTIL)}, requests queue and tail latency climbs steeply.`);
    }
  }

  // ---- Replication: every replica applies every write the primary takes ----
  const primaryWrites = primaryId ? (dbWrites.get(primaryId) ?? 0) : 0;
  for (const d of dbs) {
    if (!isPrimary(d.id) && !down.has(d.id)) {
      dbWrites.set(d.id, (dbWrites.get(d.id) ?? 0) + primaryWrites);
    }
  }

  // ---- Caches and databases ----
  const okOf = new Map<string, number>();
  for (const [id, ops] of cacheOps) {
    const st = stats[id];
    st.load = ops;
    st.util = ops / st.cap;
    okOf.set(id, Math.min(1, st.cap / Math.max(1e-9, ops)));
    st.p99 = p99Of(SPECS.cache.serviceMs, st.util);
    if (st.util >= 1) issues.push(`Redis is at ${pct(st.util)} of its ${fmt(st.cap)} ops/s.`);
  }
  for (const d of dbs) {
    const st = stats[d.id];
    const reads = dbReads.get(d.id) ?? 0;
    const writes = dbWrites.get(d.id) ?? 0;
    st.reads = reads;
    st.writes = writes;
    st.load = reads + writes;
    st.util = reads / st.cap + writes / DB_WRITE_CAP;
    okOf.set(d.id, st.down ? 0 : Math.min(1, 1 / Math.max(1e-9, st.util)));
    const ms = (SPECS.db.serviceMs * reads + DB_WRITE_MS * writes) / Math.max(1, reads + writes);
    st.p99 = p99Of(ms, st.util);
    if (!st.down && st.util >= 1) {
      issues.push(
        `${dbLabel} is at ${pct(st.util)}. One node handles ${fmt(st.cap)} reads/s or ${fmt(DB_WRITE_CAP)} writes/s.`,
      );
    } else if (!st.down && st.util >= HOT_UTIL) {
      issues.push(`${dbLabel} is at ${pct(st.util)}. Past ~${pct(HOT_UTIL)}, queries queue and latency climbs.`);
    }
  }

  // ---- Who got a correct answer ----
  const primaryUtil = primaryId ? stats[primaryId].util : 0;
  const hasReplica = dbs.some((d) => !isPrimary(d.id) && !down.has(d.id));
  const lagMs = hasReplica ? replicaLagMs(primaryUtil) : 0;
  let served = clientCached;
  let stale = 0;
  let wrong = 0;
  let p99 = 0;

  for (const p of plans) {
    const cacheOk = p.cacheId ? (okOf.get(p.cacheId) ?? 0) : 0;
    const readDbOk = p.readDbs.length
      ? p.readDbs.reduce((s, id) => s + (okOf.get(id) ?? 0), 0) / p.readDbs.length
      : 0;
    const writeOk = p.writeDb ? (okOf.get(p.writeDb) ?? 0) : 0;

    const hits = p.r * p.hit;
    const misses = p.r - hits;
    let readOk: number;
    if (cache.wrong) {
      wrong += hits * cacheOk;
      readOk = misses * readDbOk;
    } else if (cache.hitNeedsDb) {
      readOk = hits * cacheOk * readDbOk + misses * readDbOk;
    } else {
      readOk = hits * cacheOk + misses * readDbOk;
    }

    // Fresh items: a cache miss (unless written through) that may land on a lagging replica.
    const replicaShare = p.readDbs.length
      ? p.readDbs.filter((id) => !isPrimary(id)).length / p.readDbs.length
      : 0;
    const freshInCache = cache.writeThrough && p.cacheId && !cache.wrong;
    const pStale = Math.min(1, lagMs / TRAFFIC.freshMs);
    const staleHere = freshInCache ? 0 : p.r * TRAFFIC.freshShare * replicaShare * pStale * readDbOk;
    stale += staleHere;
    served += Math.max(0, readOk - staleHere) + p.w * writeOk;

    // Latency of this server's paths.
    const traffic = p.r + p.w;
    if (traffic / Math.max(1, load.reads + load.writes) < 0.01) continue;
    const front = (frontPath.get(p.id) ?? []).reduce(
      (s, id) => s + NETWORK_HOP_MS + p99Of(SPECS[byId.get(id)!.kind].serviceMs, stats[id].util),
      NETWORK_HOP_MS,
    );
    const server = p99Of(SPECS.server.serviceMs, stats[p.id].util);
    const cacheLat = p.cacheId ? NETWORK_HOP_MS + (stats[p.cacheId].p99 ?? 0) : 0;
    const readDbLat = p.readDbs.length
      ? Math.max(...p.readDbs.map((id) => NETWORK_HOP_MS + (stats[id].p99 ?? 0)))
      : TIMEOUT_MS;
    const writeLat = p.writeDb ? NETWORK_HOP_MS + (stats[p.writeDb].p99 ?? 0) : TIMEOUT_MS;
    const paths: number[] = [];
    if (p.hit > 0.01) paths.push(cacheLat);
    if (1 - p.hit > 0.01 || cache.hitNeedsDb) paths.push(cacheLat + readDbLat);
    if (p.w / traffic > 0.01) paths.push(writeLat);
    p99 = Math.max(p99, front + server + Math.max(0, ...paths));
  }

  const failedShare = 1 - (served + wrong + stale) / Math.max(1, legit - limitedLegit);
  if (failedShare > 0.01 || frontFailed + serverFailed > 0.01 * legit) p99 = TIMEOUT_MS;
  p99 = Math.min(TIMEOUT_MS, Math.round(p99));

  if (stale > 0.5) {
    issues.push(
      `About ${fmt(stale)} reads a second 404 for items created moments ago: they went to a replica that's ~${fmt(lagMs)} ms behind the primary.`,
    );
  }
  if (cache.note && plans.some((p) => p.cacheId)) issues.push(cache.note);
  if (clientCached > 0) {
    issues.push(
      `A permanent redirect is cached by browsers: ${pct(clientCached / legit)} of clicks never reach you, so you can't count them, and you can't change where an old link points.`,
    );
  }

  return result({
    served,
    stale,
    wrong,
    limitedLegit,
    limitedAttack,
    lagMs,
    p99,
    issues: [...new Set(issues)].map((s) => s.replaceAll("Postgres", dbLabel)),
  });
}
