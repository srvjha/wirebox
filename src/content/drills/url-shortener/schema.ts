import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/drill/types";
import { COUNT_FIELD, countField, slugParam, urlField } from "./api";

export const ENGINES: DbEngine[] = [
  {
    id: "postgres",
    label: "Postgres",
    family: "SQL",
    blurb: "Relational, strict schemas, excellent indexes and transactions.",
    fit: "A safe default. One table, lookups by a unique key, and a unique constraint that stops two links sharing a slug. At 6 TB you'd eventually shard it, but that's years away.",
  },
  {
    id: "mysql",
    label: "MySQL",
    family: "SQL",
    blurb: "Relational and battle-tested, with a huge hosting ecosystem.",
    fit: "Practically the same tradeoffs as Postgres for this product. Many large shorteners started on MySQL and sharded it by slug later.",
  },
  {
    id: "mongodb",
    label: "MongoDB",
    family: "Document",
    blurb: "JSON documents, flexible shape, built-in sharding.",
    fit: "Each link is one small document, which fits naturally. You don't need flexible shapes here, but built-in sharding is handy once the collection outgrows one machine.",
  },
  {
    id: "cassandra",
    label: "Cassandra",
    family: "Wide-column",
    blurb: "Spreads data over many nodes; built for huge write volumes.",
    fit: "Shines when writes dominate. Here reads outnumber writes 100 to 1, and you'll need care for “slug must be unique” since there are no unique constraints beyond the key.",
  },
  {
    id: "dynamodb",
    label: "DynamoDB",
    family: "Key-value",
    blurb: "Managed key-value store; pay per request, fast lookups by key.",
    fit: "A key-value lookup is exactly what a redirect is, and AWS runs it for you. Fewer query options later (analytics, search), and costs scale with every request.",
  },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [
    {
      id: "t-links",
      name: "links",
      columns: [{ id: "c-id", name: "id", type: "bigint", pk: true, unique: false }],
    },
  ],
};

const cols = (s: SchemaDesign) => s.tables.flatMap((t) => t.columns.map((c) => ({ table: t, col: c })));
const find = (s: SchemaDesign, name: string): { table: Table; col: Column } | undefined =>
  cols(s).find(({ col }) => col.name.trim().toLowerCase() === name);

function slugColumn(s: SchemaDesign, api: Parameters<SchemaCheck["check"]>[1]) {
  const p = slugParam(api);
  return find(s, p) ?? (p !== "slug" ? find(s, "slug") : undefined);
}

export const SCHEMA_CHECKS: SchemaCheck[] = [
  {
    id: "engine",
    label: "A database is chosen",
    check: (s) => (s.engine ? null : "Pick a database engine above. Any of them can do this job; the notes say what each one costs you."),
  },
  {
    id: "slug",
    label: "Links can be found by their slug",
    check: (s, api) => {
      const p = slugParam(api);
      if (slugColumn(s, api)) return null;
      return `Your redirect is GET /:${p}, so every click looks a link up by ${p}. Add a ${p} column to your links table.`;
    },
  },
  {
    id: "slug-key",
    label: "Slug lookups are indexed and unique",
    check: (s, api) => {
      const c = slugColumn(s, api);
      if (!c) return "Add the slug column first.";
      if (c.col.pk || c.col.unique) return null;
      return "Without a primary key or unique index, each click scans every row (billions, in a few years), and two links could end up with the same slug. Mark it primary key or unique.";
    },
  },
  {
    id: "slug-type",
    label: "Slugs are stored as text",
    check: (s, api) => {
      const c = slugColumn(s, api);
      if (!c) return "Add the slug column first.";
      const t = c.col.type;
      if (t === "text" || t === "varchar(255)" || t === "char(7)") return null;
      if (t === "integer" || t === "bigint") return "Slugs like x7Kp2Qa mix letters and digits, so a number can't hold them. Use text or char(7).";
      return `A slug is a short string; ${t} isn't the right type. Use text or char(7).`;
    },
  },
  {
    id: "url",
    label: "The long URL is stored in full",
    check: (s, api) => {
      const f = urlField(api);
      const slug = slugColumn(s, api);
      const c =
        find(s, f) ??
        cols(s).find(({ col, table }) => /url/.test(col.name) && !/short/.test(col.name) && (!slug || table.id === slug.table.id));
      if (!c) return `Your create endpoint takes ${f}. Store it in a ${f} column next to the slug.`;
      if (slug && c.table.id !== slug.table.id) return `Keep ${c.col.name} in the same table as the slug, so a redirect is one lookup.`;
      if (c.col.type === "varchar(255)")
        return "Real URLs run past 255 characters (links with tracking parameters often pass 1,000), and varchar(255) would reject them. Use text.";
      if (c.col.type !== "text") return `A URL is text; ${c.col.type} can't hold it. Use text.`;
      return null;
    },
  },
  {
    id: "created",
    label: "You know when each link was made",
    check: (s) => {
      const c = cols(s).find(({ col }) => /^created(_at|_on)?$/.test(col.name.trim().toLowerCase()));
      if (!c) return "Add created_at (timestamp). You'll want it for expiring old links, abuse reports and “links made today”.";
      if (c.col.type !== "timestamp") return `Store times as timestamp, not ${c.col.type}, so the database can compare, sort and index them.`;
      return null;
    },
  },
  {
    id: "clicks",
    label: "Clicks can be counted",
    check: (s, api) => {
      const f = countField(api);
      const col = find(s, f) ?? cols(s).find(({ col }) => COUNT_FIELD.test(col.name));
      const table = s.tables.find((t) => /click|visit|hit/.test(t.name) && t.columns.length > 0);
      if (!col && !table)
        return `Your stats endpoint returns ${f}, so store it: a ${f} bigint column on links, or a clicks table with one row per click.`;
      if (col && !table && col.col.type !== "bigint" && col.col.type !== "integer")
        return `${col.col.name} is a count, so it should be a whole number: use bigint.`;
      return null;
    },
  },
];
