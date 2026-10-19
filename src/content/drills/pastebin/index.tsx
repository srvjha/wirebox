import { Box, Diagram, Packet, Text, Wire } from "@/components/diagram/kit";
import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Drill, DrillGraph } from "@/lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: DrillGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };

const K = {
  launch: ["size"] as Knob[],
  viral: ["size", "hitRate"] as Knob[],
  expiry: ["size", "hitRate"] as Knob[],
  abuse: ["size", "hitRate"] as Knob[],
  server: ["size", "hitRate", "healthChecks"] as Knob[],
};

const P = {
  launch: ["client", "server", "db", "storage"] as DesignStep["palette"],
  viral: ["client", "cdn", "lb", "server", "cache", "db", "storage"] as DesignStep["palette"],
  expiry: ["client", "cdn", "lb", "server", "cache", "db", "storage", "queue", "worker"] as DesignStep["palette"],
  all: ["client", "cdn", "limiter", "lb", "server", "cache", "db", "storage", "queue", "worker"] as DesignStep["palette"],
};

const design = (id: keyof typeof DESIGN, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief">): DesignStep => ({
  type: "design",
  id,
  ...DESIGN[id],
  debrief: DEBRIEFS[id],
  ...step,
});

export const pastebin: Drill = {
  slug: "pastebin",
  version: 1,
  title: "Design a pastebin",
  product: "Pastebin",
  intro: (
    <>
      <p>
        Gatepass volunteers keep pasting things into group chats: seating charts, sound-check logs, a stack trace at 1 a.m. before
        doors open. So the team builds <strong>gp.paste</strong>: drop in some text, get a link, and the text disappears on its own
        after a day, a week, or never.
      </p>
      <p>
        It sounds like a table with a text column. It isn&apos;t. Text is bulky and the database is the wrong place for it. A
        link on a big site can bring more traffic in a minute than the rest of the week, and every paste must also be{" "}
        <strong>deleted on time</strong>, by a job that doesn&apos;t knock over the reads. And a free place to put text gets found
        by spammers within days.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Create a paste", detail: "Text up to 512 KB, optional expiry, and a short unguessable link." },
    { kind: "functional", text: "Read a paste", detail: "Anyone with the link sees the text." },
    { kind: "functional", text: "Expire and delete", detail: "A paste vanishes when its time is up, or when its owner deletes it." },
    { kind: "non-functional", text: "Fast reads", detail: "p99 under 250 ms, even when one paste goes viral." },
    { kind: "non-functional", text: "Durable", detail: "Pastes aren't lost before they expire." },
    { kind: "non-functional", text: "Cheap per gigabyte", detail: "Tens of terabytes a year: where the bytes live matters." },
    { kind: "non-functional", text: "Abuse-resistant", detail: "Bots can't fill the disks or starve real users." },
  ],
  estimates: [
    { label: "New pastes", value: "~60/s", math: "5M ÷ 86,400 s ≈ 58/s" },
    { label: "Reads, average", value: "~600/s", math: "10 reads per paste ≈ 580/s" },
    { label: "Reads, viral peak", value: "~45,000/s", math: "one link on a front page, ~75× average" },
    { label: "Storage, per year", value: "~18 TB", math: "5M × 10 KB × 365 ≈ 18 TB of text" },
  ],
  cacheParam: "id",
  cacheValues: [],
  related: {
    lessons: ["api-design", "object-storage", "cdn-and-browser-cache", "queues-and-workers", "why-rate-limit", "what-to-limit-by", "health-checks"],
    drills: ["url-shortener", "notifications", "video-platform"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design a pastebin",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first. Everything later builds on them.",
        "On the canvas, add components and wire them the way requests travel: from users toward the data.",
        "Run a load test. The simulator models each machine's capacity, queues, latency and monthly cost.",
        "Some choices (how pastes expire, what the limiter counts) are settings on a component. Click it to find them.",
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
            Three things happen to a paste in its life: it&apos;s made, read and removed. Design one endpoint for each: the
            method, the path (use <code>:name</code> for a value in the path), the JSON fields in, and the status and fields out.
          </p>
          <p>Think about who else reads your API. A CDN, a browser and a link previewer all treat different methods differently.</p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <>
          <p className="mb-2 text-[16px] font-semibold text-fg">Why the read is a plain GET</p>
          <p>
            CDNs and browsers only cache <strong>GET</strong> requests, and a paste never changes after creation. That makes
            reads the most cacheable thing you&apos;ll ever design: one shared copy at the edge can serve thousands of people. If
            you&apos;d let pastes be edited, you&apos;d have to give every version its own id, or the cache would show stale
            text.
          </p>
        </>
      ),
    },
    {
      type: "schema",
      id: "schema",
      title: "Model the data",
      short: "Data model",
      minutes: 4,
      body: (
        <>
          <p>
            A paste is two different kinds of data. <strong>Metadata</strong> (id, owner, expiry, size) is tiny, structured and
            queried. The <strong>text</strong> is bulky, written once and fetched whole. Databases are good at the first and
            wasteful at the second.
          </p>
          <p>
            Pick an engine for the metadata, then shape the table. A good schema holds a pointer to the text, not the text
            itself.
          </p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          That pointer column is the whole trick: a row stays about 100 bytes, so a billion pastes of metadata fit on one
          machine&apos;s memory and disk, while the 18 TB a year of text sits in object storage at a few dollars per terabyte
          per month. Some engines can expire rows by themselves; none of them can delete the text it points to.
        </p>
      ),
    },
    design("launch", {
      title: "Launch week",
      short: "Launch",
      minutes: 4,
      story:
        "gp.paste opens to the public. About 60 new pastes and 600 reads a second: modest. But the text has to live somewhere sensible from day one, and the founders are watching the bill.",
      palette: P.launch,
      knobs: K.launch,
      startGraph: START,
      hints: [
        "Every request needs code to run it, somewhere to keep the metadata, and somewhere to keep the text. That's three components.",
        "Wire Users → API server, then the server to both the database and Storage. The server writes the row and the blob.",
        "One small server, one database, one object store. Anything more is waste at this size.",
      ],
      concepts: [
        { term: "Object storage", text: "A flat bucket of named blobs (S3, GCS). Cheap, durable and effectively unlimited, but slower than a database for each fetch.", lesson: "object-storage" },
        { term: "Metadata vs blob", text: "Keep the small, queried facts in a database and the large, opaque bytes in object storage, with a key to join them.", lesson: "data-modeling" },
      ],
    }),
    {
      type: "read",
      id: "read-cdn",
      title: "One paste, a million readers",
      short: "CDN",
      minutes: 3,
      body: (
        <>
          <p>
            A paste is read far more than written, and the reads aren&apos;t evenly spread: a few pastes get nearly all of
            them. The moment one lands on a front page, every reader asks for the <strong>same bytes</strong>.
          </p>
          <p>
            A <strong>CDN</strong> keeps copies of popular responses on servers near your users. The first request for a paste
            travels to your origin; the next million are answered at the edge in a few milliseconds and never reach you.
          </p>
          <Diagram w={640} h={200} caption="Only the first request for each paste travels all the way to the origin.">
            <Box x={10} y={74} w={100} label="Readers" icon="client" />
            <Box x={170} y={74} w={120} label="CDN" sub="edge copy" icon="cdn" tone="accent" />
            <Box x={350} y={74} w={110} label="API server" icon="server" />
            <Box x={520} y={20} w={110} label="Database" icon="db" />
            <Box x={520} y={128} w={110} label="Storage" icon="storage" />
            <Wire points={[[110, 100], [170, 100]]} tone="req" />
            <Wire points={[[290, 100], [350, 100]]} tone="req" dashed label="miss" />
            <Wire d="M460 100 C490 100 490 46 520 46" />
            <Wire d="M460 100 C490 100 490 154 520 154" />
            <Packet points={[[110, 100], [170, 100]]} dur={0.8} />
            <Packet points={[[110, 100], [170, 100]]} dur={0.8} delay={0.3} />
            <Packet points={[[110, 100], [170, 100], [290, 100], [350, 100]]} dur={2.8} delay={1} />
            <Text x={230} y={160} size={11} anchor="middle" tone="muted">
              most requests stop here
            </Text>
          </Diagram>
          <Callout tone="warn" title="The catch: a cache can't unsay what it said">
            If the CDN holds a paste for a year and the owner deletes it tomorrow, it keeps serving it. Anything that expires
            or can be deleted needs a cache lifetime that matches, or a way to purge it.
          </Callout>
          <KeyIdea>Cache what never changes at the edge; give every cached thing a shorter life than its owner&apos;s patience.</KeyIdea>
        </>
      ),
    },
    design("viral", {
      title: "The front page",
      short: "Viral paste",
      minutes: 6,
      story:
        "A paste containing a leaked game-day schedule lands on the front page of a tech site. For hours, 45,000 people a second ask for it. One database can do about 35,000 reads a second, and your object store about 50,000.",
      palette: P.viral,
      knobs: K.viral,
      hints: [
        "Run the test first and see which node turns red. Then ask: do these 45,000 requests need 45,000 different answers?",
        "Put a CDN between Users and your servers. Hot pastes will be answered at the edge.",
        "Users → CDN → load balancer → two medium servers → database and storage. A Redis cache helps the database but not the object store, which is also near its limit.",
      ],
      concepts: [
        { term: "CDN", text: "A cache spread across the world. Cheap to scale, great for content that doesn't change.", lesson: "cdn-and-browser-cache" },
        { term: "Hit rate", text: "The share of requests answered from the cache. At 95% the origin sees one in twenty.", lesson: "why-cache" },
        { term: "Origin", text: "Your own servers, behind the CDN. Everything the CDN can't answer lands here.", lesson: "cdn-and-browser-cache" },
      ],
    }),
    {
      type: "read",
      id: "read-expiry",
      title: "Deleting on time",
      short: "Expiry",
      minutes: 3,
      body: (
        <>
          <p>
            Every paste carries an <code>expires_at</code>. Some time later, something must actually remove the row{" "}
            <em>and</em> the text in object storage. There are three common ways to do it, and two of them go wrong.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Check on read.</strong> Return 404 if the time has passed. Simple, but nothing ever frees the bytes, so
              you keep paying for dead pastes forever.
            </li>
            <li>
              <strong>Scan the table nightly.</strong> <code>DELETE WHERE expires_at &lt; now()</code> without an index reads
              every row to find a few. Over a billion rows it can run for hours and slow every read behind it.
            </li>
            <li>
              <strong>Index and batch.</strong> An index on <code>expires_at</code> finds exactly the expired rows. Put each
              delete on a <strong>queue</strong> and let workers remove the row and the blob in small batches.
            </li>
          </ul>
          <p>
            Deleting is a background job: nobody is waiting for it, so it can go at its own pace, retry on failure and scale
            by adding workers without touching the read path.
          </p>
          <KeyIdea>Expiry is two jobs: hide the paste immediately, free its storage eventually.</KeyIdea>
        </>
      ),
    },
    design("expiry", {
      title: "Pastes expire",
      short: "Expiry",
      minutes: 6,
      story:
        "A million pastes a day reach the end of their life. The sweep fires hundreds of deletes a second (row and blob each) and they must finish within a couple of minutes without slowing readers. Click the CDN and the settings to decide how things expire.",
      palette: P.expiry,
      knobs: K.expiry,
      hints: [
        "Deletes aren't urgent for any single paste, but there are many. What component accepts work instantly and hands it out gradually?",
        "Server → Queue → Workers, and wire the workers to the database and Storage so they can delete both.",
        "Each delete takes ~100 ms of a worker, so one worker does 80 a second. For 400 a second you need about six, with a little room.",
        "Two settings decide correctness: the CDN's cache lifetime and how the cleanup finds expired rows. One of each option is a trap.",
      ],
      concepts: [
        { term: "Queue + workers", text: "The queue accepts work at any speed; workers take it at theirs. Add workers to drain faster.", lesson: "queues-and-workers" },
        { term: "TTL", text: "Time to live: how long something may exist. Applies to rows, cache entries and CDN copies, and they must agree.", lesson: "cache-invalidation" },
        { term: "Index on a timestamp", text: "Lets the database jump to the oldest rows instead of reading all of them.", lesson: "indexes" },
      ],
    }),
    design("abuse", {
      title: "A spam bot arrives",
      short: "Abuse",
      minutes: 6,
      story:
        "A bot discovers that gp.paste accepts text without an account. It posts 20,000 pastes a second, many of them enormous. Real users keep reading and posting. The database can only take about 8,000 writes a second.",
      palette: P.all,
      knobs: K.abuse,
      hints: [
        "Writes can't be cached, so they all reach the database. The fix is to stop most of the bot's requests before they get there.",
        "Add a rate limiter. Send writes through it: Users → Limiter → Load balancer. Reads can keep going through the CDN.",
        "Click the limiter and choose what it counts per. And look for a second setting: what stops one request from carrying a 2 GB paste?",
      ],
      concepts: [
        { term: "Rate limiting", text: "Cap how many requests a client may make in a window. Bots hit the cap; people don't.", lesson: "why-rate-limit" },
        { term: "Limit key", text: "What you count against: IP, account, API key. The wrong choice blocks real users or lets bots through.", lesson: "what-to-limit-by" },
        { term: "Payload limits", text: "A rate limit bounds how often; a size limit bounds how much. You need both.", lesson: "api-design" },
      ],
    }),
    design("server", {
      title: "A server dies",
      short: "Failure",
      minutes: 5,
      story:
        "Five seconds into the afternoon peak, one of your API servers stops answering: disk failure. Traffic keeps arriving. Reads are mostly covered by the CDN, but cache misses and every write still need an origin.",
      palette: P.all,
      knobs: K.server,
      hints: [
        "Run the test and watch what happens when one server disappears. Is there another one to take the load?",
        "You need spare capacity (one more server than the load requires) and a way for the load balancer to notice a dead one.",
        "Add a third server and turn on health checks on the load balancer.",
      ],
      concepts: [
        { term: "Health checks", text: "The balancer pings each server and stops sending traffic to ones that don't answer.", lesson: "health-checks" },
        { term: "N+1", text: "Run one more server than the load needs, so losing one is a non-event.", lesson: "failover" },
      ],
    }),
    {
      type: "choose",
      id: "ids",
      title: "How do you name a paste?",
      short: "Paste ids",
      minutes: 3,
      body: (
        <p>
          The id is in every link. It must be <strong>unique</strong>, short enough to type, and hard to guess, since anyone who
          can guess <code>gp.paste/48213</code> can read other people&apos;s “private” pastes. And it&apos;s generated on every
          write, across many servers at once.
        </p>
      ),
      prompt: "Which would you build?",
      options: [
        {
          id: "random",
          title: "Random 10 characters",
          summary: "Pick 10 random characters from a–z, A–Z, 0–9. If the unique constraint rejects it, roll again.",
          pros: ["Unguessable: 839 quadrillion possibilities", "No coordination between servers", "Your unique id column does the hard part"],
          cons: ["A retry on the rare collision", "Not sortable by time"],
          when: "The default for public pastes. Collisions stay vanishingly rare, and links can't be enumerated.",
        },
        {
          id: "counter",
          title: "Counter + base62",
          summary: "Take the next number from a shared counter and write it in base 62.",
          pros: ["Never collides", "Shortest possible links"],
          cons: ["Guessable: increment the id to read someone else's paste", "A shared counter every server must reach"],
          when: "Only when every paste is public and ids can be walked. Not for “unlisted” links.",
        },
        {
          id: "hash",
          title: "Hash of the text",
          summary: "SHA-256 the content and keep a prefix, so identical text gets the same id.",
          pros: ["Free deduplication: a million copies of the same log file are stored once", "Stateless"],
          cons: [
            "Someone who already has the text can check whether it was pasted here",
            "Two people pasting the same text share one expiry and one delete button",
          ],
          when: "When storage is the main cost and pastes are public. Mix in a per-user salt if either problem matters.",
        },
      ],
      after: (
        <p>
          Same pattern as every choice in this drill: there&apos;s no free option, only a place to put the cost. Note how the
          unique id in your schema made the random option safe: the database enforces what the code only hopes.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed a pastebin",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You split a paste into <strong>metadata and a blob</strong>, put a <strong>CDN</strong> in front of the hottest reads,
          deleted on time with a <strong>queue and workers</strong>, bounded abuse with a <strong>rate limit and a size cap</strong>,
          and survived a dead server with <strong>spare capacity and health checks</strong>. Each of those was a failing test
          first. When you design a product that stores user content, those are the first four questions to ask: where do the bytes
          live, who reads them, when do they die, and who might fill them.
        </p>
      ),
    },
  ],
};
