import type { Column, DbEngine, SchemaCheck, SchemaDesign } from "../../../lib/drill/types";
import { pasteParam } from "./api";

export const ENGINES: DbEngine[] = [
  {
    id: "postgres",
    label: "Postgres",
    family: "SQL",
    blurb: "Relational, strict schemas, excellent indexes.",
    fit: "A fine home for metadata: one row per paste, a unique id, and an index on expires_at so the cleanup job finds exactly the expired rows. Expiry is something you build yourself with a scheduled job.",
  },
  {
    id: "mysql",
    label: "MySQL",
    family: "SQL",
    blurb: "Relational and battle-tested.",
    fit: "Practically the same tradeoffs as Postgres here. Add an index on expires_at and run the cleanup job in small batches.",
  },
  {
    id: "dynamodb",
    label: "DynamoDB",
    family: "Key-value",
    blurb: "Managed key-value store with a native TTL attribute.",
    fit: "Lookup by id is its sweet spot, and it can delete expired items for you when an attribute passes its TTL. You still delete the text in object storage yourself, so you keep a small cleanup path.",
  },
  {
    id: "mongodb",
    label: "MongoDB",
    family: "Document",
    blurb: "JSON documents with TTL indexes.",
    fit: "A TTL index removes expired documents automatically. A paste is one small document, which fits, but you don't need flexible shapes.",
  },
  {
    id: "cassandra",
    label: "Cassandra",
    family: "Wide-column",
    blurb: "Built for huge write volumes; per-row TTL.",
    fit: "Per-row TTL is built in and writes scale, but reads outnumber writes ten to one and you give up secondary indexes. Overkill at five million pastes a day.",
  },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-pastes", name: "pastes", columns: [{ id: "c-id", name: "id", type: "bigint", pk: true, unique: false }] }],
};

const cols = (s: SchemaDesign) => s.tables.flatMap((t) => t.columns.map((c) => ({ table: t, col: c })));
const find = (s: SchemaDesign, re: RegExp): { col: Column } | undefined => cols(s).find(({ col }) => re.test(col.name.trim().toLowerCase()));
const BLOB_RE = /^(content|body|text|paste|data|raw|code)$/;
const KEY_RE = /(blob|object|storage|s3|file|path)(_?(key|path|url|id))?$|^(key|location)$/;

export const SCHEMA_CHECKS: SchemaCheck[] = [
  {
    id: "engine",
    label: "A database is chosen",
    check: (s) => (s.engine ? null : "Pick a database engine above. Several can do this job; the notes say what each one costs you."),
  },
  {
    id: "id",
    label: "Pastes are found by their id",
    check: (s, api) => {
      const p = pasteParam(api);
      const c = find(s, new RegExp(`^${p}$`)) ?? (p !== "id" ? find(s, /^id$/) : undefined);
      if (!c) return `Your read endpoint looks a paste up by ${p}. Add a ${p} column.`;
      if (!c.col.pk && !c.col.unique) return "Every open looks a paste up by id. Make it the primary key (or unique) so lookups are indexed and ids can't collide.";
      if (c.col.type === "integer" || c.col.type === "bigint")
        return "A counter makes ids guessable: anyone can walk /pastes/1, /pastes/2 … and read private pastes. Use a random text id (and keep it long enough to be unguessable).";
      return null;
    },
  },
  {
    id: "pointer",
    label: "The text lives in object storage, not in the row",
    check: (s) => {
      const blob = cols(s).find(({ col }) => BLOB_RE.test(col.name.trim().toLowerCase()) && (col.type === "text" || col.type === "json"));
      if (blob)
        return `A ${blob.col.name} column puts every paste's text in the database. At ~10 KB × 5M pastes a day that's 50 GB daily, in the most expensive storage you own, and it crowds out the indexes that need RAM. Store the text in object storage and keep only a pointer here.`;
      if (!find(s, KEY_RE)) return "Add a column holding where the text lives in object storage, like blob_key (text).";
      return null;
    },
  },
  {
    id: "expires",
    label: "You know when each paste expires",
    check: (s) => {
      const c = find(s, /^expire[sd]?(_at|_on)?$|^expiry(_at)?$|^ttl$/);
      if (!c) return "Add expires_at (timestamp). The cleanup job, and the read path, both need it.";
      if (c.col.type !== "timestamp") return `Store expiry as a timestamp, not ${c.col.type}, so the database can compare and index it.`;
      return null;
    },
  },
  {
    id: "created",
    label: "You know when each paste was made",
    check: (s) => {
      const c = find(s, /^created(_at|_on)?$/);
      if (!c) return "Add created_at (timestamp): abuse reports and “pastes made today” both need it.";
      if (c.col.type !== "timestamp") return `Store times as timestamp, not ${c.col.type}.`;
      return null;
    },
  },
  {
    id: "size",
    label: "Each paste's size is recorded",
    check: (s) => {
      const c = find(s, /size|bytes|length/);
      if (!c) return "Add size_bytes (bigint or integer). You'll want it to enforce size limits and to find who is filling storage.";
      if (c.col.type !== "integer" && c.col.type !== "bigint") return `${c.col.name} is a count of bytes: use integer or bigint.`;
      return null;
    },
  },
];
