import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/drill/types";

export const ENGINES: DbEngine[] = [
  {
    id: "postgres",
    label: "Postgres",
    family: "SQL",
    blurb: "Relational, strict schemas, transactions, great indexes.",
    fit: "A good fit. A composite key on (doc_id, seq) gives a gap-free, ordered operation log per document, and a unique constraint stops two servers writing the same sequence number. Sharding by doc id comes later.",
  },
  {
    id: "mongodb",
    label: "MongoDB",
    family: "Document",
    blurb: "JSON documents with built-in sharding.",
    fit: "The document as a JSON blob is natural, but the heart of this product is an append-only log with unique sequence numbers per doc. You'll lean on a compound unique index to get that.",
  },
  {
    id: "cassandra",
    label: "Cassandra",
    family: "Wide-column",
    blurb: "Spreads huge write volumes over many nodes.",
    fit: "Logs are what it does best: partition by doc_id, cluster by seq. But “exactly one op gets sequence N” needs lightweight transactions, so sequencing stays with the document's owner server.",
  },
  {
    id: "dynamodb",
    label: "DynamoDB",
    family: "Key-value",
    blurb: "Managed key-value store, pay per request.",
    fit: "Partition key doc_id, sort key seq, conditional writes for uniqueness. Works well at any size; reading a whole log sequentially costs per request.",
  },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-docs", name: "documents", columns: [{ id: "c-id", name: "id", type: "uuid", pk: true, unique: false }] }],
};

const cols = (s: SchemaDesign) => s.tables.flatMap((t) => t.columns.map((c) => ({ table: t, col: c })));
const lower = (c: Column) => c.name.trim().toLowerCase();
const opsTable = (s: SchemaDesign): Table | undefined =>
  s.tables.find((t) => /op|event|change|edit|log/.test(t.name.toLowerCase()) && !/snap/.test(t.name.toLowerCase()));
const snapTable = (s: SchemaDesign): Table | undefined => s.tables.find((t) => /snap|checkpoint|version/.test(t.name.toLowerCase()));

export const SCHEMA_CHECKS: SchemaCheck[] = [
  {
    id: "engine",
    label: "A database is chosen",
    check: (s) => (s.engine ? null : "Pick a database engine above. Each has a different answer to “keep a strictly ordered log per document”."),
  },
  {
    id: "ops-table",
    label: "Every edit is kept as an operation",
    check: (s) =>
      opsTable(s)
        ? null
        : "Store each edit as a row in an operations table instead of overwriting the document. The log is how you merge, undo, show history and recover from a crash.",
  },
  {
    id: "ops-key",
    label: "Operations are ordered within a document",
    check: (s) => {
      const t = opsTable(s);
      if (!t) return "Add the operations table first.";
      const doc = t.columns.find((c) => /doc/.test(lower(c)));
      const seq = t.columns.find((c) => /^(seq|sequence|version|rev|revision|n|position|idx)/.test(lower(c)));
      if (!doc) return "Each operation belongs to a document: add a doc_id column.";
      if (!seq) return "Operations have an order. Add a seq (or version) column that counts up within each document.";
      if (seq.type !== "integer" && seq.type !== "bigint") return `${seq.name} is a counter, so make it integer or bigint.`;
      if (!(seq.pk || seq.unique || doc.pk || doc.unique))
        return "Nothing stops two operations from getting the same seq in one document. Make doc_id + seq the primary key (mark both as primary key) or unique.";
      return null;
    },
  },
  {
    id: "ops-payload",
    label: "Each operation carries its payload and author",
    check: (s) => {
      const t = opsTable(s);
      if (!t) return "Add the operations table first.";
      const names = t.columns.map(lower);
      if (!names.some((n) => /op|payload|change|delta|data|body/.test(n) && !/doc/.test(n)))
        return "Add a column for the operation itself (json works well).";
      if (!names.some((n) => /user|author|actor|client/.test(n))) return "Add who made the edit (user_id): you need it for undo, history and cursors.";
      return null;
    },
  },
  {
    id: "snapshots",
    label: "Snapshots keep opens fast",
    check: (s) => {
      const t = snapTable(s) ?? s.tables.find((x) => x.columns.some((c) => /snapshot|content|text/.test(lower(c))));
      if (!t) return "Opening a document by replaying 2 million operations is slow. Store snapshots: a table with doc_id, the seq it covers, and the content.";
      const names = t.columns.map(lower);
      if (!names.some((n) => /seq|version|rev|upto|up_to/.test(n))) return "A snapshot must say which operation it includes up to (seq), so the tail can be replayed on top.";
      return null;
    },
  },
  {
    id: "doc-meta",
    label: "Document details live apart from the log",
    check: (s) => {
      const t = s.tables.find((x) => /^(doc|document)/.test(x.name.trim().toLowerCase()));
      if (!t) return "Keep a documents table (id, title, owner, created_at) separate from the log.";
      const names = t.columns.map(lower);
      if (!names.some((n) => /owner|created_by|user/.test(n))) return "Who owns the document? Add owner_id: sharing and permissions start there.";
      if (!cols(s).some(({ col }) => /^created/.test(lower(col)))) return "Add created_at (timestamp).";
      return null;
    },
  },
];
