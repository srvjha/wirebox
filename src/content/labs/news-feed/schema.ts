import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/lab/types";

export const ENGINES: DbEngine[] = [
  { id: "postgres", label: "Postgres", family: "SQL", blurb: "Relational, strong indexes.", fit: "Fine for users, posts and follows at this size. At hundreds of millions of posts you shard by author and keep timelines elsewhere." },
  { id: "cassandra", label: "Cassandra", family: "Wide-column", blurb: "Built for huge write volumes and sorted partitions.", fit: "Excellent for a timeline table: partition by user, sort by time, and 'the latest 20' is one sequential read. Weaker for ad-hoc queries." },
  { id: "dynamodb", label: "DynamoDB", family: "Key-value", blurb: "Managed key-value with a sort key.", fit: "user_id + post time as the key gives a timeline for free. Cost grows with fan-out, since every copy is a billed write." },
  { id: "mongodb", label: "MongoDB", family: "Document", blurb: "JSON documents.", fit: "A post as one document works well. Following relationships need care once someone has millions of followers." },
  { id: "mysql", label: "MySQL", family: "SQL", blurb: "Relational and widely hosted.", fit: "Instagram famously started on Postgres and sharded it by user id. MySQL behaves similarly for this job." },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-posts", name: "posts", columns: [{ id: "c-id", name: "id", type: "bigint", pk: true, unique: false }] }],
};

const all = (s: SchemaDesign) => s.tables.flatMap((t) => t.columns.map((c) => ({ table: t, col: c })));
const find = (s: SchemaDesign, re: RegExp): { table: Table; col: Column } | undefined => all(s).find(({ col }) => re.test(col.name.trim().toLowerCase()));
const posts = (s: SchemaDesign) => s.tables.find((t) => /post|photo/.test(t.name.toLowerCase())) ?? s.tables[0];

export const SCHEMA_CHECKS: SchemaCheck[] = [
  { id: "engine", label: "A database is chosen", check: (s) => (s.engine ? null : "Pick an engine. The notes say what each costs you.") },
  {
    id: "author",
    label: "Posts know their author",
    check: (s) => (posts(s)?.columns.some((c) => /author|user|owner/.test(c.name.toLowerCase())) ? null : "Add author_id to posts: every profile page and every fan-out starts from 'posts by this person'."),
  },
  {
    id: "photo-key",
    label: "The photo is a key, not the bytes",
    check: (s) => {
      const c = posts(s)?.columns.find((c) => /photo|image|media|key/.test(c.name.toLowerCase()));
      if (!c) return "Your post endpoint takes a photo_key. Store it as text; the image itself lives in object storage.";
      return c.type === "text" || c.type === "varchar(255)" ? null : "A storage key is a path-like string. Use text.";
    },
  },
  {
    id: "created",
    label: "Posts are ordered by time",
    check: (s) => {
      const c = posts(s)?.columns.find((c) => /^created(_at|_on)?$|^posted(_at)?$/.test(c.name.toLowerCase()));
      if (!c) return "A feed is 'newest first'. Add created_at (timestamp) to posts.";
      return c.type === "timestamp" ? null : `Store times as timestamp, not ${c.type}.`;
    },
  },
  {
    id: "follows",
    label: "Follows are a table of pairs",
    check: (s) => {
      const t = s.tables.find((t) => /follow|subscription|graph/.test(t.name.toLowerCase()));
      if (!t) return "Add a follows table: one row per 'follower follows followee'.";
      const f = t.columns.some((c) => /follower/.test(c.name.toLowerCase()));
      const g = t.columns.some((c) => /followee|following|target|author/.test(c.name.toLowerCase()));
      return f && g ? null : `${t.name} needs both sides of the relationship: follower_id and followee_id.`;
    },
  },
  {
    id: "followers-count",
    label: "You can tell who is a celebrity",
    check: (s) => (find(s, /follower.*count|followers$|follower_count/) ? null : "Fan-out depends on follower counts: pushing a post to 200 timelines is fine, to 20 million isn't. Keep a followers_count (bigint) on the user."),
  },
  {
    id: "timeline",
    label: "Timelines can be precomputed",
    check: (s) => {
      const t = s.tables.find((t) => /timeline|feed|inbox/.test(t.name.toLowerCase()));
      if (!t || t.columns.length < 2) return "To make reading cheap you'll copy post ids into each follower's timeline. Add a timelines table with user_id and post_id.";
      return t.columns.some((c) => /user|owner/.test(c.name.toLowerCase())) && t.columns.some((c) => /post/.test(c.name.toLowerCase())) ? null : `${t.name} needs user_id and post_id.`;
    },
  },
];
