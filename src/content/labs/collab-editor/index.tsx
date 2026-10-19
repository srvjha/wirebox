import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Lab, LabGraph } from "@/lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { STEPS } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: LabGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };

const K = {
  launch: ["size"] as Knob[],
  live: ["size", "shards"] as Knob[],
  gateway: ["size", "shards", "healthChecks"] as Knob[],
};

const P = {
  base: ["client", "server", "db"] as DesignStep["palette"],
  live: ["client", "lb", "ws", "server", "pubsub", "db", "cache"] as DesignStep["palette"],
  history: ["client", "lb", "ws", "server", "pubsub", "db", "cache", "queue", "worker", "storage"] as DesignStep["palette"],
};

const design = (id: keyof typeof STEPS, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief">): DesignStep => ({
  type: "design",
  id,
  ...STEPS[id],
  debrief: DEBRIEFS[id],
  ...step,
});

export const collabEditor: Lab = {
  slug: "collab-editor",
  version: 1,
  title: "Design a collaborative editor",
  product: "Collaborative editor",
  intro: (
    <>
      <p>
        Gatepass promoters used to email each other a poster-copy document and wait. Now they want to write it <strong>together</strong>,
        in one page, watching each other&apos;s cursors, the way a shared doc should work. Nobody can lose a sentence, even when two
        people type in the same paragraph in the same second.
      </p>
      <p>
        The hard part isn&apos;t sending bytes. It is deciding what the document <em>is</em> when several people change it at once and
        the network delivers their changes in different orders. You&apos;ll build the live connection layer, decide who is allowed to
        put edits in order, choose how conflicts merge, keep a history you can replay, and survive a dead gateway.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Edit a document together", detail: "Everyone sees each other's changes within a fraction of a second." },
    { kind: "functional", text: "See who is where", detail: "Colored cursors and a list of people in the doc." },
    { kind: "functional", text: "History and undo", detail: "Go back to any earlier version." },
    { kind: "non-functional", text: "Never lose an edit", detail: "Two people typing at once both keep their words." },
    { kind: "non-functional", text: "Feels instant", detail: "Keystrokes appear on screen immediately, remote edits in about 150 ms." },
    { kind: "non-functional", text: "Converges", detail: "After the dust settles, every screen shows the same text." },
    { kind: "non-functional", text: "Resilient", detail: "A gateway dying costs a reconnect, not a document." },
  ],
  estimates: [
    { label: "Open editors, peak", value: "~90,000", math: "30,000 active docs × 3 people each" },
    { label: "Edits, peak", value: "~12,000/s", math: "4,000 typists × ~3 batched operations a second" },
    { label: "Deliveries, peak", value: "~36,000/s", math: "12,000 edits × 3 other people (fan-out)" },
    { label: "Operation log, a year", value: "~4 TB", math: "12k/s peak, ~1k/s average × 31M s × ~120 B" },
  ],
  cacheParam: "id",
  cacheValues: [],
  related: {
    lessons: ["sse-and-websockets", "scaling-websockets", "presence", "pub-sub", "conflict-resolution", "clocks", "event-sourcing", "sharding", "retries-and-backoff"],
    labs: ["chat", "file-sync"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design a collaborative editor",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first. The operation log is the heart of this product.",
        "On the canvas, wire the pieces the way a keystroke travels: user, gateway, server, database.",
        "Some choices aren't boxes at all: how to route a document, how to merge, what to store. They appear as design choices; set them before you run.",
        "Each test adds load or breaks something. Meet every constraint and every correctness check to move on.",
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
            Live typing will go over a WebSocket, but you still need a plain HTTP API: to create a document, to open it, and as the
            fallback when a socket can&apos;t connect. One idea runs through all of it: an edit is not &ldquo;the new text&rdquo;. It is{" "}
            <strong>what changed, and which version it was based on</strong>.
          </p>
          <p>Design one endpoint for each requirement, then check your work.</p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <p>
          Notice what you didn&apos;t build: a <code>PUT /docs/:id</code> that replaces the whole text. That is the endpoint that makes
          two simultaneous saves overwrite each other. Sending operations with a base version gives the server enough to merge them.
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
            Pick a database, then sketch tables for three things: the <strong>documents</strong>, an append-only{" "}
            <strong>operations log</strong> (one row per edit, in order within each document), and <strong>snapshots</strong> of the
            text at points in the log.
          </p>
          <p>
            Why keep the log instead of just the latest text? It is how you merge concurrent edits, undo, show history and rebuild
            after a crash. This is the same idea as event sourcing.
          </p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          The key <code>(doc_id, seq)</code> does two jobs at once: it keeps one document&apos;s operations together on one shard, and
          its uniqueness catches two servers handing out the same sequence number.
        </p>
      ),
    },
    {
      type: "read",
      id: "problem",
      title: "Why shared editing is hard",
      short: "The core problem",
      minutes: 4,
      eyebrow: "Concept",
      body: (
        <>
          <p>
            Asha and Ben both see <code>&ldquo;Doors at 8&rdquo;</code>. Asha inserts <code>&ldquo; sharp&rdquo;</code> after 8. Ben, at the same moment, deletes{" "}
            <code>&ldquo;Doors &rdquo;</code>. Each applied their own edit instantly, and now each must apply the other&apos;s.
          </p>
          <p>
            If Ben&apos;s &ldquo;delete characters 0–6&rdquo; arrives at Asha unchanged it works. But Asha&apos;s &ldquo;insert at position 8&rdquo; arriving at
            Ben, who has already deleted six characters, lands in the wrong place. <strong>Positions shift.</strong> The same
            operation means different things depending on what was applied before it.
          </p>
          <Callout tone="key" title="Three ways out">
            <p>
              <strong>Last write wins</strong>: pick one version and throw away the other. <strong>Operational transform</strong>: a
              server rewrites each operation against the ones it didn&apos;t know about. <strong>CRDT</strong>: give every character a
              permanent id, so operations never depend on positions at all.
            </p>
          </Callout>
          <KeyIdea>Real-time editing is a distributed-systems problem wearing a text-box costume.</KeyIdea>
          <p>
            You&apos;ll make the real choices in a moment. First, get the plumbing working: thousands of people connected at the same
            time.
          </p>
        </>
      ),
    },
    design("launch", {
      title: "Launch: save the whole page",
      short: "Launch",
      minutes: 3,
      story:
        "Version one: a document is a row. The browser sends the full text every few seconds, and refreshing shows what's saved. A few hundred promoters use it. It is the simplest thing that works, so build exactly that.",
      palette: P.base,
      knobs: K.launch,
      startGraph: START,
      hints: [
        "Wire Users → API server → Database.",
        "Fewer boxes is a feature at launch. One server is plenty for 100 requests a second.",
        "The budget is $700 a month. Count what you're paying for before you add anything.",
      ],
      concepts: [
        { term: "Autosave", text: "Send the whole document on a timer. Easy, and the root of the overwrite problem.", lesson: "conflict-resolution" },
        { term: "Right-sizing", text: "Start with the cheapest design that meets today's goals.", lesson: "vertical-vs-horizontal" },
      ],
    }),
    design("live", {
      title: "Everyone types at once",
      short: "Live typing",
      minutes: 5,
      story:
        "Autosave isn't live. Promoters want to see edits as they happen, so every browser keeps a WebSocket open and sends each keystroke batch as an operation. At peak that's 90,000 open sockets, 12,000 operations a second, and every operation is shown to three other people.",
      palette: P.live,
      knobs: K.live,
      hints: [
        "A gateway holds 50,000 connections, so 90,000 users need more than one. Add gateways behind a load balancer.",
        "Once there are two gateways, Asha and Ben may be on different ones. Wire every gateway to a pub/sub broker, both ways.",
        "12,000 writes a second is more than one database node takes (8,000). Shard the database in the inspector.",
      ],
      concepts: [
        { term: "WebSocket", text: "A connection that stays open so the server can push edits the moment they happen.", lesson: "sse-and-websockets" },
        { term: "Fan-out via pub/sub", text: "Gateways subscribe to the documents their users have open; one publish reaches all of them.", lesson: "scaling-websockets" },
        { term: "Sharding by doc id", text: "A document's whole log lives on one shard, so ordering stays local.", lesson: "sharding" },
      ],
    }),
    design("sessions", {
      title: "One session per document",
      short: "Document sessions",
      minutes: 4,
      story:
        "Asha's and Ben's edits to the same document are reaching two different servers. Each server has its own idea of what version the document is at, so they number operations independently and the log ends up with two operation #4812s.",
      palette: P.live,
      knobs: K.live,
      hints: [
        "Somebody has to be the one place that decides the order of a document's edits.",
        "Choose a routing rule so the same document always reaches the same server.",
        "In the design choices, route a document's editors to the doc's own server.",
      ],
      concepts: [
        { term: "Sticky routing", text: "A rule (hash of the document id) that always sends the same document to the same server.", lesson: "request-routing" },
        { term: "Session ownership", text: "One server owns an open document: it keeps it in memory and numbers its operations.", lesson: "leader-election" },
      ],
    }),
    design("conflict", {
      title: "Two people, one paragraph",
      short: "Merging edits",
      minutes: 5,
      story:
        "Asha and Ben type into the same paragraph at the same instant. The two operations were both based on version 41. Whatever you do with them, both people must end up with identical text, and neither may lose a word.",
      palette: P.live,
      knobs: K.live,
      hints: [
        "Think about what each choice does to the loser of the race.",
        "Last write wins is easy because it throws one of the edits away. That is the bug, not a feature.",
        "Choose OT or CRDT. OT needs one referee per document, which you set up in the previous step.",
      ],
      concepts: [
        { term: "Operational transform", text: "Rewrite an incoming operation so it still means the same thing after the operations it missed.", lesson: "conflict-resolution" },
        { term: "CRDT", text: "A data structure where concurrent edits merge to the same result in any order.", lesson: "conflict-resolution" },
        { term: "Convergence", text: "Every replica ends up with identical content once all operations are delivered.", lesson: "consistency-models" },
      ],
    }),
    design("history", {
      title: "A two-million-edit document",
      short: "Log and snapshots",
      minutes: 5,
      story:
        "The quarterly planning doc has two million operations. Opening it replays them all, taking nearly half a minute. You want to keep the log (for history and undo) but not replay it every time. Snapshots are written in the background.",
      palette: P.history,
      knobs: K.live,
      hints: [
        "Snapshotting is work you shouldn't do while a user is typing. Queue it.",
        "Route: server → queue → worker → object storage. 240 snapshots a second at 100 ms each needs about three workers.",
        "In the design choices, snapshot every 500 operations: not never, and not after every keystroke.",
      ],
      concepts: [
        { term: "Event log", text: "An append-only list of changes. The current state is whatever you get by replaying it.", lesson: "event-sourcing" },
        { term: "Snapshot", text: "The state at operation N. Load it, then replay only what came after.", lesson: "event-sourcing" },
        { term: "Object storage", text: "Cheap, durable blobs: the right home for big documents rarely read as a whole.", lesson: "object-storage" },
      ],
    }),
    design("presence", {
      title: "Where is everyone?",
      short: "Cursors",
      minutes: 4,
      story:
        "People want to see each other's colored cursors. A cursor moves much more often than text changes: 25,000 moves a second at peak, each shown to eight other people. A cursor is stale after a second.",
      palette: P.history,
      knobs: K.live,
      hints: [
        "Cursor moves aren't operations. They never need to be replayed.",
        "Route them gateway → pub/sub → gateways, with no server and no database.",
        "That much fan-out may need another gateway. Watch the gateway utilisation.",
      ],
      concepts: [
        { term: "Presence", text: "Ephemeral who-is-here state. It is broadcast, expires on its own and is never the source of truth.", lesson: "presence" },
        { term: "Pub/sub", text: "Publish once to a topic and every subscribed gateway forwards it to its users.", lesson: "pub-sub" },
      ],
    }),
    design("gateway", {
      title: "A gateway dies",
      short: "Lose a gateway",
      minutes: 5,
      story:
        "Five seconds in, a gateway's host loses its network. About a quarter of all editors are disconnected at once. Their browsers all notice together and try to reconnect, while some have unsent typing.",
      palette: P.history,
      knobs: K.gateway,
      hints: [
        "Health checks let the load balancer stop sending users to the dead gateway.",
        "The surviving gateways must fit everyone: do you have one more than the load needs?",
        "Set reconnects to jittered backoff, and have returning clients resume from their last version.",
      ],
      concepts: [
        { term: "N+1 gateways", text: "Run one more than peak needs so losing any one fits on the rest.", lesson: "health-checks" },
        { term: "Backoff with jitter", text: "A growing, randomized wait stops thousands of clients retrying in lockstep.", lesson: "retries-and-backoff" },
        { term: "Resumable sessions", text: "A client says “I last saw version N” and receives only what followed.", lesson: "scaling-websockets" },
      ],
    }),
    {
      type: "choose",
      id: "ot-vs-crdt",
      title: "OT or CRDT?",
      short: "OT vs CRDT",
      minutes: 4,
      body: (
        <p>
          Both reach the same promise: everyone converges, no edit is lost. They get there with different costs, and the right pick
          depends on what the product will become.
        </p>
      ),
      prompt: "Which would you build the editor on?",
      options: [
        {
          id: "ot",
          title: "Operational transform",
          summary: "A server orders operations and transforms each against concurrent ones.",
          pros: ["Compact: operations are small and the document has no extra metadata", "Mature: powers the best-known web editors", "The server is a natural place for permissions and history"],
          cons: ["Needs a central referee per document", "Transform functions for rich text are famously hard to get right", "Offline editing for long periods is painful"],
          when: "A server-centric product where documents are edited online, and you can afford a team that will own the transform code.",
        },
        {
          id: "crdt",
          title: "CRDT",
          summary: "Every character has a unique id, so concurrent edits merge in any order.",
          pros: ["No central referee: edits merge on any replica", "Offline-first and peer-to-peer come naturally", "Easier to reason about correctness"],
          cons: ["Metadata per character makes documents bigger", "Deleted text leaves tombstones until compacted", "Server-side features (search, permissions) must work over the structure"],
          when: "Apps that must work offline or sync across devices, or when you want mergeable edits without running a single owner server.",
        },
        {
          id: "lock",
          title: "Lock the paragraph",
          summary: "Only one person can edit a block at a time; others are shown a lock.",
          pros: ["Trivial to build", "No merge logic at all"],
          cons: ["Feels like 2005", "A lock held by a closed laptop blocks others", "Not real simultaneous editing"],
          when: "Structured forms and approval workflows, where two people editing one field is a mistake anyway.",
        },
      ],
      after: (
        <p>
          Notice that your sticky routing from earlier is a hidden dependency of OT but optional for CRDTs. Many teams that start on
          OT keep the owner-per-document design anyway, because ordering, permissions and history are easier with one place that
          sees everything.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed a collaborative editor",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You began with a document as a row and ended with a log of operations, a sticky owner per document, a merge strategy,
          snapshots written in the background, ephemeral cursors on pub/sub, and a plan for a gateway dying at the worst moment.
          The pattern to keep: <strong>store what happened, not what it looks like now</strong>, and spend durability only on what
          users would miss.
        </p>
      ),
    },
  ],
};
