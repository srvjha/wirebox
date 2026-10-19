import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/drill/types";

export const ENGINES: DbEngine[] = [
  {
    id: "postgres",
    label: "Postgres",
    family: "SQL",
    blurb: "Relational, unique constraints, transactions.",
    fit: "A unique constraint on the idempotency key makes “never send twice” a database guarantee. At a few thousand writes a second it's fine; at hundreds of millions of rows a month you'd partition by date.",
  },
  {
    id: "mysql",
    label: "MySQL",
    family: "SQL",
    blurb: "Relational and widely hosted.",
    fit: "Same story as Postgres: unique keys for dedup, and time-partitioned tables to drop old rows cheaply.",
  },
  {
    id: "dynamodb",
    label: "DynamoDB",
    family: "Key-value",
    blurb: "Managed key-value store, conditional writes, native TTL.",
    fit: "A conditional put (“only if this key doesn't exist”) is a built-in claim operation, and TTL expires old log rows for free. Fewer query options when support asks “all SMS for this fan”.",
  },
  {
    id: "cassandra",
    label: "Cassandra",
    family: "Wide-column",
    blurb: "Enormous write throughput across many nodes.",
    fit: "Great for an append-heavy delivery log. Its lightweight transactions can claim a key, but they're slow, so you would use them sparingly.",
  },
  {
    id: "mongodb",
    label: "MongoDB",
    family: "Document",
    blurb: "JSON documents, unique indexes, TTL indexes.",
    fit: "Each notification is a self-contained document and unique indexes work, but you don't need flexible shapes.",
  },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-notifications", name: "notifications", columns: [{ id: "c-id", name: "id", type: "uuid", pk: true, unique: false }] }],
};

const cols = (s: SchemaDesign) => s.tables.flatMap((t) => t.columns.map((c) => ({ table: t, col: c })));
const find = (s: SchemaDesign, re: RegExp): { table: Table; col: Column } | undefined => cols(s).find(({ col }) => re.test(col.name.trim().toLowerCase()));

export const SCHEMA_CHECKS: SchemaCheck[] = [
  { id: "engine", label: "A database is chosen", check: (s) => (s.engine ? null : "Pick a database engine above. The notes say what each costs you.") },
  {
    id: "recipient",
    label: "Each notification has a recipient and a channel",
    check: (s) => {
      if (!find(s, /^(user|recipient|customer)(_id)?$/)) return "Add user_id: who this notification is for.";
      if (!find(s, /^(channel|medium|kind)$/)) return "Add channel (text): email, sms or push. Providers, limits and costs differ per channel.";
      return null;
    },
  },
  {
    id: "idem",
    label: "A duplicate send is impossible, not just unlikely",
    check: (s) => {
      const c = find(s, /idempot|dedup|request_id|message_key|^key$/);
      if (!c) return "Add idempotency_key (text). Callers and workers retry, and the key is how you recognise the same send twice.";
      if (!c.col.pk && !c.col.unique) return "A key you can't enforce is only a hope. Mark it unique so the database itself rejects the second insert, even if two workers race.";
      return null;
    },
  },
  {
    id: "status",
    label: "You can tell where each message got to",
    check: (s) => {
      const c = find(s, /^status|^state$/);
      if (!c) return "Add status (text): queued, sent, failed. Without it support can't answer “did the email go?”.";
      if (c.col.type !== "text" && c.col.type !== "varchar(255)") return `Status values are words like “sent”: use text, not ${c.col.type}.`;
      return null;
    },
  },
  {
    id: "attempts",
    label: "Retries are visible",
    check: (s) => {
      const c = find(s, /attempt|retr(y|ies)|tries/);
      if (!c) return "Add attempts (integer). It caps retries so a permanently failing message stops, and tells you who is struggling.";
      if (c.col.type !== "integer" && c.col.type !== "bigint") return `${c.col.name} counts attempts: use integer.`;
      return null;
    },
  },
  {
    id: "times",
    label: "Created and sent times are recorded",
    check: (s) => {
      const a = find(s, /^created(_at|_on)?$/);
      const b = find(s, /^(sent|delivered)(_at|_on)?$/);
      if (!a) return "Add created_at (timestamp): how long a message waited is a number you'll be asked for.";
      if (!b) return "Add sent_at (timestamp), empty until the provider accepts it.";
      if (a.col.type !== "timestamp" || b.col.type !== "timestamp") return "Store times as timestamp.";
      return null;
    },
  },
  {
    id: "prefs",
    label: "Opt-outs are stored per user and channel",
    check: (s) => {
      const bools = cols(s).filter(({ col }) => col.type === "boolean");
      const t = s.tables.find((x) => /pref|setting|subscri|opt/.test(x.name.trim().toLowerCase()));
      if (!t && bools.length < 2) return "Add a preferences table (or boolean columns): per-channel opt-ins like email, sms and push.";
      const target = t ?? bools[0].table;
      if (!target.columns.some((c) => /^(user|recipient)(_id)?$/.test(c.name.trim().toLowerCase()) && (c.pk || c.unique)))
        return "Preferences are one row per user: give that table a user_id that's the primary key or unique.";
      if (target.columns.filter((c) => c.type === "boolean").length < 2) return "Add boolean columns for each channel a fan can switch off (email, sms, push).";
      return null;
    },
  },
];
