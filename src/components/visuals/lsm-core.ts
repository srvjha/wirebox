import { bloomHas, buildBloom } from "./bloom-core";

/**
 * A tiny but honest LSM tree: a sorted memtable, immutable SSTables with a
 * Bloom filter each, overlapping L0 tables, and two non-overlapping levels.
 * Values of `null` are tombstones (deletes). All functions are pure.
 */

export const MEM_CAP = 4;
export const L0_MAX = 3;
export const L1_MAX = 10;
/** Like RocksDB, refuse writes when L0 piles up this high without compaction. */
export const L0_STALL = 8;
const BLOOM_M = 32;
const BLOOM_K = 2;

export type Entry = { key: string; value: string | null; seq: number };
export type SSTable = { id: number; entries: Entry[]; bloom: Uint8Array };

export type Lsm = {
  mem: Entry[];
  l0: SSTable[]; // newest first
  l1: SSTable | null;
  l2: SSTable | null;
  seq: number;
  nextId: number;
  userWrites: number;
  diskWrites: number;
  compactions: number;
  autoCompact: boolean;
  events: string[];
};

export function emptyLsm(): Lsm {
  return { mem: [], l0: [], l1: null, l2: null, seq: 0, nextId: 1, userWrites: 0, diskWrites: 0, compactions: 0, autoCompact: true, events: [] };
}

function makeTable(id: number, entries: Entry[]): SSTable {
  const sorted = [...entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { id, entries: sorted, bloom: buildBloom(sorted.map((e) => e.key), BLOOM_M, BLOOM_K) };
}

/** Merge runs, keeping the newest version of each key. Optionally drop tombstones. */
function merge(runs: Entry[][], dropTombstones: boolean): Entry[] {
  const latest = new Map<string, Entry>();
  for (const run of runs) for (const e of run) {
    const cur = latest.get(e.key);
    if (!cur || e.seq > cur.seq) latest.set(e.key, e);
  }
  return [...latest.values()].filter((e) => !(dropTombstones && e.value === null));
}

function log(s: Lsm, msg: string): string[] {
  if (s.events[0] === msg) return s.events;
  return [msg, ...s.events].slice(0, 6);
}

export function compactL0(s: Lsm): Lsm {
  if (!s.l0.length) return s;
  // L1 is the bottom level only if L2 is empty, in which case tombstones can go.
  const merged = merge([...s.l0.map((t) => t.entries), s.l1?.entries ?? []], !s.l2);
  const l1 = merged.length ? makeTable(s.nextId, merged) : null;
  let next: Lsm = {
    ...s,
    l0: [],
    l1,
    nextId: s.nextId + 1,
    diskWrites: s.diskWrites + merged.length,
    compactions: s.compactions + 1,
    events: log(s, `Compacted ${s.l0.length} L0 table${s.l0.length > 1 ? "s" : ""}${s.l1 ? " + L1" : ""} → L1 (${merged.length} entries rewritten)`),
  };
  if (l1 && l1.entries.length > L1_MAX) next = compactL1(next);
  return next;
}

export function compactL1(s: Lsm): Lsm {
  if (!s.l1) return s;
  const merged = merge([s.l1.entries, s.l2?.entries ?? []], true);
  return {
    ...s,
    l1: null,
    l2: merged.length ? makeTable(s.nextId, merged) : null,
    nextId: s.nextId + 1,
    diskWrites: s.diskWrites + merged.length,
    compactions: s.compactions + 1,
    events: log(s, `L1 grew past ${L1_MAX} → merged into L2 (${merged.length} entries rewritten, tombstones dropped)`),
  };
}

export function compactAll(s: Lsm): Lsm {
  let next = compactL0(s);
  if (next.l1) next = compactL1(next);
  return next;
}

function flush(s: Lsm): Lsm {
  const table = makeTable(s.nextId, s.mem);
  let next: Lsm = {
    ...s,
    mem: [],
    l0: [table, ...s.l0],
    nextId: s.nextId + 1,
    diskWrites: s.diskWrites + table.entries.length,
    events: log(s, `Memtable full → flushed as SSTable #${table.id} in L0 (one sequential write)`),
  };
  if (next.autoCompact && next.l0.length > L0_MAX) next = compactL0(next);
  return next;
}

export function put(s: Lsm, key: string, value: string | null): Lsm {
  if (s.l0.length >= L0_STALL) return { ...s, events: log(s, `Write stall: ${s.l0.length} L0 tables waiting for compaction`) };
  const seq = s.seq + 1;
  const mem = [...s.mem.filter((e) => e.key !== key), { key, value, seq }].sort((a, b) => (a.key < b.key ? -1 : 1));
  const next: Lsm = { ...s, mem, seq, userWrites: s.userWrites + 1 };
  return mem.length >= MEM_CAP ? flush(next) : next;
}

export type ReadStep = { where: string; outcome: "miss" | "bloom-skip" | "searched-miss" | "hit" };
export type ReadResult = { key: string; steps: ReadStep[]; value: string | null | undefined; diskReads: number; bloomSkips: number };

export function read(s: Lsm, key: string): ReadResult {
  const steps: ReadStep[] = [];
  const m = s.mem.find((e) => e.key === key);
  if (m) return { key, steps: [{ where: "Memtable", outcome: "hit" }], value: m.value, diskReads: 0, bloomSkips: 0 };
  steps.push({ where: "Memtable", outcome: "miss" });
  const tables: [string, SSTable][] = [
    ...s.l0.map((t): [string, SSTable] => [`L0 #${t.id}`, t]),
    ...(s.l1 ? [[`L1 #${s.l1.id}`, s.l1] as [string, SSTable]] : []),
    ...(s.l2 ? [[`L2 #${s.l2.id}`, s.l2] as [string, SSTable]] : []),
  ];
  let diskReads = 0;
  let bloomSkips = 0;
  for (const [where, t] of tables) {
    if (!bloomHas(t.bloom, key, BLOOM_K)) {
      steps.push({ where, outcome: "bloom-skip" });
      bloomSkips++;
      continue;
    }
    diskReads++;
    const e = t.entries.find((x) => x.key === key);
    if (e) {
      steps.push({ where, outcome: "hit" });
      return { key, steps, value: e.value, diskReads, bloomSkips };
    }
    steps.push({ where, outcome: "searched-miss" });
  }
  return { key, steps, value: undefined, diskReads, bloomSkips };
}

export function liveKeys(s: Lsm): number {
  const all = merge([s.l2?.entries ?? [], s.l1?.entries ?? [], ...s.l0.map((t) => t.entries), s.mem], true);
  return all.length;
}

export function diskEntries(s: Lsm): number {
  return s.l0.reduce((n, t) => n + t.entries.length, 0) + (s.l1?.entries.length ?? 0) + (s.l2?.entries.length ?? 0);
}
