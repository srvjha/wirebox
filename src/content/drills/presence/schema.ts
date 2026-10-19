import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/drill/types";

export const ENGINES: DbEngine[] = [
  {
    id: "postgres",
    label: "Postgres",
    family: "SQL",
    blurb: "Relational, composite keys, indexes.",
    fit: "A good home for friendships (composite key, indexed in both directions) and a durable “last seen”. The live “online now” bit belongs in memory (Redis) with a timeout; a relational table can't take a write per user every 20 seconds.",
  },
  {
    id: "cassandra",
    label: "Cassandra",
    family: "Wide-column",
    blurb: "Enormous write throughput, per-row TTL.",
    fit: "Built for exactly this write pattern, a firehose of tiny updates keyed by user, with TTL to expire silent users. Operationally heavy for a product this size.",
  },
  {
    id: "dynamodb",
    label: "DynamoDB",
    family: "Key-value",
    blurb: "Key-value store with native TTL.",
    fit: "Lookup by user id with an expiring attribute fits well, and a friend list is one query on a partition key. Pay-per-request gets pricey at 20k writes a second.",
  },
  {
    id: "mongodb",
    label: "MongoDB",
    family: "Document",
    blurb: "Documents; a friend list embeds naturally.",
    fit: "A user document with an embedded friends array works until a celebrity has millions of friends. TTL indexes handle expiry.",
  },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-presence", name: "presence", columns: [{ id: "c-user", name: "user_id", type: "bigint", pk: true, unique: false }] }],
};

const cols = (s: SchemaDesign) => s.tables.flatMap((t) => t.columns.map((c) => ({ table: t, col: c })));
const find = (s: SchemaDesign, re: RegExp): { table: Table; col: Column } | undefined => cols(s).find(({ col }) => re.test(col.name.trim().toLowerCase()));

export const SCHEMA_CHECKS: SchemaCheck[] = [
  { id: "engine", label: "A database is chosen", check: (s) => (s.engine ? null : "Pick an engine above; the notes say what each fits.") },
  {
    id: "user",
    label: "Presence is one row per user",
    check: (s) => {
      const c = find(s, /^user(_id)?$/);
      if (!c) return "Add user_id: presence belongs to a user.";
      if (!c.col.pk && !c.col.unique) return "A user has exactly one presence. Make user_id the primary key so there can't be two.";
      return null;
    },
  },
  {
    id: "status",
    label: "Status and last seen are recorded",
    check: (s) => {
      const st = find(s, /^(status|state|online)$/);
      const seen = find(s, /last_seen|seen_at|last_active|last_online/);
      if (!st) return "Add status (text) or online (boolean): what you show as the dot.";
      if (!seen) return "Add last_seen (timestamp). It's what you show when someone is offline.";
      if (seen.col.type !== "timestamp") return "Store last_seen as a timestamp.";
      return null;
    },
  },
  {
    id: "gateway",
    label: "You know which gateway holds each connection",
    check: (s) => {
      const c = find(s, /gateway|node|server|conn(ection)?_?(id|host)/);
      if (!c) return "Add gateway_id (text). To push a message to a user, someone has to know which gateway their socket lives on.";
      if (c.col.type !== "text" && c.col.type !== "varchar(255)" && c.col.type !== "integer") return `${c.col.name} identifies a machine: use text or integer.`;
      return null;
    },
  },
  {
    id: "friends",
    label: "Friendships can be looked up from either side",
    check: (s) => {
      const t = s.tables.find((x) => /friend|follow|contact|edge/.test(x.name.trim().toLowerCase()));
      if (!t) return "Add a friendships table: who is friends with whom. Fan-out means “find all friends of X” on every status change.";
      const names = t.columns.map((c) => c.name.trim().toLowerCase());
      if (!names.some((n) => /^user(_id)?$/.test(n)) || !names.some((n) => /^friend(_id)?$/.test(n))) return "Give it two columns, user_id and friend_id.";
      const keyed = t.columns.filter((c) => c.pk).length >= 2 || t.columns.some((c) => c.unique);
      if (!keyed) return "A pair should appear once. Make (user_id, friend_id) the primary key: mark both columns as primary key.";
      return null;
    },
  },
];
