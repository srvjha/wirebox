import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/drill/types";

export const ENGINES: DbEngine[] = [
  { id: "postgres", label: "Postgres", family: "SQL", blurb: "Relational, strict schemas, great indexes.", fit: "Metadata is small and relational (a video has many renditions, an owner, a status). The videos themselves never go in here." },
  { id: "mysql", label: "MySQL", family: "SQL", blurb: "Relational and widely hosted.", fit: "Equivalent to Postgres for this job. Plenty of large video sites keep their metadata in sharded MySQL." },
  { id: "dynamodb", label: "DynamoDB", family: "Key-value", blurb: "Managed key-value store.", fit: "Looking up a video by id is a key lookup, which it does well. Listing 'my videos' needs a second index." },
  { id: "mongodb", label: "MongoDB", family: "Document", blurb: "JSON documents.", fit: "A video and its renditions fit nicely in one document. You give up joins for the 'all videos by this creator' view." },
  { id: "cassandra", label: "Cassandra", family: "Wide-column", blurb: "Built for huge write volumes.", fit: "Overkill for metadata: the bytes are in object storage, so writes here are tiny. Handy later for view counters." },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-videos", name: "videos", columns: [{ id: "c-id", name: "id", type: "bigint", pk: true, unique: false }] }],
};

const cols = (s: SchemaDesign) => s.tables.flatMap((t) => t.columns.map((c) => ({ table: t, col: c })));
const find = (s: SchemaDesign, re: RegExp): { table: Table; col: Column } | undefined => cols(s).find(({ col }) => re.test(col.name.trim().toLowerCase()));
const videos = (s: SchemaDesign) => s.tables.find((t) => /video/.test(t.name.toLowerCase()) && !/rendition|variant|segment/.test(t.name.toLowerCase())) ?? s.tables[0];

export const SCHEMA_CHECKS: SchemaCheck[] = [
  { id: "engine", label: "A database is chosen", check: (s) => (s.engine ? null : "Pick an engine. Any can hold this metadata; the notes say what each costs you.") },
  {
    id: "status",
    label: "Videos have a status",
    check: (s) => {
      const c = find(s, /^(status|state)$/);
      if (!c) return "Your complete and watch endpoints both return status. Store it on the video (uploading, processing, ready, failed).";
      if (c.col.type !== "text" && c.col.type !== "varchar(255)") return "A status is a short word like 'processing'. Use text.";
      return null;
    },
  },
  {
    id: "object-key",
    label: "The original lives in object storage, referenced by key",
    check: (s) => {
      const c = find(s, /(object|storage|raw|original|source|file).*(key|path|url)|^(key|path)$/);
      if (!c) return "The file itself goes to object storage, not the database. Store its address (raw_object_key, as text) so workers can find it.";
      if (c.col.type !== "text" && c.col.type !== "varchar(255)") return "An object key is a path-like string. Use text.";
      return null;
    },
  },
  {
    id: "manifest",
    label: "The manifest address is stored",
    check: (s) => (find(s, /manifest|playlist/) ? null : "Your watch endpoint returns manifest_url. Store it once transcoding finishes so playing a video is a single lookup."),
  },
  {
    id: "renditions",
    label: "Each quality is its own row",
    check: (s) => {
      const t = s.tables.find((t) => /rendition|variant|quality|encoding/.test(t.name.toLowerCase()));
      if (!t || t.columns.length < 2) return "One video has several qualities (240p to 1080p). Add a renditions table with one row per video per quality.";
      const fk = t.columns.some((c) => /video/.test(c.name.toLowerCase()));
      const res = t.columns.some((c) => /height|resolution|quality|bitrate/.test(c.name.toLowerCase()));
      if (!fk) return `Link ${t.name} back to its video with a video_id column.`;
      if (!res) return `Say which quality each row is: add height or bitrate to ${t.name}.`;
      return null;
    },
  },
  {
    id: "created",
    label: "You know when each video was made",
    check: (s) => {
      const c = find(s, /^created(_at|_on)?$|^uploaded(_at)?$/);
      if (!c) return "Add created_at (timestamp) for ordering, retention and debugging stuck uploads.";
      return c.col.type === "timestamp" ? null : `Store times as timestamp, not ${c.col.type}.`;
    },
  },
  {
    id: "owner",
    label: "Videos belong to a creator",
    check: (s) => {
      const t = videos(s);
      return t?.columns.some((c) => /owner|user|creator|channel/.test(c.name.toLowerCase())) ? null : "Add owner_id to videos: creators need to see and delete their own uploads.";
    },
  },
];
