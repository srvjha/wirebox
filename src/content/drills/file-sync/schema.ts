import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/drill/types";

export const ENGINES: DbEngine[] = [
  {
    id: "postgres",
    label: "Postgres",
    family: "SQL",
    blurb: "Relational, transactions, and a sequence you can ask “what changed after N?”.",
    fit: "A strong fit for metadata. Committing a version while bumping a file's pointer is one transaction, and an ordered, indexed change feed is a plain query. Only the metadata is in it: the bytes aren't.",
  },
  {
    id: "mysql",
    label: "MySQL",
    family: "SQL",
    blurb: "Relational and widely hosted.",
    fit: "Same tradeoffs as Postgres here: transactional commits and ordered feeds. Many file-sync services shard MySQL by user id.",
  },
  {
    id: "dynamodb",
    label: "DynamoDB",
    family: "Key-value",
    blurb: "Managed key-value store; conditional writes.",
    fit: "Conditional writes give you compare-and-set for free (“commit only if latest_version is still 12”). The ordered change feed needs a sort-key design or a stream.",
  },
  {
    id: "cassandra",
    label: "Cassandra",
    family: "Wide-column",
    blurb: "Huge write volumes across many nodes.",
    fit: "Handles the scale, but a commit must update a file pointer and add a change atomically. Without multi-row transactions you'll use lightweight transactions or accept careful repair logic.",
  },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-files", name: "files", columns: [{ id: "c-id", name: "id", type: "uuid", pk: true, unique: false }] }],
};

const lower = (c: Column) => c.name.trim().toLowerCase();
const table = (s: SchemaDesign, re: RegExp): Table | undefined => s.tables.find((t) => re.test(t.name.trim().toLowerCase()));
const has = (t: Table, re: RegExp) => t.columns.find((c) => re.test(lower(c)));

export const SCHEMA_CHECKS: SchemaCheck[] = [
  {
    id: "engine",
    label: "A database is chosen",
    check: (s) => (s.engine ? null : "Pick a database engine above. This database stores facts about files; the file bytes go elsewhere."),
  },
  {
    id: "files",
    label: "Each file has an owner, a path and a current version",
    check: (s) => {
      const t = table(s, /^files?$|^(file_)?entries|^items?$/);
      if (!t) return "Add a files table: one row per file the user sees.";
      if (!has(t, /owner|user|account/)) return "Add the owner (user_id): every query starts with “this user's files”.";
      if (!has(t, /path|name/)) return "Add a path or name column.";
      if (!has(t, /version|rev|head|latest/)) return "Add the file's current version. A device compares it with its own to see whether it's behind, and commits are checked against it.";
      return null;
    },
  },
  {
    id: "versions",
    label: "Every version is kept, in order, per file",
    check: (s) => {
      const t = table(s, /version|revision/);
      if (!t) return "Don't overwrite files. Add a versions table with one row per commit, so history, undo and conflict copies are possible.";
      const file = has(t, /file/);
      const ver = has(t, /^(version|rev|revision|number|seq|n)/);
      if (!file) return "Each version belongs to a file: add file_id.";
      if (!ver) return "Add the version number within the file.";
      if (!(file.pk || ver.pk || file.unique || ver.unique)) return "Make (file_id, version) the primary key so two devices can't both create version 13.";
      if (!has(t, /chunk|manifest|block|hash|content/)) return "A version is a list of chunk hashes in order. Add a column for it (json) or a file_chunks table.";
      if (!has(t, /device|author|user/)) return "Record which device made the commit; conflict copies are named after it.";
      return null;
    },
  },
  {
    id: "chunks",
    label: "Chunks are named by their content hash",
    check: (s) => {
      const t = table(s, /chunk|block|blob/);
      if (!t) return "Add a chunks table with one row per unique chunk. It records that a chunk exists, so “which are missing?” is a lookup.";
      const h = has(t, /hash|digest|sha|id/);
      if (!h) return "Name each chunk by the hash of its bytes: add a hash column.";
      if (!h.pk && !h.unique) return "The hash is the identity, so it must be the primary key (or unique): two uploads of identical bytes are the same chunk.";
      if (h.type === "integer" || h.type === "bigint") return "A SHA-256 hash is 64 hex characters. Use text (or char), not a number.";
      if (!has(t, /ref|count|used/)) return "Add a ref_count (or similar): the same chunk can belong to many files and may only be deleted when none remain.";
      return null;
    },
  },
  {
    id: "feed",
    label: "“What changed after cursor X?” is one indexed query",
    check: (s) => {
      const t = table(s, /change|event|feed|journal|log|version/);
      if (!t) return "Add a changes feed.";
      const seq = t.columns.find((c) => /seq|cursor|position|offset|change_id|^id$|sequence/.test(lower(c)));
      if (!seq) return "Give changes a monotonically increasing number (a sequence) per user. The cursor you return from GET /changes is just the last one seen.";
      if (seq.type !== "bigint" && seq.type !== "integer") return `${seq.name} counts up, so it should be bigint.`;
      return null;
    },
  },
];
