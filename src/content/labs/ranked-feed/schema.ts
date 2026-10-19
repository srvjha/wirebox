import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/lab/types";

export const ENGINES: DbEngine[] = [
  { id: "postgres", label: "Postgres", family: "SQL", blurb: "Relational, transactional, great constraints.", fit: "A unique (user, post) vote constraint comes free. Hot counters need care (see the drills), but it's a comfortable default." },
  { id: "mysql", label: "MySQL", family: "SQL", blurb: "Relational and ubiquitous.", fit: "Same tradeoffs as Postgres. Row-level locks on a hot counter row are the thing to watch." },
  { id: "cassandra", label: "Cassandra", family: "Wide-column", blurb: "Distributed counters and huge write throughput.", fit: "Counter columns absorb heavy increments across nodes. You give up transactions and ad-hoc ranking queries." },
  { id: "dynamodb", label: "DynamoDB", family: "Key-value", blurb: "Managed key-value, atomic counters.", fit: "Atomic ADD makes counters simple, but one hot key is still capped per partition. Shard the counter key." },
  { id: "mongodb", label: "MongoDB", family: "Document", blurb: "JSON documents with atomic $inc.", fit: "$inc on a post document is easy; a viral post's single document is a write hotspot." },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-posts", name: "posts", columns: [{ id: "c-id", name: "id", type: "bigint", pk: true, unique: false }] }],
};

const posts = (s: SchemaDesign) => s.tables.find((t) => /post|item|story/.test(t.name.toLowerCase())) ?? s.tables[0];
const votes = (s: SchemaDesign): Table | undefined => s.tables.find((t) => /vote/.test(t.name.toLowerCase()));
const col = (t: Table | undefined, re: RegExp): Column | undefined => t?.columns.find((c) => re.test(c.name.toLowerCase()));

export const SCHEMA_CHECKS: SchemaCheck[] = [
  { id: "engine", label: "A database is chosen", check: (s) => (s.engine ? null : "Pick an engine. The notes say what each one costs you here.") },
  {
    id: "votes",
    label: "Every vote is recorded per user and post",
    check: (s) => {
      const t = votes(s);
      if (!t) return "Add a votes table: one row per user per post. It's your record of truth and what lets you spot bots later.";
      if (!col(t, /user|voter|account/) || !col(t, /post|item|story/)) return `${t.name} needs both user_id and post_id.`;
      return null;
    },
  },
  {
    id: "once",
    label: "A user can only vote once per post",
    check: (s) => {
      const t = votes(s);
      if (!t) return "Add the votes table first.";
      const u = col(t, /user|voter|account/);
      const p = col(t, /post|item|story/);
      if (!u || !p) return "Add user_id and post_id.";
      if ((u.pk && p.pk) || u.unique || p.unique) return null;
      return "Nothing stops one user voting a thousand times. Make (user_id, post_id) the primary key: mark both as primary key so they form a composite one.";
    },
  },
  {
    id: "count",
    label: "The vote count is stored, not recounted",
    check: (s) => {
      const c = col(posts(s), /vote|score|count|likes/) ?? s.tables.flatMap((t) => t.columns).find((c) => /vote_count|score/.test(c.name.toLowerCase()));
      if (!c) return "Counting rows in votes on every page view would be ruinous. Keep a vote_count (bigint) on posts, updated as votes arrive.";
      return c.type === "bigint" || c.type === "integer" ? null : "A count is a whole number. Use bigint.";
    },
  },
  {
    id: "rank",
    label: "The computed rank has a home",
    check: (s) => (s.tables.flatMap((t) => t.columns).some((c) => /rank|hot|score/.test(c.name.toLowerCase())) ? null : "Ranking mixes votes with age, and it's recomputed in the background. Store the result (rank_score) so the front page can sort by it."),
  },
  {
    id: "created",
    label: "Posts have a creation time",
    check: (s) => {
      const c = col(posts(s), /^created(_at|_on)?$|^posted(_at)?$/);
      if (!c) return "Ranking decays with age. Add created_at (timestamp) to posts.";
      return c.type === "timestamp" ? null : `Store times as timestamp, not ${c.type}.`;
    },
  },
];
