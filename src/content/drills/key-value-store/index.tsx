import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Drill, DrillGraph } from "@/lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { STEPS } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: DrillGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };

const K = {
  launch: ["size"] as Knob[],
  cluster: ["size", "shards"] as Knob[],
  resilient: ["size", "shards", "healthChecks"] as Knob[],
  hot: ["size", "shards", "healthChecks", "hitRate"] as Knob[],
};

const P = {
  base: ["client", "server", "db"] as DesignStep["palette"],
  cluster: ["client", "lb", "server", "db"] as DesignStep["palette"],
  hot: ["client", "lb", "server", "db", "cache"] as DesignStep["palette"],
};

const design = (id: keyof typeof STEPS, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief">): DesignStep => ({
  type: "design",
  id,
  ...STEPS[id],
  debrief: DEBRIEFS[id],
  ...step,
});

export const keyValueStore: Drill = {
  slug: "key-value-store",
  version: 1,
  title: "Design a key-value store",
  product: "Key-value store",
  intro: (
    <>
      <p>
        Every Gatepass service keeps small lookups somewhere: seat maps, session tokens, the &ldquo;sold out&rdquo; flag for tonight&apos;s
        gig. The platform team wants a store they can run as a service: put a value under a key, get it back, in a few
        milliseconds, no matter how many keys there are or how many machines are failing.
      </p>
      <p>
        You&apos;re designing something in the spirit of Amazon&apos;s Dynamo: no master, every node alike, and a deliberate choice
        about consistency. Start with one machine. Then <strong>partition</strong> the keys, <strong>replicate</strong> them,
        decide how many replicas must agree, survive a dead node, repair what it missed, and cope with one key that everybody
        wants.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Get, put and delete by key", detail: "Values are opaque blobs up to a few kilobytes." },
    { kind: "functional", text: "Grow by adding nodes", detail: "No downtime, no giant reshuffle." },
    { kind: "non-functional", text: "Fast", detail: "p99 under 50 ms for reads and writes." },
    { kind: "non-functional", text: "Always writable", detail: "A dead node shouldn't stop a write to its keys." },
    { kind: "non-functional", text: "Durable", detail: "A dead disk loses no acknowledged write." },
    { kind: "non-functional", text: "Tunable consistency", detail: "Each caller chooses between faster and more up to date." },
    { kind: "non-functional", text: "Even load", detail: "No node is a bottleneck, even for a skewed key set." },
  ],
  estimates: [
    { label: "Reads, peak", value: "~30,000/s", math: "20 services × ~1,500 lookups a second" },
    { label: "Writes, peak", value: "~6,000/s", math: "About 5 reads per write" },
    { label: "Data", value: "~2 TB", math: "2 billion keys × ~1 KB, before replication" },
    { label: "Stored, 3 copies", value: "~6 TB", math: "2 TB × N = 3, spread over ~6 partitions" },
  ],
  cacheParam: "key",
  cacheValues: [],
  related: {
    lessons: ["partitioning-strategies", "consistent-hashing", "replication-modes", "quorums", "consistency-models", "hot-keys", "rebalancing", "merkle-trees", "lsm-trees"],
    drills: ["url-shortener", "file-sync"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design a key-value store",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the storage layout first. The shape of a get and a put drives everything.",
        "On the canvas, each server is a cluster node that coordinates requests; the database's partitions are where keys live.",
        "Replication, quorums, repair and hot keys are design choices, not boxes: set them before you run. Each step checks them as well as the load.",
        "The tests add traffic, then failures. Meet every constraint and check to continue.",
      ],
    },
    {
      type: "api",
      id: "api",
      title: "Design the API",
      short: "API",
      minutes: 5,
      body: (
        <>
          <p>
            Three operations, and each hides a distributed-systems subtlety. A value comes back with a <strong>context</strong> (a
            version), because with several copies two replicas can disagree. A put sends that context back so the store knows
            which version is being replaced. And a delete is really a write.
          </p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <p>
          The context is the whole story of Dynamo-style stores in one field. When two writers both replace version 4 at the same
          moment, there is no single latest value: the store keeps both and hands them back to the next reader to merge.
        </p>
      ),
    },
    {
      type: "schema",
      id: "schema",
      title: "Design the node's storage",
      short: "Storage layout",
      minutes: 6,
      body: (
        <>
          <p>
            Choose the engine each node uses locally, then lay out what a node stores: the <strong>key-value data</strong> itself
            (with a version and a delete marker), the <strong>ring</strong> that records which node owns which slice, and{" "}
            <strong>hints</strong>: writes held for a replica that was down.
          </p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          Each of the three tables exists because of a failure you&apos;re about to meet. The version resolves conflicting copies, the{" "}
          tombstone stops deleted keys coming back from the dead, and hints let a write survive a down replica.
        </p>
      ),
    },
    {
      type: "read",
      id: "dynamo",
      title: "The Dynamo recipe",
      short: "The recipe",
      minutes: 4,
      eyebrow: "Concept",
      body: (
        <>
          <p>
            Dynamo-style stores are built from a handful of independent ideas. You&apos;ll meet each of them as something breaks.
          </p>
          <Callout tone="key" title="Five ideas">
            <p>
              <strong>Consistent hashing</strong> puts nodes and keys on a ring so a key belongs to the next nodes clockwise.{" "}
              <strong>Replication</strong> stores each key on N consecutive nodes. <strong>Quorums</strong> (R and W) let each
              request pick how many of those must answer. <strong>Hinted handoff</strong> and <strong>read repair</strong> heal
              replicas that missed writes. <strong>Merkle trees</strong> find the differences that remain.
            </p>
          </Callout>
          <KeyIdea>There is no master. Any node can coordinate any request, and the cluster agrees by overlapping majorities rather than by electing a leader.</KeyIdea>
          <p>
            In the simulator, each <em>server</em> you place is a node coordinating requests, and the database&apos;s partitions are
            where the keys live. Replication and quorum settings are choices you make in the design panel.
          </p>
        </>
      ),
    },
    design("launch", {
      title: "Launch: one node",
      short: "Launch",
      minutes: 3,
      story:
        "The first version is the simplest store that works: one server in front of one database. A few services use it for about 2,400 operations a second.",
      palette: P.base,
      knobs: K.launch,
      startGraph: START,
      hints: [
        "Wire Users → API server → Database.",
        "$500 a month is the budget. A cluster of servers and shards can wait.",
        "One m-size server handles this load with room to spare.",
      ],
      concepts: [
        { term: "Key-value store", text: "A dictionary as a service: put(key, value), get(key). No joins, no queries.", lesson: "sql-vs-nosql" },
        { term: "LSM tree", text: "Writes append to a log and memory, then merge into sorted files: very fast writes.", lesson: "lsm-trees" },
      ],
    }),
    design("partition", {
      title: "Past one machine",
      short: "Partitioning",
      minutes: 6,
      story:
        "Twenty services now use the store: 36,000 operations a second, more than one database can serve. Split the keys over several partitions. How you decide which key goes where matters more than how many partitions you have.",
      palette: P.cluster,
      knobs: K.cluster,
      hints: [
        "Add database shards in the inspector. The load is about 1.6 databases' worth, so aim for each shard under 60%.",
        "Open the design choices. Splitting by key range makes neighbouring keys share a partition; a popular prefix means a hot partition.",
        "Hashing is even, but what happens to hash mod N when you add a node? A ring with many virtual nodes avoids both problems.",
      ],
      concepts: [
        { term: "Consistent hashing", text: "Place nodes and keys on a ring. A key belongs to the next node clockwise, so adding a node only moves its neighbour's keys.", lesson: "consistent-hashing" },
        { term: "Virtual nodes", text: "Each machine owns many small slices of the ring, which evens out load and makes rebalancing gradual.", lesson: "rebalancing" },
        { term: "Skew", text: "Uneven load across partitions: one is hot while the others idle.", lesson: "partitioning-strategies" },
      ],
    }),
    design("replicate", {
      title: "A disk dies",
      short: "Replication",
      minutes: 5,
      story:
        "A node's disk fails overnight and every key it held is gone. Services start returning “not found” for data that existed an hour ago. Keep several copies of every key, on different nodes.",
      palette: P.cluster,
      knobs: K.cluster,
      hints: [
        "In the design choices set N, the number of copies of every key. Why isn't two enough?",
        "Replication is not free: each write is now stored N times. Check the capacity check after you run.",
        "Add partitions to absorb the extra writes. Six shards is the sweet spot for N = 3.",
      ],
      concepts: [
        { term: "Replication factor (N)", text: "How many nodes store each key. Three is the usual balance of safety and cost.", lesson: "replication-modes" },
        { term: "Write amplification", text: "One logical write becomes N physical writes, so capacity needs scale with N.", lesson: "replication-modes" },
        { term: "Preference list", text: "The N nodes clockwise from the key on the ring, skipping virtual nodes of the same machine.", lesson: "consistent-hashing" },
      ],
    }),
    design("quorum", {
      title: "Read what you wrote",
      short: "Quorums",
      minutes: 5,
      story:
        "A service writes a seat as taken and reads it straight back, and sees it free. The write was acknowledged by one replica; the read asked a different one. With three copies, you decide how many must agree: W on writes, R on reads.",
      palette: P.cluster,
      knobs: K.cluster,
      hints: [
        "A read is only guaranteed to see the latest write if the replicas it asks must overlap with the ones that took the write.",
        "With N = 3: W = 1 and R = 1 can miss completely. What about W = 2, R = 2?",
        "The rule is R + W > N. Several combinations satisfy it; they differ in which side is fast.",
      ],
      concepts: [
        { term: "Quorum", text: "A majority. Any two majorities share at least one member, so a read quorum always overlaps the last write quorum.", lesson: "quorums" },
        { term: "R + W > N", text: "The condition that every read set intersects every write set.", lesson: "quorums" },
        { term: "Tunable consistency", text: "R and W chosen per request: strong when it matters, fast when it doesn't.", lesson: "consistency-models" },
      ],
    }),
    design("nodedown", {
      title: "A node dies",
      short: "Lose a node",
      minutes: 5,
      story:
        "At peak, a node's machine loses power. A third of the keys now have one replica missing, and the load balancer is still sending traffic to the dead coordinator. Reads and writes must keep working.",
      palette: P.cluster,
      knobs: K.resilient,
      hints: [
        "Turn on health checks in the load balancer so it stops sending to the dead node.",
        "The remaining nodes must absorb the load. Do you have one more node than peak needs?",
        "Look at your R and W. If either equals N, one down replica blocks every request touching its keys.",
      ],
      concepts: [
        { term: "Always writable", text: "Dynamo's goal: accept writes even during failures, and sort out differences later.", lesson: "slos-and-nines" },
        { term: "Sloppy quorum", text: "If a replica is down, write to the next healthy node on the ring as a stand-in.", lesson: "quorums" },
        { term: "N+1", text: "Capacity for one failure without overload.", lesson: "health-checks" },
      ],
    }),
    design("repair", {
      title: "The node comes back",
      short: "Repair",
      minutes: 5,
      story:
        "The node returns after ten minutes, with every write from that time missing. Reads with R = 1 can land on it and return old data. Nothing is wrong, in the sense that no alarm fired, yet one of three copies is quietly out of date.",
      palette: P.cluster,
      knobs: K.resilient,
      hints: [
        "Three mechanisms heal replicas: hinted handoff, read repair and anti-entropy. They fix different things.",
        "Read repair is cheap but only fixes keys that are read. What about keys nobody reads?",
        "Choose the full set: hinted handoff while it's down, read repair on the way, and Merkle-tree anti-entropy in the background.",
      ],
      concepts: [
        { term: "Hinted handoff", text: "A stand-in node keeps the writes meant for a dead replica and hands them over on its return.", lesson: "quorums" },
        { term: "Read repair", text: "A read that sees replicas disagree writes the newest value back to the stale ones.", lesson: "consistency-models" },
        { term: "Anti-entropy", text: "Compare Merkle trees between replicas to find and copy only the keys that differ.", lesson: "merkle-trees" },
      ],
    }),
    design("hotkey", {
      title: "One key everyone wants",
      short: "Hot key",
      minutes: 5,
      story:
        "A celebrity posts about tonight's gig and one profile key is read 20,000 times a second for ten seconds. Your partitioning is perfect for millions of keys and useless for this one: all of its traffic goes to the same three replicas.",
      palette: P.hot,
      knobs: K.hot,
      hints: [
        "Adding partitions won't help: one key lives on one partition's replicas.",
        "Answer the reads before they get there: add a cache and wire the servers to it. Or split the key into sub-keys.",
        "In the design choices, say how the hot key is handled, and make sure what you chose exists on the canvas.",
      ],
      concepts: [
        { term: "Hot key", text: "A single key with a huge share of traffic. Partitioning can't spread one key.", lesson: "hot-keys" },
        { term: "Key splitting", text: "Store a hot counter as many sub-keys, write to a random one, and sum them on read.", lesson: "hot-keys" },
        { term: "Read-through cache", text: "Keep the hottest values in memory in front of the owners.", lesson: "cache-aside" },
      ],
    }),
    {
      type: "choose",
      id: "consistency",
      title: "How consistent should it be?",
      short: "Consistency",
      minutes: 4,
      body: (
        <p>
          Your quorum settings aren&apos;t only a technical dial. They decide what product behaviour your users see during failures.
          Different callers of the same store need different answers.
        </p>
      ),
      prompt: "What default would you give new services?",
      options: [
        {
          id: "strong",
          title: "Quorum reads and writes",
          summary: "R = W = majority. Reads see the latest write.",
          pros: ["No stale reads while a quorum is up", "Easy to reason about", "Survives one failure out of three"],
          cons: ["Latency of the slower of the two replicas asked", "Unavailable for a key if two of its three replicas are down"],
          when: "Anything where staleness is a correctness bug: inventory counts, session revocation, feature flags that gate payments.",
        },
        {
          id: "fast-reads",
          title: "R = 1, W = N",
          summary: "Writes go everywhere; reads ask one node.",
          pros: ["The fastest possible reads", "Reads stay up while any single replica lives"],
          cons: ["One dead replica blocks writes to its keys", "Slow writes"],
          when: "Read-heavy, write-rare data such as configuration, where blocking a rare write during an outage is acceptable.",
        },
        {
          id: "eventual",
          title: "R = 1, W = 1",
          summary: "The first replica answers; the rest catch up.",
          pros: ["Lowest latency", "Highest availability: works while any replica is up"],
          cons: ["Reads may be stale for a while", "Concurrent writes diverge and must be reconciled"],
          when: "Data where slightly old is fine: view counts, recommendations, caches. Pair with read repair.",
        },
      ],
      after: (
        <p>
          The real lesson of Dynamo is that this is a per-request knob. The CAP theorem says you can&apos;t have everything during a
          partition, so let each caller choose which compromise it prefers.
        </p>
      ),
    },
    {
      type: "choose",
      id: "conflicts",
      title: "Two writers, two versions",
      short: "Resolving conflicts",
      minutes: 4,
      body: (
        <p>
          Two clients read version 4 of a shopping cart and each write a new version at the same moment, on different replicas.
          Neither knew about the other. Now two replicas hold different values for one key, and the store has to decide what a
          read returns.
        </p>
      ),
      prompt: "How should the store resolve it?",
      options: [
        {
          id: "lww",
          title: "Last write wins",
          summary: "Compare timestamps and keep the later one.",
          pros: ["Trivial, and always one answer", "No work for callers"],
          cons: ["Clocks drift, so “later” can be wrong", "Silently drops one of the writes"],
          when: "Idempotent overwrites where losing one is harmless, such as caching or a last-seen time.",
        },
        {
          id: "vector",
          title: "Vector clocks, return siblings",
          summary: "Track causality; if neither version descends from the other, return both for the caller to merge.",
          pros: ["Nothing is lost silently", "Detects true concurrency"],
          cons: ["Callers must write merge logic", "Clocks grow with the number of writers"],
          when: "Data where merging has a clear meaning, like a cart (union the items). Dynamo's original answer.",
        },
        {
          id: "crdt",
          title: "Merge by data type (CRDT)",
          summary: "Values are types like counters and sets that merge automatically.",
          pros: ["No siblings and no caller logic", "Replicas always converge"],
          cons: ["Limited to data that fits a mergeable type", "Metadata overhead"],
          when: "Counters, sets, flags and collaborative state, where the type itself says how to combine.",
        },
      ],
      after: (
        <p>
          Notice the tombstone in your schema: deletes are writes, so they conflict like any other. A delete that reaches one
          replica and an old value that reaches another is exactly the case this decision exists for.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed a key-value store",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You started with a dictionary on one machine and ended with a leaderless cluster: a ring that grows without reshuffling,
          N copies of every key, quorums that you tune per request, a failure that costs a few seconds, replicas that heal
          themselves and a defence against the one key everyone wants. Each mechanism answered a failure you saw. That is how the
          real systems evolved too.
        </p>
      ),
    },
  ],
};
