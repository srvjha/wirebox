import type { Column, DbEngine, SchemaCheck, SchemaDesign } from "../../../lib/lab/types";

export const ENGINES: DbEngine[] = [
  {
    id: "postgres",
    label: "Postgres",
    family: "SQL",
    blurb: "Relational; a text_pattern_ops index makes LIKE 'ind%' a range scan.",
    fit: "Handles the term counts and the batch job well. As the live serving path it works until traffic outgrows one node, which is why you'll put a cache in front.",
  },
  {
    id: "dynamodb",
    label: "DynamoDB",
    family: "Key-value",
    blurb: "Key-value lookups at any scale.",
    fit: "“Give me the top 10 for prefix ind” is a single key lookup. A natural home for the precomputed table; counts and analytics live elsewhere.",
  },
  {
    id: "cassandra",
    label: "Cassandra",
    family: "Wide-column",
    blurb: "Huge write volume, partitioned by key.",
    fit: "Good for ingesting a firehose of search logs and for a prefix-keyed table. Ranking on demand is not what it does.",
  },
  {
    id: "mongodb",
    label: "MongoDB",
    family: "Document",
    blurb: "Documents; one per prefix holds its top list naturally.",
    fit: "A prefix document with an embedded list of terms fits well, and flexible shapes let you add per-city lists later.",
  },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-terms", name: "terms", columns: [{ id: "c-term", name: "term", type: "text", pk: true, unique: false }] }],
};

const cols = (s: SchemaDesign) => s.tables.flatMap((t) => t.columns.map((c) => ({ table: t, col: c })));
const find = (s: SchemaDesign, re: RegExp): { col: Column } | undefined => cols(s).find(({ col }) => re.test(col.name.trim().toLowerCase()));

export const SCHEMA_CHECKS: SchemaCheck[] = [
  { id: "engine", label: "A database is chosen", check: (s) => (s.engine ? null : "Pick an engine above; the notes say what each one costs you here.") },
  {
    id: "term",
    label: "Each search term is stored once",
    check: (s) => {
      const c = find(s, /^(term|query|phrase|text)$/);
      if (!c) return "Add a term column: the text people search for, like “indie night bandra”.";
      if (!c.col.pk && !c.col.unique) return "Two rows for the same term would split its popularity. Make term the primary key (or unique).";
      if (c.col.type !== "text" && c.col.type !== "varchar(255)") return `A term is text, not ${c.col.type}.`;
      return null;
    },
  },
  {
    id: "count",
    label: "Popularity is counted",
    check: (s) => {
      const c = find(s, /count|searches|freq|score|weight|popularity/);
      if (!c) return "Add a count (bigint): how often each term was searched. Ranking suggestions needs it.";
      if (c.col.type !== "bigint" && c.col.type !== "integer") return `${c.col.name} is a tally: use bigint, since popular terms pass two billion.`;
      return null;
    },
  },
  {
    id: "recent",
    label: "You know how recent a term is",
    check: (s) => {
      const c = find(s, /last_seen|updated|last_searched|seen_at|recent/);
      if (!c) return "Add last_seen (timestamp). “Popular last year” isn't “trending now”; recency lets you decay old terms.";
      if (c.col.type !== "timestamp") return "Store times as timestamp.";
      return null;
    },
  },
  {
    id: "prefix",
    label: "Suggestions are looked up by prefix",
    check: (s) => {
      const c = find(s, /^prefix$/);
      if (!c) return "Add a table keyed by prefix (text): ‘i’, ‘in’, ‘ind’ … each with its answer ready. Serving then is one key lookup, not a scan.";
      if (!c.col.pk && !c.col.unique) return "Looking up a prefix should be a direct key read: make prefix the primary key.";
      return null;
    },
  },
  {
    id: "topk",
    label: "The top results are stored with the prefix",
    check: (s) => {
      const c = find(s, /top|suggest|complet|best|results/);
      if (!c) return "Add a column on the prefix table holding its top 10 terms (json). Computing it ahead of time is the whole trick.";
      if (c.col.type !== "json" && c.col.type !== "text") return `A ranked list of terms fits json (or text), not ${c.col.type}.`;
      return null;
    },
  },
];
