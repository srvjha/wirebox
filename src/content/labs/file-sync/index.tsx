import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Lab, LabGraph } from "@/lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { STEPS } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: LabGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };

const K = {
  launch: ["size"] as Knob[],
  scale: ["size", "hitRate"] as Knob[],
  fleet: ["size", "hitRate", "shards"] as Knob[],
};

const P = {
  base: ["client", "server", "db", "storage"] as DesignStep["palette"],
  scale: ["client", "lb", "server", "cache", "db", "storage"] as DesignStep["palette"],
  live: ["client", "lb", "server", "cache", "db", "storage", "ws", "pubsub"] as DesignStep["palette"],
  all: ["client", "lb", "server", "cache", "db", "storage", "ws", "pubsub", "queue", "worker"] as DesignStep["palette"],
};

const design = (id: keyof typeof STEPS, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief">): DesignStep => ({
  type: "design",
  id,
  ...STEPS[id],
  debrief: DEBRIEFS[id],
  ...step,
});

export const fileSync: Lab = {
  slug: "file-sync",
  version: 1,
  title: "Design file sync",
  product: "File sync",
  intro: (
    <>
      <p>
        Gatepass promoters keep posters, stage plans and sound riders on their laptops, phones and the venue&apos;s office PC.
        They want one folder that looks the same everywhere: save on the laptop, find it on the phone, and edit the same file on a
        flight without breaking anything.
      </p>
      <p>
        The trick isn&apos;t copying files, it&apos;s <em>not</em> copying them. Files are large, edits are small, and devices vanish
        and reappear. You&apos;ll cut files into hashed chunks so only changes travel, keep metadata and bytes in different stores,
        tell sleeping devices when to wake up, decide what happens when two devices edit one file, and survive a burst of uploads.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Sync a folder across devices", detail: "A change on one device appears on the others within seconds." },
    { kind: "functional", text: "Work offline", detail: "Edit anywhere; reconcile when the network returns." },
    { kind: "functional", text: "Version history", detail: "Restore any earlier version of a file." },
    { kind: "non-functional", text: "Send only what changed", detail: "Editing one slide in a 400 MB deck must not re-upload 400 MB." },
    { kind: "non-functional", text: "Never lose an edit", detail: "Two devices editing at once end in two versions, not one." },
    { kind: "non-functional", text: "Durable", detail: "A synced file survives machine, disk and zone failures." },
    { kind: "non-functional", text: "Cheap to hold open", detail: "200,000 idle devices must not hammer the database." },
  ],
  estimates: [
    { label: "Chunk lookups, peak", value: "~54,000/s", math: "20k active devices × ~3 chunks/s while syncing, bursts across a morning" },
    { label: "Commits", value: "~3,000/s", math: "A device commits a version when its files settle" },
    { label: "Devices online", value: "~200,000", math: "70k users × ~3 devices, most idle" },
    { label: "Stored, after dedupe", value: "~600 TB", math: "2 PB raw × ~30% unique chunks (backups, copies, near-identical versions)" },
  ],
  cacheParam: "hash",
  cacheValues: [],
  related: {
    lessons: ["object-storage", "consistent-hashing", "merkle-trees", "sse-and-websockets", "scaling-websockets", "conflict-resolution", "idempotency", "retries-and-backoff"],
    labs: ["pastebin", "collab-editor"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design file sync",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and data model first. Almost every call is about chunks and versions.",
        "On the canvas, wire the pieces the way a file travels: device, server, and the right store for each kind of data.",
        "Some choices aren't boxes: how files are cut up, who gets told about changes, what a conflict does. They appear as design choices; set them before you run.",
        "Each test adds load or breaks something. Meet every constraint and correctness check to continue.",
      ],
    },
    {
      type: "api",
      id: "api",
      title: "Design the API",
      short: "API",
      minutes: 6,
      body: (
        <>
          <p>
            The protocol is the product. Instead of &ldquo;upload this file&rdquo;, a sync client says: &ldquo;here are the hashes of my chunks, which
            do you lack? Here they are. Now file 77 is made of these chunks.&rdquo; Design one endpoint for each step of that
            conversation, then check your work.
          </p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <p>
          Two properties to notice. <strong>Chunk uploads are idempotent</strong>: the address is the hash, so a retry is harmless.
          And a <strong>commit is tiny</strong>: after the heavy chunks are uploaded, making them visible is one small, atomic
          metadata write.
        </p>
      ),
    },
    {
      type: "schema",
      id: "schema",
      title: "Design the data model",
      short: "Data model",
      minutes: 6,
      body: (
        <>
          <p>
            Pick a database for the <strong>metadata</strong> and sketch: <code>files</code>, one row for each version, a{" "}
            <code>chunks</code> table keyed by hash, and a change feed devices can read from a cursor. The chunk <em>bytes</em> are
            not in this schema: they live in object storage, addressed by the same hash.
          </p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          A hash as the primary key makes chunks <strong>content-addressed</strong>: the name <em>is</em> the content. That gives you
          deduplication for free, makes uploads idempotent, and lets any server verify a chunk by hashing it.
        </p>
      ),
    },
    {
      type: "read",
      id: "chunks-intro",
      title: "Why chunks, and which chunks",
      short: "Chunking",
      minutes: 4,
      eyebrow: "Concept",
      body: (
        <>
          <p>
            A 400 MB deck changes one slide. Hash the whole file and the hash changes, so you must upload everything. Cut it into
            pieces first and only the piece that changed has a new hash.
          </p>
          <Callout tone="key" title="Where you cut matters">
            <p>
              Cut every <strong>4 MB</strong> and a one-line insertion near the top moves every later byte, so every later chunk
              changes. Cut where a <strong>rolling hash</strong> of the content hits a pattern, and the edges move with the content:
              the insertion only disturbs the chunk it landed in.
            </p>
          </Callout>
          <KeyIdea>Name data by what it is, not where it sits, and unchanged data never has to travel again.</KeyIdea>
          <p>
            The same content-addressing also dedupes across files and users: a hundred copies of the same sound rider are one set of
            chunks.
          </p>
        </>
      ),
    },
    design("launch", {
      title: "Launch: upload whole files",
      short: "Launch",
      minutes: 3,
      story:
        "Version one: the client uploads a changed file in full to object storage and records it in the database. A few hundred promoters use it. It is simple, correct, and wasteful.",
      palette: P.base,
      knobs: K.launch,
      startGraph: START,
      hints: [
        "Wire Users → API server, then the server to a database for listings and to object storage for the files.",
        "One server is enough at 400 requests a second.",
        "Budget is $600 a month; every extra box counts against it.",
      ],
      concepts: [
        { term: "Object storage", text: "Durable, cheap, near-unlimited blobs addressed by key. The right home for file bytes.", lesson: "object-storage" },
        { term: "Metadata vs data", text: "Small structured facts about files go in a database; the files themselves don't.", lesson: "data-modeling" },
      ],
    }),
    design("chunks", {
      title: "Send only what changed",
      short: "Chunking",
      minutes: 6,
      story:
        "Promoters edit decks and audio sessions that are hundreds of megabytes. Re-uploading the whole file on every save floods the network: at peak that's 54,000 object-storage writes a second, and one object-storage node handles 50,000. Hash chunks, and skip the ones you already have.",
      palette: P.scale,
      knobs: K.scale,
      hints: [
        "In the design choices, split files into chunks. Then ask which cut points survive an edit near the start of a file.",
        "The server must quickly answer “do I already have chunk 9f2c…?”. A Redis index of hashes does that without touching storage.",
        "Wire the servers to Redis as well as storage. Six servers handle 54,000 lookups a second with room to spare.",
      ],
      concepts: [
        { term: "Content-addressed chunk", text: "A chunk's name is the hash of its bytes, so identical data is stored once.", lesson: "merkle-trees" },
        { term: "Content-defined chunking", text: "Chunk boundaries come from a rolling hash of the data, so an insertion doesn't shift later chunks.", lesson: "consistent-hashing" },
        { term: "Deduplication", text: "Skip uploading data the server already holds, even if another user sent it.", lesson: "object-storage" },
      ],
    }),
    design("metadata", {
      title: "Bytes here, facts there",
      short: "Metadata vs blobs",
      minutes: 4,
      story:
        "Commits are landing at 3,000 a second and devices check for changes 9,000 times a second. The team stored chunk bytes in database rows to keep things in one place. Backups now take a day and the hottest metadata rows keep getting evicted from memory.",
      palette: P.scale,
      knobs: K.scale,
      hints: [
        "Think about what a database is good at: small rows, queries, transactions.",
        "In the design choices, store chunk bytes in object storage.",
        "A cache in front of the change checks absorbs most of the 9,000 reads a second.",
      ],
      concepts: [
        { term: "Metadata store", text: "Small, structured, transactional records: who owns what, which version, which chunks.", lesson: "sql-vs-nosql" },
        { term: "Blob store", text: "Big, immutable, content-addressed objects with no queries.", lesson: "object-storage" },
      ],
    }),
    design("notify", {
      title: "Wake sleeping devices",
      short: "Change notifications",
      minutes: 5,
      story:
        "The phone should show Asha's edit within seconds. Right now every device asks “anything new?” every five seconds, and 200,000 online devices ask a database that nearly always says no. Tell devices when something changes instead.",
      palette: P.live,
      knobs: K.fleet,
      hints: [
        "Hold a connection open per device. Long-polling and WebSockets both do this; each held connection takes a slot on a gateway.",
        "A gateway holds 50,000 connections, so 200,000 devices need at least five (one spare helps).",
        "Gateways must hear about commits that happened on other machines: connect them through pub/sub.",
      ],
      concepts: [
        { term: "Long polling", text: "The client asks; the server holds the request open until something changes or a timeout passes.", lesson: "polling" },
        { term: "WebSocket push", text: "A persistent two-way connection the server can write to at any time.", lesson: "sse-and-websockets" },
        { term: "Notify, then pull", text: "Push a tiny “something changed” and let the device fetch details with its cursor.", lesson: "scaling-websockets" },
      ],
    }),
    design("conflict", {
      title: "Two devices, one file",
      short: "Conflict copies",
      minutes: 5,
      story:
        "Asha edits the stage plan on her laptop on a train with no signal. Meanwhile Ben edits the same plan on his phone. Both reconnect and commit. Whatever the server does next, somebody's hour of work is at stake.",
      palette: P.live,
      knobs: K.fleet,
      hints: [
        "First the server must be able to notice a conflict: what must a commit say about where it started?",
        "Newest-wins silently throws one version away. Locks can't be taken without a connection.",
        "Choose “compare against the latest version” plus “keep both as a conflict copy”.",
      ],
      concepts: [
        { term: "Optimistic concurrency", text: "Assume no conflict; check at commit time that nothing changed since you started.", lesson: "conflict-resolution" },
        { term: "Conflict copy", text: "Keep both versions and let a person choose, instead of guessing.", lesson: "conflict-resolution" },
        { term: "Vector of versions", text: "Each version points at its parent; two children of one parent are a conflict.", lesson: "clocks" },
      ],
    }),
    design("spike", {
      title: "The festival photo dump",
      short: "Big upload spike",
      minutes: 5,
      story:
        "The college fest ends and 8,000 people upload their photos at the same moment. Every new file also needs a virus scan, thumbnails and indexing. Scan jobs triple for ten seconds. Phone connections are bad; uploads are failing halfway and retrying.",
      palette: P.all,
      knobs: K.fleet,
      hints: [
        "Scanning should never block an upload. Put a queue and workers between them.",
        "Each worker does ~200 scans a second and the spike brings ~1,500: 8 workers keep up.",
        "In the design choices: resume dropped uploads from the last chunk, and retry with backoff.",
      ],
      concepts: [
        { term: "Queue as a shock absorber", text: "Accept work instantly and drain it at a pace the workers can sustain.", lesson: "queues-and-workers" },
        { term: "Resumable upload", text: "Ask which chunks the server has; send only the missing ones.", lesson: "idempotency" },
        { term: "Exponential backoff", text: "Wait longer after each failure, with jitter, so retries don't pile onto an overloaded server.", lesson: "retries-and-backoff" },
      ],
    }),
    {
      type: "choose",
      id: "chunk-size",
      title: "How big should a chunk be?",
      short: "Chunk size",
      minutes: 3,
      body: (
        <p>
          You chose content-defined chunking, which has a <em>target</em> size. The target is one of the most debated numbers in sync
          systems, because it trades bandwidth against bookkeeping.
        </p>
      ),
      prompt: "Which target size would you ship?",
      options: [
        {
          id: "small",
          title: "~64 KB",
          summary: "Many small chunks.",
          pros: ["Tiny edits re-send very little", "Excellent deduplication"],
          cons: ["A 1 GB file is 16,000 chunks: lookups and metadata multiply", "More HTTP requests, more overhead per byte"],
          when: "Large files that change in small places (virtual disks, databases) and a backend that comfortably handles many tiny records.",
        },
        {
          id: "medium",
          title: "~4 MB",
          summary: "A few hundred chunks for a large file.",
          pros: ["Metadata stays small", "Good connection throughput", "Still skips most unchanged data"],
          cons: ["A one-byte edit re-sends 4 MB", "Less dedupe between near-identical files"],
          when: "General-purpose document and photo sync. The usual default.",
        },
        {
          id: "large",
          title: "~64 MB",
          summary: "Very few chunks.",
          pros: ["Minimal metadata and lookups", "Cheapest per request"],
          cons: ["Almost any edit re-sends a huge chunk", "A failed chunk is expensive to retry"],
          when: "Mostly write-once media like videos, where files rarely change after upload.",
        },
      ],
      after: (
        <p>
          Real systems often vary it: small chunks for files that change in the middle, big ones for files that are only appended
          to. Whatever you pick, it&apos;s a knob you can tune later; the protocol (hashes, a missing list, a commit) doesn&apos;t change.
        </p>
      ),
    },
    {
      type: "choose",
      id: "dedupe-scope",
      title: "Deduplicate across users?",
      short: "Dedupe scope",
      minutes: 3,
      body: (
        <p>
          &ldquo;Does the server already have this chunk?&rdquo; saves the most bandwidth when the answer covers every user. But the answer itself is
          information.
        </p>
      ),
      prompt: "What do you check chunk hashes against?",
      options: [
        {
          id: "global",
          title: "All users' chunks",
          summary: "One shared pool; a chunk is stored once.",
          pros: ["Biggest storage and bandwidth savings", "Popular files are instant to “upload”"],
          cons: ["Leaks existence: “the upload was instant” tells you someone has this file", "Deleting needs careful reference counting across accounts"],
          when: "Public or low-sensitivity data where the privacy leak is acceptable.",
        },
        {
          id: "user",
          title: "Only the user's own chunks",
          summary: "Each account has its own dedupe scope.",
          pros: ["No cross-account information leak", "Simple deletion and per-user encryption"],
          cons: ["Two people with the same file both pay for it", "Smaller savings"],
          when: "Private files, or when each customer's data is encrypted with their own key.",
        },
        {
          id: "org",
          title: "Per organisation",
          summary: "Dedupe within a team, not across customers.",
          pros: ["Big savings where duplicates actually live", "Isolation between customers"],
          cons: ["Needs an organisation concept in the chunk key", "Moving files between orgs re-uploads them"],
          when: "B2B products like Gatepass's promoter teams: lots of sharing inside a company, none outside it.",
        },
      ],
      after: (
        <p>
          A security detail hides in a performance feature. Rate-limit the &ldquo;do you have this hash?&rdquo; call, and prefer scopes where a
          positive answer doesn&apos;t reveal anything the asker couldn&apos;t already know.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed file sync",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You began by uploading whole files and ended with a protocol: chunk, hash, ask what is missing, upload only that, commit
          atomically. Bytes live in object storage and facts in a database; devices are woken by push and catch up with a cursor;
          conflicts become copies instead of lost work; and bursts wait in a queue. The habit to keep:{" "}
          <strong>move the smallest thing that changed</strong>.
        </p>
      ),
    },
  ],
};
