import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/drill/types";

/** The "engine" is what each node uses to store its share of the keys. */
export const ENGINES: DbEngine[] = [
  {
    id: "lsm",
    label: "LSM-tree store",
    family: "Key-value",
    blurb: "RocksDB or LevelDB style: writes go to memory and a log, then merge into sorted files.",
    fit: "The classic choice for this design. Writes are sequential appends, which is why Dynamo-style stores take so many of them. Reads may check several files, softened by bloom filters.",
  },
  {
    id: "btree",
    label: "B-tree store",
    family: "SQL",
    blurb: "Postgres, MySQL or SQLite: updates in place on sorted pages.",
    fit: "Excellent reads and range scans. Every write updates a page in place, so a write-heavy cluster pays more disk work, and you carry features (SQL, joins) a key-value store never uses.",
  },
  {
    id: "memory",
    label: "In-memory store",
    family: "Key-value",
    blurb: "Redis style: everything in RAM with an append-only file.",
    fit: "Microsecond lookups, but capacity is limited by RAM and each node must hold its whole partition in memory. Very expensive for terabytes.",
  },
  {
    id: "wide",
    label: "Wide-column store",
    family: "Wide-column",
    blurb: "Cassandra style: itself a Dynamo-inspired design.",
    fit: "If you used this you'd be adopting the system you're designing. Reasonable in practice, but it defeats the learning here.",
  },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-kv", name: "kv", columns: [{ id: "c-key", name: "key", type: "varchar(255)", pk: true, unique: false }] }],
};

const lower = (c: Column) => c.name.trim().toLowerCase();
const table = (s: SchemaDesign, re: RegExp): Table | undefined => s.tables.find((t) => re.test(t.name.trim().toLowerCase()));
const col = (t: Table, re: RegExp) => t.columns.find((c) => re.test(lower(c)));

export const SCHEMA_CHECKS: SchemaCheck[] = [
  {
    id: "engine",
    label: "A storage engine is chosen",
    check: (s) => (s.engine ? null : "Pick the engine every node uses to store its keys. The notes say what each one costs a write-heavy store."),
  },
  {
    id: "key",
    label: "Values are found by key",
    check: (s) => {
      const t = table(s, /^kv$|store|data|item|entries|keys?$/);
      if (!t) return "Add the table that holds data: one row per key.";
      const k = col(t, /^key$|^k$|key_?id|^id$/);
      if (!k) return "Add a key column.";
      if (!k.pk && !k.unique) return "Every get is “find this key”. Make it the primary key.";
      if (k.type === "integer" || k.type === "bigint") return "Keys are arbitrary strings (map:indie-night-bandra). Use text or varchar.";
      return null;
    },
  },
  {
    id: "value",
    label: "The value is opaque",
    check: (s) => {
      const t = table(s, /^kv$|store|data|item|entries|keys?$/);
      if (!t) return "Add the table that holds data first.";
      if (!col(t, /value|blob|data|payload|body/)) return "Add a value column. The store never looks inside it.";
      return null;
    },
  },
  {
    id: "version",
    label: "Each value carries its version",
    check: (s) => {
      const t = table(s, /^kv$|store|data|item|entries|keys?$/);
      if (!t) return "Add the table that holds data first.";
      if (!col(t, /version|clock|vector|context|rev|ts|timestamp|updated/))
        return "With several copies, two replicas can hold different values for the same key. Add a version (a vector clock or timestamp) so they can tell which is newer.";
      return null;
    },
  },
  {
    id: "tombstone",
    label: "Deletes are remembered",
    check: (s) => {
      const t = table(s, /^kv$|store|data|item|entries|keys?$/);
      if (!t) return "Add the table that holds data first.";
      if (!col(t, /tombstone|deleted|is_deleted|removed/))
        return "If a delete just removes the row, a replica that missed it will happily push the old value back (“resurrection”). Keep a tombstone marker and purge it later.";
      return null;
    },
  },
  {
    id: "ring",
    label: "Who owns which slice of the ring is recorded",
    check: (s) => {
      const t = table(s, /ring|partition|token|node|member|shard/);
      if (!t) return "Add a table for cluster membership: which node owns which slice of the hash ring.";
      if (!col(t, /node|host|server/)) return "Add the node that owns each slice.";
      if (!col(t, /token|range|start|partition|slot|hash/)) return "Add the token (or range start) of each slice.";
      return null;
    },
  },
  {
    id: "hints",
    label: "Writes for a dead replica can be held",
    check: (s) => {
      const t = table(s, /hint|handoff|pending|outbox|missed/);
      if (!t) return "When a replica is down, a stand-in node should keep its writes and hand them back later. Add a hints table: target node, key, value.";
      if (!col(t, /target|node|dest|owner/)) return "A hint must say which node it belongs to.";
      return null;
    },
  },
];
