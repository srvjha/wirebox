import { Box, Diagram, Packet, Tag, Text, Wire } from "@/components/diagram/kit";
import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Drill, DrillGraph } from "@/lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";
import { CACHE_VALUES } from "./values";

const START: DrillGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };

const K = {
  launch: [] as Knob[],
  vertical: ["size"] as Knob[],
  cache: ["size", "cache"] as Knob[],
  scraper: ["size", "cache", "limiter"] as Knob[],
  stampede: ["size", "cache", "limiter", "coalesce"] as Knob[],
  server: ["size", "cache", "limiter", "coalesce", "healthChecks"] as Knob[],
  primary: ["size", "cache", "limiter", "coalesce", "healthChecks", "replica", "failover"] as Knob[],
  freshness: ["size", "cache", "limiter", "coalesce", "healthChecks", "replica", "failover", "readFrom", "writeThrough"] as Knob[],
};

const P = {
  base: ["client", "server", "db"] as DesignStep["palette"],
  lb: ["client", "lb", "server", "db"] as DesignStep["palette"],
  cache: ["client", "lb", "server", "cache", "db"] as DesignStep["palette"],
  all: ["client", "limiter", "lb", "server", "cache", "db"] as DesignStep["palette"],
};

const design = (id: keyof typeof DESIGN, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief">): DesignStep => ({
  type: "design",
  id,
  ...DESIGN[id],
  debrief: DEBRIEFS[id],
  ...step,
});

export const urlShortener: Drill = {
  slug: "url-shortener",
  version: 1,
  title: "Design a URL shortener",
  product: "URL shortener",
  intro: (
    <>
      <p>
        Gatepass started printing short links on event posters: <strong>gp.st/x7Kp2Qa</strong> instead of a 120-character URL
        nobody could type. Promoters loved it, other companies asked to use it, and now <strong>gp.st</strong> is a product of its
        own.
      </p>
      <p>
        A URL shortener looks like a weekend project: save a URL, hand back a code, redirect. The design gets interesting at scale.
        Reads outnumber writes a hundred to one, one viral link can bring more traffic than everything else combined, and a broken
        redirect is a broken poster on a thousand walls. You&apos;ll take it from one server to a design that survives scrapers,
        restarts and dead machines.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Shorten a long URL", detail: "Paste a URL, get back gp.st/ and a 7-character code." },
    { kind: "functional", text: "Redirect a short link", detail: "Opening the short link lands you on the original URL." },
    { kind: "functional", text: "Count clicks", detail: "Whoever made the link can see how many times it was opened." },
    { kind: "non-functional", text: "Fast", detail: "p99 under 100 ms. A slow redirect feels like a broken link." },
    { kind: "non-functional", text: "Available", detail: "99.9% of requests succeed, even while a machine is failing." },
    { kind: "non-functional", text: "Big", detail: "100M new links and 10B redirects a month, with viral spikes." },
    { kind: "non-functional", text: "Durable and unique", detail: "A code points at one URL, forever. Links never collide or vanish." },
    { kind: "non-functional", text: "Affordable", detail: "Every box has a monthly bill; each step sets a budget." },
  ],
  estimates: [
    { label: "New links", value: "~40/s", math: "100M ÷ (30 × 86,400 s) ≈ 39/s" },
    { label: "Redirects, average", value: "~3,900/s", math: "10B ÷ 2.6M s ≈ 3,860/s, 100× the writes" },
    { label: "Redirects, viral peak", value: "~60,000/s", math: "one hot link spikes 15× the average" },
    { label: "Storage, 10 years", value: "~6 TB", math: "100M × 12 × 10 links × ~500 bytes" },
  ],
  cacheParam: "slug",
  cacheValues: CACHE_VALUES,
  related: {
    lessons: ["api-design", "data-modeling", "vertical-vs-horizontal", "cache-aside", "thundering-herd", "what-to-limit-by", "failover", "replication-lag"],
    drills: ["pastebin", "notifications", "ticket-booking"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design a URL shortener",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first. Everything later builds on them.",
        "On the canvas, add components and wire them the way requests travel: from users toward the data.",
        "Run a load test. The simulator models each machine's capacity, queues, latency and monthly cost.",
        "Each test adds traffic or breaks something. Meet every constraint to unlock the next step.",
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
            Before any boxes and arrows, decide what the outside world can ask for. An API is a contract: once posters are printed
            with your links, you can&apos;t change what <code>gp.st/x7Kp2Qa</code> means.
          </p>
          <p>
            Design one endpoint for each requirement below: the method, the path (use <code>:name</code> for a value in the
            path), the JSON fields in, and the status, headers and fields out. Then check your work.
          </p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <>
          <p className="mb-2 text-[16px] font-semibold text-fg">301 or 302? It matters more than it looks.</p>
          <p>
            A <strong>301 Moved Permanently</strong> (or 308) tells the browser the move is forever, so it remembers and skips
            you next time. That&apos;s fewer requests for you, but every repeat click is <strong>invisible</strong>: your click
            counts undercount, and if a link is ever reported as spam you can&apos;t repoint it for anyone who has already
            visited.
          </p>
          <p className="mt-2">
            A <strong>302 Found</strong> (or 307) is temporary, so every click comes back through you and gets counted. Most
            shorteners that sell analytics use 302. Whatever you picked carries into the load tests: choose 301 and the simulator
            lets browsers answer repeat clicks themselves.
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
            Your API says what can be asked; the schema decides whether the database can answer quickly. Start from the queries:
            every redirect looks up <strong>one link by its slug</strong>, about 4,000 times a second on average. Creating a link
            writes one row. Stats read one link&apos;s count.
          </p>
          <p>Pick an engine, then shape the tables. The checks trace each column back to an endpoint you just designed.</p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          Notice what the unique slug buys you: the database itself refuses a duplicate, so no bug in your code can ever point
          one short link at two URLs. In this drill every engine gets the same per-machine numbers, so your pick won&apos;t change
          the load tests, but it will show up on the canvas.
        </p>
      ),
    },
    design("launch", {
      title: "Launch week",
      short: "Launch",
      minutes: 3,
      story:
        "gp.st opens to the public. A few hundred redirects a second and a handful of new links: modest, but it has to work, it has to be fast, and the founders are watching every dollar.",
      palette: P.base,
      knobs: K.launch,
      startGraph: START,
      hints: [
        "Every request needs code to run it and somewhere to keep the links. Which two components do that?",
        "Wire Users → API server → Database. Drag from the right-hand dot of one node onto another.",
        "One small server and one database is enough here. Anything more is over budget or just waste.",
      ],
      concepts: [
        { term: "Utilisation", text: "Share of a machine's capacity in use. Past about 85%, requests start queueing and latency climbs fast.", lesson: "latency-numbers" },
        { term: "p99 latency", text: "99 out of 100 requests are faster than this. Averages hide the slow ones; p99 doesn't.", lesson: "slos-and-nines" },
        { term: "Client, server, database", text: "The browser asks, the server runs your code, the database remembers.", lesson: "client-server" },
      ],
    }),
    design("vertical", {
      title: "A link goes viral",
      short: "Scale up",
      minutes: 3,
      story:
        "A stand-up comic posts a gp.st link to a surprise show, and it spreads. Traffic jumps to about 12,000 requests a second. You have one server and the rule for this step is to keep it that way: make the one you have stronger.",
      palette: P.base,
      knobs: K.vertical,
      hints: [
        "Run the test first and look at which node turns red.",
        "Click the API server to open its inspector, then pick a bigger machine.",
        "A small server handles 8k req/s. You need room for about 12k with headroom, inside a $500 budget.",
      ],
      concepts: [
        { term: "Vertical scaling", text: "Move to a bigger machine. No code changes, but each step up buys less, and there's a biggest machine.", lesson: "vertical-vs-horizontal" },
        { term: "Headroom", text: "Spare capacity for bursts. A machine at 95% has none; one blip and requests time out.", lesson: "estimation" },
      ],
    }),
    {
      type: "read",
      id: "read-scale-out",
      title: "Bigger box, or more boxes?",
      short: "Scaling out",
      minutes: 3,
      body: (
        <>
          <p>
            A bigger machine is the easiest fix, until it isn&apos;t. Each size up costs twice as much but adds less capacity,
            because more cores fight over the same locks, memory and network card. And there&apos;s a ceiling: the biggest box
            you can rent.
          </p>
          <p>
            <strong>Horizontal scaling</strong> means running several ordinary servers side by side. Users still need one
            address to send requests to, so you put a <strong>load balancer</strong> in front. It accepts every request and
            passes each one to a server, round-robin or to whichever is least busy.
          </p>
          <Diagram w={640} h={250} caption="One address outside, many servers inside.">
            <Box x={10} y={99} w={110} label="Users" icon="client" />
            <Box x={180} y={99} w={140} label="Load balancer" icon="lb" tone="accent" />
            <Box x={380} y={20} w={120} label="Server 1" icon="server" />
            <Box x={380} y={99} w={120} label="Server 2" icon="server" />
            <Box x={380} y={178} w={120} label="Server 3" icon="server" />
            <Box x={540} y={99} w={92} label="DB" icon="db" />
            <Wire points={[[120, 125], [180, 125]]} tone="req" />
            <Wire d="M320 125 C350 125 350 46 380 46" tone="req" />
            <Wire points={[[320, 125], [380, 125]]} tone="req" />
            <Wire d="M320 125 C350 125 350 204 380 204" tone="req" />
            <Wire d="M500 46 C520 46 520 125 540 125" />
            <Wire points={[[500, 125], [540, 125]]} />
            <Wire d="M500 204 C520 204 520 125 540 125" />
            <Packet d="M120 125 L180 125 L320 125 C350 125 350 46 380 46" dur={2.4} />
            <Packet d="M120 125 L180 125 L320 125 L380 125" dur={2.4} delay={0.8} />
            <Packet d="M120 125 L180 125 L320 125 C350 125 350 204 380 204" dur={2.4} delay={1.6} />
          </Diagram>
          <p>
            This only works if servers are <strong>stateless</strong>: any server can answer any request because nothing
            important lives in one server&apos;s memory. Your links live in the database, so a redirect works the same on every
            server.
          </p>
          <KeyIdea>Scale up until it gets expensive, then scale out behind a load balancer.</KeyIdea>
        </>
      ),
    },
    design("horizontal", {
      title: "Prime time",
      short: "Scale out",
      minutes: 4,
      story:
        "Gatepass sends its weekly newsletter with a gp.st link per event, and every evening traffic climbs to 25,000 requests a second. A big enough single server would cost more than the whole $700 budget.",
      palette: P.lb,
      knobs: K.vertical,
      hints: [
        "Try the biggest single server that fits the budget first, and read why it fails.",
        "Add a load balancer between Users and your servers, then add a second server.",
        "Two medium servers behind a load balancer: each handles 15k req/s and runs well below 85%.",
      ],
      concepts: [
        { term: "Load balancer", text: "One address for clients, many servers behind it. It also lets you add or remove servers without anyone noticing.", lesson: "load-balancers" },
        { term: "Stateless servers", text: "No request depends on which server answers it, so you can add servers freely.", lesson: "stateless-servers" },
        { term: "Horizontal scaling", text: "More ordinary machines instead of one huge one. Cheaper per request, no ceiling.", lesson: "vertical-vs-horizontal" },
      ],
    }),
    {
      type: "read",
      id: "read-cache",
      title: "Caching the hot links",
      short: "Caching",
      minutes: 3,
      body: (
        <>
          <p>
            Clicks aren&apos;t spread evenly. On a normal day, a couple of hundred links (tonight&apos;s gigs, a viral post) get
            around 80% of all redirects. Asking the database the same question thousands of times a second is wasted work.
          </p>
          <p>
            A <strong>cache</strong> keeps recent answers in memory. With <strong>cache-aside</strong>, the server checks Redis
            first. On a <strong>hit</strong> it answers straight away. On a <strong>miss</strong> it asks the database, then
            stores the answer in Redis for next time.
          </p>
          <Diagram w={640} h={210} caption="Cache-aside: Redis first, the database only on a miss.">
            <Box x={10} y={80} w={120} label="Server" icon="server" />
            <Box x={300} y={14} w={150} label="Redis" sub="in memory" icon="cache" tone="accent" />
            <Box x={300} y={146} w={150} label="Database" sub="on disk" icon="db" />
            <Wire d="M130 98 C210 98 220 40 300 40" tone="req" label="GET link:x7Kp2Qa" labelAt={[214, 58]} />
            <Wire d="M130 120 C210 120 220 172 300 172" tone="req" dashed />
            <Tag x={500} y={40} tone="ok">HIT · 0.2 ms</Tag>
            <Tag x={500} y={172} tone="warn">MISS · then SET</Tag>
            <Text x={214} y={160} size={11} tone="muted">
              only on a miss
            </Text>
          </Diagram>
          <p>Two choices make or break a cache:</p>
          <ul>
            <li>
              <strong>The key.</strong> It must identify exactly one answer. For a redirect that&apos;s the slug, as in{" "}
              <code>link:{"{slug}"}</code>. Leave the slug out and every request shares one entry, so everyone gets the same
              (wrong) link.
            </li>
            <li>
              <strong>The value.</strong> Store what the request needs to finish without the database. A redirect needs only
              the long URL.
            </li>
          </ul>
          <Callout tone="tip" title="Why not more database replicas?">
            Replicas spread reads too, but each one is a full database machine. One Redis node does more than three times the
            reads of a database, for less than half the price.
          </Callout>
        </>
      ),
    },
    design("cache", {
      title: "The celebrity post",
      short: "Cache",
      minutes: 4,
      story:
        "A film star shares a gp.st link to her fan-club screening with 40 million followers. Redirects hit 60,000 a second. More servers can carry the requests, but every one of them still asks the database, and the database can't keep up.",
      palette: P.cache,
      knobs: K.cache,
      hints: [
        "Run it and look at the database's utilisation: that's your bottleneck, not the servers.",
        "Add Redis and wire every API server to it. Then click Redis and set its key and value.",
        "Key link:{slug}, value long_url. You'll also need about five medium servers for 60k req/s.",
      ],
      concepts: [
        { term: "Cache-aside", text: "Check the cache; on a miss read the database and fill the cache.", lesson: "cache-aside" },
        { term: "Cache key", text: "Must include everything that changes the answer, and nothing else.", lesson: "cache-aside" },
        { term: "Hit rate", text: "Share of reads the cache answers. Skewed traffic makes even a small cache very effective.", lesson: "why-cache" },
      ],
    }),
    design("scraper", {
      title: "A scraper shows up",
      short: "Rate limit",
      minutes: 4,
      story:
        "Someone points a scraper at gp.st, guessing random codes to find private links: 40,000 requests a second from 20 IP addresses. Random codes are never cached, so all of it lands on your database. Real users must not notice, and some of them share an IP: a whole college campus can sit behind one address.",
      palette: P.all,
      knobs: K.scraper,
      hints: [
        "Add a rate limiter in front of everything: Users → Rate limiter → Load balancer.",
        "Limiting by link punishes popular links, and a global limit cuts everyone equally. Which one singles out the bot?",
        "Limit per IP. Look at the busiest real source in the inspector, and set the limit just above it.",
      ],
      concepts: [
        { term: "Rate limiting", text: "Reject clients that send more than their share, with a 429, before they cost you anything.", lesson: "why-rate-limit" },
        { term: "What to limit by", text: "The key decides who gets punished: per IP, per user, per API key or per route.", lesson: "what-to-limit-by" },
        { term: "NAT", text: "Many devices sharing one public IP, like a campus or a mobile carrier. Per-IP limits must allow for them.", lesson: "what-to-limit-by" },
      ],
    }),
    design("stampede", {
      title: "Redis restarts",
      short: "Stampede",
      minutes: 3,
      story:
        "Ops needs to patch Redis tonight, at peak. It comes back in seconds, but empty. Every hot link misses at the same moment, and tens of thousands of requests ask the database the same few hundred questions at once.",
      palette: P.all,
      knobs: K.stampede,
      hints: [
        "Run it and watch the timeline: the drop at second 5 is the cache coming back cold.",
        "The database isn't asked hard questions, just the same ones thousands of times. How could requests share an answer?",
        "Open Redis and set On a miss to Coalesce.",
      ],
      concepts: [
        { term: "Thundering herd", text: "Many requests miss the same key together and all hit the database at once.", lesson: "thundering-herd" },
        { term: "Request coalescing", text: "Concurrent misses for one key wait for a single fetch instead of each running their own.", lesson: "thundering-herd" },
        { term: "Retry storms", text: "Failed requests get retried, adding load exactly when the system can least take it.", lesson: "retries-and-backoff" },
      ],
    }),
    design("server", {
      title: "A server dies",
      short: "Lose a server",
      minutes: 3,
      story:
        "At 9 p.m. one API server's disk fails and it stops answering. The load balancer doesn't know and keeps sending it a share of the traffic. Every request it gets just hangs.",
      palette: P.all,
      knobs: K.server,
      hints: [
        "Two things are missing: noticing that the server is dead, and having enough servers left once it is.",
        "Click the load balancer and turn on health checks.",
        "With health checks on, the remaining servers take all the load. Do you have one spare? That's N+1.",
      ],
      concepts: [
        { term: "Health checks", text: "The load balancer pings each server and stops routing to one that fails a few in a row.", lesson: "health-checks" },
        { term: "N+1 redundancy", text: "Run one more server than peak needs, so losing any one doesn't overload the rest.", lesson: "health-checks" },
      ],
    }),
    design("primary", {
      title: "The database dies",
      short: "Lose the database",
      minutes: 3,
      story:
        "The machine running your only database loses power. Every redirect that misses the cache fails, and so does every new link. Restoring from last night's backup would take hours, and lose today's links.",
      palette: P.all,
      knobs: K.primary,
      hints: [
        "You need a second copy of the data that's always up to date, on another machine.",
        "Add a second database, set its role to Replica, and wire every API server to it.",
        "A replica alone just sits there when the primary dies. Turn on failover so it gets promoted.",
      ],
      concepts: [
        { term: "Replication", text: "The primary streams every write to replicas, which keep a copy a moment behind.", lesson: "read-replicas" },
        { term: "Failover", text: "Promote a replica to primary when the primary dies. Detecting death safely takes a few seconds.", lesson: "failover" },
      ],
    }),
    design("freshness", {
      title: "Share it right now",
      short: "Read your writes",
      minutes: 3,
      story:
        "Promoters create a link and paste it into a group chat within a second. With your replica serving reads, some of those first clicks hit a 404: the link exists on the primary, but hasn't reached the replica yet.",
      palette: P.all,
      knobs: K.freshness,
      hints: [
        "The replica runs a few hundred milliseconds behind. Brand-new links are the ones that suffer.",
        "Either make sure new links don't need the replica, or don't read from the replica at all.",
        "Turn on write-through in Redis, so new links are cached the moment they're saved. Or set the database to read from the primary only.",
      ],
      concepts: [
        { term: "Replication lag", text: "Replicas apply writes a little after the primary. Usually milliseconds, longer when the primary is busy.", lesson: "replication-lag" },
        { term: "Read-your-writes", text: "Whoever just wrote something sees it on their next read.", lesson: "replication-lag" },
        { term: "Write-through", text: "Update the cache in the same step as the database, so the cache never lacks a fresh write.", lesson: "write-strategies" },
      ],
    }),
    {
      type: "choose",
      id: "slugs",
      title: "Where do slugs come from?",
      short: "Slug generation",
      minutes: 3,
      body: (
        <>
          <p>
            One question has been waiting all drill: how does the server pick <code>x7Kp2Qa</code>? Seven characters from a–z, A–Z
            and 0–9 give 62<sup>7</sup> ≈ <strong>3.5 trillion</strong> codes. Ten years of links is about 12 billion, a tiny
            fraction. The question is how to pick one that&apos;s free, fast, across many servers at once.
          </p>
        </>
      ),
      prompt: "Which would you build?",
      options: [
        {
          id: "counter",
          title: "Counter + base62",
          summary: "Take the next number from a shared counter and write it in base 62: link 125,000,000,000 becomes 2crtgcg.",
          pros: ["Never collides, by construction", "Short codes from day one", "Simple to reason about"],
          cons: [
            "Guessable: a scraper can walk every link in order",
            "The counter is shared state every server must coordinate on",
          ],
          when: "Pick it when links aren't private. Hand each server a block of 1,000 numbers at a time so the counter isn't on every request.",
        },
        {
          id: "random",
          title: "7 random characters + retry",
          summary: "Generate a random code and insert it. If the unique constraint rejects it, roll again.",
          pros: ["Unguessable", "No coordination between servers", "Your unique slug column does the hard part"],
          cons: [
            "Collisions grow as the table fills: about 1 in 300 inserts after 12 billion links",
            "Every create may cost an extra round trip",
          ],
          when: "What most public shorteners do. Retries stay rare for decades, and scrapers can't enumerate links.",
        },
        {
          id: "hash",
          title: "Hash of the long URL",
          summary: "Hash the URL (say SHA-256), encode it in base 62 and keep the first 7 characters.",
          pros: ["The same URL always gets the same code", "Stateless: any server computes it alone"],
          cons: [
            "Truncated hashes still collide, so you need the retry path anyway",
            "Two people shortening the same URL share one link, and one set of click stats",
          ],
          when: "Good when deduplication is the point, for example one canonical short link per page. Add the user id to the hash if links must be private.",
        },
      ],
      after: (
        <p>
          There&apos;s no single right answer here, which is the point: each option moves a cost somewhere else. Notice that
          two of them lean on the <strong>unique slug</strong> from your schema. Good data models make the hard parts of later
          decisions easy.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed a URL shortener",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You started with a contract (the API), shaped the data around its queries, and then grew the system one problem at a
          time: <strong>scale up</strong>, <strong>scale out</strong>, <strong>cache</strong>, <strong>limit</strong>,{" "}
          <strong>coalesce</strong>, <strong>add redundancy</strong>, <strong>replicate</strong>, and keep it{" "}
          <strong>consistent</strong>. Every box on your canvas is there because a test failed without it. That habit (add a
          component only when you can name the problem it solves) is most of system design.
        </p>
      ),
    },
  ],
};
