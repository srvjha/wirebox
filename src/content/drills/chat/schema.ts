import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/drill/types";

export const ENGINES: DbEngine[] = [
  { id: "postgres", label: "Postgres", family: "SQL", blurb: "Relational, strict, excellent for membership and joins.", fit: "Comfortable up to a few thousand messages a second. Beyond that, you shard by conversation id and it still works." },
  { id: "cassandra", label: "Cassandra", family: "Wide-column", blurb: "Spreads rows over many nodes; fast sorted reads within a partition.", fit: "A natural fit for messages: partition by conversation, sort by sequence, and 'the last 50' is one sequential read. Weaker for membership and joins." },
  { id: "dynamodb", label: "DynamoDB", family: "Key-value", blurb: "Managed key-value with a sort key.", fit: "Partition key conversation_id, sort key seq. Scales without operations, costs per request, and gets pricey for receipts." },
  { id: "mongodb", label: "MongoDB", family: "Document", blurb: "JSON documents.", fit: "Messages fit as documents; sharding by conversation id works. Strong ordering inside a conversation needs care." },
  { id: "mysql", label: "MySQL", family: "SQL", blurb: "Relational and ubiquitous.", fit: "Equivalent to Postgres here. Several large chat products ran on sharded MySQL for years." },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-messages", name: "messages", columns: [{ id: "c-id", name: "id", type: "bigint", pk: true, unique: false }] }],
};

const all = (s: SchemaDesign) => s.tables.flatMap((t) => t.columns.map((c) => ({ table: t, col: c })));
const find = (s: SchemaDesign, re: RegExp): { table: Table; col: Column } | undefined => all(s).find(({ col }) => re.test(col.name.trim().toLowerCase()));
const messages = (s: SchemaDesign) => s.tables.find((t) => /message|msg/.test(t.name.toLowerCase())) ?? s.tables[0];

export const SCHEMA_CHECKS: SchemaCheck[] = [
  { id: "engine", label: "A database is chosen", check: (s) => (s.engine ? null : "Pick an engine. The notes say what each costs you.") },
  {
    id: "conversation",
    label: "Messages belong to a conversation",
    check: (s) => (messages(s)?.columns.some((c) => /conversation|chat|thread|room/.test(c.name.toLowerCase())) ? null : "Every endpoint is scoped to /conversations/:id. Add conversation_id to messages: it's the key you read by."),
  },
  {
    id: "seq",
    label: "Messages are ordered by a sequence number",
    check: (s) => {
      const c = messages(s)?.columns.find((c) => /^seq|sequence|position/.test(c.name.toLowerCase()));
      if (!c) return "Your send endpoint returns seq. Add a seq column to messages: it, not created_at, decides the order.";
      if (c.type !== "bigint" && c.type !== "integer") return "A sequence number is a whole number. Use bigint.";
      return null;
    },
  },
  {
    id: "dedupe",
    label: "A retried message can't be stored twice",
    check: (s) => {
      const c = messages(s)?.columns.find((c) => /client|dedup|idempot|request/.test(c.name.toLowerCase()));
      if (!c) return "Your send endpoint takes a client-generated id. Store it on messages so the server can recognise a retry.";
      if (!c.unique && !c.pk) return "Mark client_msg_id unique (within the conversation) so a retry hits the constraint instead of creating a second message.";
      return null;
    },
  },
  {
    id: "text",
    label: "Message text is stored as text",
    check: (s) => {
      const c = messages(s)?.columns.find((c) => /^(text|body|content)$/.test(c.name.toLowerCase()));
      if (!c) return "Add a text (or body) column for what people type.";
      return c.type === "text" ? null : `Messages can be long. Use text, not ${c.type}.`;
    },
  },
  {
    id: "members",
    label: "You know who is in each conversation",
    check: (s) => {
      const t = s.tables.find((t) => /member|participant/.test(t.name.toLowerCase()));
      if (!t) return "A group message goes to every member. Add a conversation_members table with conversation_id and user_id.";
      if (!t.columns.some((c) => /user|member/.test(c.name.toLowerCase())) || !t.columns.some((c) => /conversation|chat|thread/.test(c.name.toLowerCase())))
        return `${t.name} needs both conversation_id and user_id.`;
      return null;
    },
  },
  {
    id: "receipts",
    label: "Delivery and read state are stored per member",
    check: (s) => {
      const c = find(s, /last_(read|delivered|seen)|read_seq|delivered_seq|read_at|delivered_at|receipt/);
      if (!c) return "Your receipt endpoint needs somewhere to land. Store last_read_seq (and last_delivered_seq) per member: one number covers every message up to it.";
      return null;
    },
  },
];
