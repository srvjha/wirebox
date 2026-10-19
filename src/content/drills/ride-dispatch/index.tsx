import { Box, Diagram, Packet, Tag, Text, Wire } from "@/components/diagram/kit";
import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Drill, DrillGraph } from "@/lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: DrillGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };
const P = {
  base: ["client", "server", "db"] as DesignStep["palette"],
  fast: ["client", "lb", "server", "cache", "db"] as DesignStep["palette"],
  jobs: ["client", "lb", "server", "cache", "db", "queue", "worker"] as DesignStep["palette"],
  live: ["client", "lb", "server", "cache", "db", "queue", "worker", "ws", "pubsub"] as DesignStep["palette"],
};
const K = ["size", "shards"] as Knob[];

const design = (id: keyof typeof DESIGN, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief" | "flows" | "incident" | "incidentText" | "nodeDefaults" | "customKnobs" | "customChecks" | "customCheckLabels">): DesignStep => ({
  type: "design",
  id,
  ...DESIGN[id],
  debrief: DEBRIEFS[id],
  ...step,
});

export const rideDispatch: Drill = {
  slug: "ride-dispatch",
  version: 1,
  title: "Design ride dispatch",
  product: "Ride dispatch",
  intro: (
    <>
      <p>
        Gatepass added GatepassGo: a cab to the venue and back, so nobody has to find parking at a stadium. A rider taps a button,
        and within seconds the nearest free driver must be on the way, while both of them keep moving.
      </p>
      <p>
        That last clause is the trick. Most systems store data that sits still and ask questions about it. Here the data is 200,000
        cars that change position every four seconds, and the question is &quot;who is closest, right now?&quot;. You&apos;ll build
        a live map in memory, a way to search it, a matching service that never double-books a driver, city-based sharding and
        live updates to the rider&apos;s phone.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Drivers report their location", detail: "Every four seconds while online." },
    { kind: "functional", text: "Riders request a ride", detail: "From a pickup point, matched to a nearby free driver." },
    { kind: "functional", text: "Match the nearest available driver", detail: "Never promise one driver to two riders." },
    { kind: "functional", text: "Live updates", detail: "Riders watch the car approach on the map." },
    { kind: "non-functional", text: "Write-heavy", detail: "50,000 location updates a second." },
    { kind: "non-functional", text: "Fast matches", detail: "A driver is found within a few seconds." },
    { kind: "non-functional", text: "City-sized failure domains", detail: "A bad night in Mumbai should not slow Pune." },
    { kind: "non-functional", text: "Fresh, not durable", detail: "A position is useless after seconds; a ride record is forever." },
  ],
  estimates: [
    { label: "Drivers online", value: "200,000", math: "peak, across 40 cities" },
    { label: "Location updates", value: "~50,000/s", math: "200k drivers ÷ one ping every 4 s" },
    { label: "Ride requests", value: "~300/s", math: "peak evening, all cities" },
    { label: "Open rider connections", value: "~150,000", math: "riders watching a car approach" },
  ],
  cacheParam: "city",
  cacheValues: [],
  related: {
    lessons: ["geohashing", "hot-keys", "sharding", "partitioning-strategies", "scaling-websockets", "pub-sub", "queues-and-workers", "distributed-locks"],
    drills: ["ticket-booking", "chat"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design ride dispatch",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first. Two kinds of data live in this system: live positions and ride records.",
        "On the canvas, add components and wire them the way requests travel.",
        "Several traffic types run together: pings, searches, ride requests, trip events and live updates.",
        "Some choices (the geo index, claiming a driver, the shard key) are settings in the design panel the tests will check.",
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
            Three conversations happen: the driver&apos;s phone says where it is, a rider asks for a car, and the rider asks how
            it is going. The first runs 50,000 times a second, so every byte counts.
          </p>
          <p>Design an endpoint for each, then check your work.</p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <p>
          Ride requests answer <strong>202</strong> because matching takes time and might fail, so the contract is &quot;we are
          on it&quot;, not &quot;here is your driver&quot;. Live movement will use a WebSocket later; the plain GET stays as the
          fallback for when the connection drops.
        </p>
      ),
    },
    {
      type: "schema",
      id: "schema",
      title: "Model drivers and rides",
      short: "Data model",
      minutes: 5,
      body: (
        <>
          <p>
            Two lifetimes live here. A <strong>driver&apos;s position</strong> matters for four seconds. A <strong>ride</strong>{" "}
            matters for years (receipts, disputes, tax). They want different storage, but you can describe both in one model.
          </p>
          <p>
            The question to design around is &quot;drivers near this point&quot;. A pair of numbers cannot answer it directly, so
            you need a derived key that turns nearness into a prefix.
          </p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          <code>city_id</code> on both tables is quietly the most important column. It is a free partition: riders only ever need
          drivers in their own city, so it becomes your shard key and your failure boundary.
        </p>
      ),
    },
    design("launch", {
      title: "One city",
      short: "Launch",
      minutes: 3,
      story: "GatepassGo launches in one city with 2,000 drivers pinging every four seconds: 500 writes a second, and a handful of ride requests.",
      palette: P.base,
      knobs: ["size"] as Knob[],
      startGraph: START,
      hints: ["Wire Users → API server → Database.", "Every ping is a write straight to the database.", "One small server fits the budget."],
      concepts: [{ term: "Start simple", text: "Write each ping to the database. It is correct and cheap while it is small.", lesson: "the-design-process" }],
    }),
    {
      type: "read",
      id: "read-memory",
      title: "Data that expires in seconds",
      short: "In-memory index",
      minutes: 3,
      body: (
        <>
          <p>
            Scale the city to 40 cities and 200,000 drivers. Each pings every four seconds: <strong>50,000 writes a second</strong>.
            One database node takes around 8,000.
          </p>
          <p>
            But look at what is being written. A position is replaced four seconds later. Nobody will ever query the position from
            ten minutes ago. Paying for disk, WAL and replication on every ping is paying for durability the data does not need.
          </p>
          <Diagram w={640} h={170} caption="Pings land in memory; the database sees only occasional checkpoints.">
            <Box x={10} y={60} w={100} label="Drivers" icon="phone" />
            <Box x={170} y={60} w={110} label="API" icon="server" />
            <Box x={350} y={20} w={130} label="Redis geo index" sub="50,000 writes/s" icon="cache" tone="accent" />
            <Box x={350} y={100} w={130} label="Postgres" sub="checkpoints" icon="db" />
            <Wire points={[[110, 86], [170, 86]]} tone="req" label="ping" labelAt={[122, 76]} />
            <Wire d="M280 80 C310 80 320 46 350 46" tone="req" />
            <Wire d="M280 92 C310 92 320 126 350 126" dashed />
            <Tag x={510} y={46} tone="ok">all pings</Tag>
            <Tag x={510} y={126} tone="warn">~1 in 10</Tag>
            <Packet d="M110 86 L170 86 L280 86 C310 86 320 46 350 46" dur={1.8} />
          </Diagram>
          <KeyIdea>Match the storage to the data&apos;s lifetime: perishable data belongs in memory.</KeyIdea>
        </>
      ),
    },
    design("updates", {
      title: "200,000 drivers on the road",
      short: "Location updates",
      minutes: 5,
      story: "The app takes off: 200,000 drivers across 40 cities, each pinging every four seconds. That is 50,000 writes a second, ten times what your database was built for.",
      palette: P.fast,
      knobs: K,
      hints: ["Run it and read the database: it cannot take 50,000 writes a second.", "Put Redis between the servers and the database; locations are written there first.", "You also need roughly five medium servers behind a load balancer."],
      concepts: [
        { term: "Write-heavy workload", text: "More writes than reads, so caches that only help reads do little. Absorb writes in memory instead.", lesson: "why-cache" },
        { term: "Ephemeral data", text: "Data that is replaced faster than it is read. It needs speed, not durability.", lesson: "write-strategies" },
      ],
    }),
    {
      type: "read",
      id: "read-geo",
      title: "How do you search a map?",
      short: "Geohash",
      minutes: 4,
      body: (
        <>
          <p>
            A rider taps at (19.0760, 72.8777). Which of 200,000 drivers is closest? Computing 200,000 distances per request is
            300 million a second at peak. You need to find candidates without looking at all of them.
          </p>
          <p>
            A <strong>geohash</strong> chops the world into a grid and names each cell with a string. Cells are nested: the longer
            the string, the smaller the cell. Two points in the same cell share a prefix, so &quot;near&quot; becomes &quot;same
            prefix&quot;, which an index handles easily.
          </p>
          <Diagram w={640} h={200} caption="The rider's cell and its eight neighbours: search nine cells, then sort by real distance.">
            {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <Box key={`${r}${c}`} x={190 + c * 90} y={10 + r * 56} w={86} h={52} label={r === 1 && c === 1 ? "te7ut" : ""} tone={r === 1 && c === 1 ? "accent" : "muted"} />))}
            <Text x={20} y={100} size={12} tone="muted">
              rider near the edge
            </Text>
            <Tag x={480} y={90} tone="warn">driver across the border</Tag>
          </Diagram>
          <p>
            Two traps. <strong>Borders</strong>: a driver 20 metres away can sit in the next cell with a different prefix, so
            always search the neighbours. <strong>Density</strong>: a fixed grid is useless when downtown has 5,000 cars per cell
            and the suburbs have none. Geohashes of different lengths let you pick a smaller cell where it is crowded.
          </p>
          <Callout tone="tip" title="What about a quadtree?">
            A quadtree splits crowded cells adaptively, which is great for points that stay put. When every point moves every four
            seconds, the tree keeps rebalancing. A plain prefix on a hash key does not care that things move.
          </Callout>
        </>
      ),
    },
    design("geo", {
      title: "Who is nearby?",
      short: "Geo index",
      minutes: 5,
      story: "Riders now search 1,500 times a second for the nearest free drivers. Your index has to answer without looking at every car in the country.",
      palette: P.fast,
      knobs: K,
      hints: ["Open the design panel and look at 'Finding nearby drivers'.", "A fixed grid and one geohash cell each have a flaw. Think about borders and density.", "Search the rider's geohash cell plus its eight neighbours."],
      concepts: [
        { term: "Geohash", text: "A string naming a map cell; nearby places share a prefix.", lesson: "geohashing" },
        { term: "Neighbour cells", text: "Cell borders are arbitrary, so search the eight cells around the target.", lesson: "geohashing" },
      ],
    }),
    design("matching", {
      title: "Two riders, one driver",
      short: "Matching service",
      minutes: 5,
      story: "At 6 p.m. two riders on the same corner both request a ride. Their requests are processed by different workers, and both pick the same driver as nearest.",
      palette: P.jobs,
      knobs: K,
      hints: ["Run matching as a service: servers → Queue → Workers, which read and update the geo index and database.", "Two workers can both pick the same nearest driver. How do you let only one win?", "Set 'Claiming a driver' to an atomic claim."],
      concepts: [
        { term: "Atomic claim", text: "Check-and-set in one step (SET NX, conditional UPDATE) so exactly one caller wins.", lesson: "distributed-locks" },
        { term: "Matching as a service", text: "A separate stage that decides assignments, scaled and tuned on its own.", lesson: "queues-and-workers" },
      ],
    }),
    {
      type: "read",
      id: "read-city",
      title: "Shard by city, then what?",
      short: "Sharding by city",
      minutes: 3,
      body: (
        <>
          <p>
            Ride records outgrow one database. You will shard them, but by what? Riders only ever want drivers in their own city,
            so <code>city_id</code> looks perfect: a search touches exactly one shard, and an outage in one city stays there.
          </p>
          <p>
            Then you check the numbers. Mumbai is <strong>60%</strong> of the traffic. Sharding by city puts all of Mumbai on one
            machine, and adding shards for Delhi, Pune and Chennai does nothing for it.
          </p>
          <p>
            That is <strong>skew</strong>: a key whose values are not equally popular. The fix keeps the locality and splits the
            big values. Shard by city, then by geohash prefix inside the hot city, so Mumbai becomes several shards and each
            neighbourhood stays together.
          </p>
          <Callout tone="key" title="Locality vs balance">
            Hashing by driver id balances perfectly but destroys locality: a nearby search has to ask every shard. A good shard key
            keeps what is queried together on the same machine, and splits only what is too big for one.
          </Callout>
        </>
      ),
    },
    design("cities", {
      title: "Rain in Mumbai",
      short: "Shard by city",
      minutes: 5,
      story: "It starts raining in Mumbai at 9 p.m. Trip activity triples. Mumbai is 60% of rides, and your trip database is sharded by city.",
      palette: P.jobs,
      knobs: K,
      hints: ["Run it and read the database shards: one is red and the rest are idle.", "More shards do not help when one key is hot.", "Set 'Shard by' to city, then geohash prefix, and use a few shards."],
      concepts: [
        { term: "Data skew", text: "One shard key value is much busier than the others.", lesson: "partitioning-strategies" },
        { term: "Hot shard", text: "A shard whose load limits the whole system, however many others sit idle.", lesson: "hot-keys" },
      ],
    }),
    {
      type: "read",
      id: "read-ws",
      title: "Pushing the car's position",
      short: "Live updates",
      minutes: 3,
      body: (
        <>
          <p>
            The rider wants to watch the car creep towards her. Polling means 150,000 phones calling every few seconds to hear
            &quot;nothing new&quot;. A <strong>WebSocket</strong> is a connection that stays open, so the server can push each
            position the moment it arrives.
          </p>
          <p>
            It changes the shape of the system. Each rider is attached to exactly one gateway (50,000 connections is a lot for
            one machine), and the driver&apos;s ping lands on a different server entirely. A <strong>pub/sub</strong> broker
            carries the position from wherever it arrived to whichever gateway holds the rider.
          </p>
          <Diagram w={640} h={170} caption="The position travels over pub/sub to the gateway holding the rider.">
            <Box x={10} y={60} w={100} label="Driver" icon="phone" />
            <Box x={160} y={60} w={100} label="API" icon="server" />
            <Box x={310} y={60} w={100} label="Pub/sub" icon="stream" tone="accent" />
            <Box x={460} y={20} w={100} label="Gateway 1" icon="server" />
            <Box x={460} y={100} w={100} label="Gateway 2" icon="server" />
            <Wire points={[[110, 86], [160, 86]]} tone="req" />
            <Wire points={[[260, 86], [310, 86]]} tone="req" />
            <Wire d="M410 80 C440 80 440 46 460 46" tone="res" />
            <Wire d="M410 92 C440 92 440 126 460 126" tone="res" />
            <Packet points={[[110, 86], [160, 86], [260, 86], [310, 86], [410, 86]]} dur={2} />
          </Diagram>
        </>
      ),
    },
    design("tracking", {
      title: "Watch the car arrive",
      short: "WebSocket updates",
      minutes: 5,
      story: "A hundred and fifty thousand riders are watching their car approach on a map. Each driver ping must reach the right rider's phone within a second.",
      palette: P.live,
      knobs: K,
      hints: ["Put WebSocket gateways between users and the system. One gateway holds 50,000 connections.", "With more than one gateway, a message must reach the gateway holding the rider: add a pub/sub broker and wire every gateway to it.", "You need at least three gateways for 150,000 connections; four leaves headroom."],
      concepts: [
        { term: "WebSocket", text: "A long-lived two-way connection, so the server can push without being asked.", lesson: "sse-and-websockets" },
        { term: "Pub/sub fan-out", text: "A broker that hands a message to whichever machines hold interested connections.", lesson: "scaling-websockets" },
      ],
    }),
    {
      type: "choose",
      id: "choose-matching",
      title: "How should you pick a driver?",
      short: "Matching deep dive",
      minutes: 4,
      prompt: "Two riders and two drivers: nearest-first can give both riders a worse trip than a smarter pairing. Which strategy would you ship?",
      body: <p>Matching is a product decision as much as a technical one. Each approach trades speed, fairness and total pickup time.</p>,
      options: [
        {
          id: "greedy",
          title: "Nearest driver, immediately",
          summary: "Each request takes the closest free driver at that moment.",
          pros: ["Instant and simple", "Easy to reason about", "Scales with the queue"],
          cons: ["Locally greedy: a worse total for the city", "Drivers who just missed a match feel unlucky"],
          when: "Launch and low-density areas. The default for most early systems.",
        },
        {
          id: "batch",
          title: "Batch every few seconds",
          summary: "Collect requests for 2 seconds, then solve the assignment for all of them together.",
          pros: ["Lower total pickup time", "Fairer across riders and drivers", "Handles ties deliberately"],
          cons: ["Everyone waits for the window", "A more complex solver", "Needs tuning per city density"],
          when: "Dense cities where many requests overlap and total wait time matters.",
        },
        {
          id: "offers",
          title: "Offer to several drivers",
          summary: "Send the ride to the three nearest drivers; the first to accept gets it.",
          pros: ["Tolerates drivers who ignore the offer", "Fast acceptance"],
          cons: ["Drivers see offers that vanish", "Needs an atomic first-wins claim", "More messages"],
          when: "Markets where drivers often decline or miss notifications.",
        },
        {
          id: "zones",
          title: "Zones and surge pricing",
          summary: "Steer supply and demand with prices per area instead of better matching.",
          pros: ["Fixes imbalance, not just assignment", "Moves drivers towards demand"],
          cons: ["Politically sensitive", "Needs real-time supply and demand per cell"],
          when: "Alongside any matcher, once a hot area keeps running out of cars.",
        },
      ],
      after: (
        <p>
          Most systems start greedy, move to batching in dense cities, and layer pricing on top. Whatever you pick, the atomic
          claim from earlier stays: it protects the invariant, while the strategy only decides who to try first.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed ride dispatch",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You kept <strong>perishable positions in memory</strong>, searched them with a <strong>geohash and its
          neighbours</strong>, matched drivers with an <strong>atomic claim</strong>, sharded by <strong>city and area</strong> so
          a hot city does not become a hot machine, and pushed movement to riders over <strong>WebSockets with pub/sub</strong>.
          The theme is fitting the storage to the data: fast and disposable for what is stale in seconds, durable for what
          matters for years.
        </p>
      ),
    },
  ],
};
