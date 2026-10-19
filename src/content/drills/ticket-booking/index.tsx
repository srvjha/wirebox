import { Box, Diagram, Packet, Tag, Text, Wire } from "@/components/diagram/kit";
import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Drill, DrillGraph } from "@/lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: DrillGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };
const K = ["size", "shards", "hitRate"] as Knob[];
const P = {
  base: ["client", "server", "db"] as DesignStep["palette"],
  scale: ["client", "lb", "server", "cache", "db"] as DesignStep["palette"],
  edge: ["client", "limiter", "lb", "server", "cache", "db"] as DesignStep["palette"],
  jobs: ["client", "limiter", "lb", "server", "cache", "db", "queue", "worker"] as DesignStep["palette"],
  pay: ["client", "limiter", "lb", "server", "cache", "db", "queue", "worker", "external"] as DesignStep["palette"],
};

const design = (id: keyof typeof DESIGN, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief" | "flows" | "incident" | "incidentText" | "nodeDefaults" | "customKnobs" | "customChecks" | "customCheckLabels">): DesignStep => ({
  type: "design",
  id,
  ...DESIGN[id],
  debrief: DEBRIEFS[id],
  ...step,
});

export const ticketBooking: Drill = {
  slug: "ticket-booking",
  version: 1,
  title: "Design ticket booking",
  product: "Ticket booking",
  intro: (
    <>
      <p>
        This is Gatepass itself. A fan opens the app the second a tour goes on sale, sees a map of 40,000 seats, taps one, pays
        and gets a QR code. A very small amount of that is hard, and all of it is concentrated in one moment: the first ten
        seconds.
      </p>
      <p>
        The rules are brutal. Traffic jumps twentyfold, thousands of people want the <em>same</em> few seats, the payment
        provider is somebody else&apos;s slow API, and the one unforgivable bug is selling a seat twice. You&apos;ll design holds,
        locking, a waiting room and expiry, then survive a payment provider having a bad night.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Browse the seat map", detail: "Free, held and sold seats for an event, close to real time." },
    { kind: "functional", text: "Hold a seat for a few minutes", detail: "Tapping a seat reserves it while you pay." },
    { kind: "functional", text: "Pay and get a ticket", detail: "Card payment through an external provider, then a QR code." },
    { kind: "functional", text: "Release seats nobody paid for", detail: "Expired holds go back on sale automatically." },
    { kind: "non-functional", text: "Never sell a seat twice", detail: "Correctness beats speed. This is the one hard rule." },
    { kind: "non-functional", text: "Survive the on-sale", detail: "Twenty times normal traffic for the first ten seconds." },
    { kind: "non-functional", text: "Fair", detail: "Fans queue in order, and bots do not jump the line." },
    { kind: "non-functional", text: "Charge exactly once", detail: "A retry or a timeout must never bill a card twice." },
  ],
  estimates: [
    { label: "Seat-map reads, normal", value: "~1,500/s", math: "50k fans browsing, each refreshing every ~30 s" },
    { label: "Seat-map reads, on-sale", value: "~30,000/s", math: "20× spike for ~10 s" },
    { label: "Holds, on-sale", value: "~6,000/s", math: "300/s normally, 20× at the moment of sale" },
    { label: "Hot seats", value: "~200", math: "the front rows draw most of the holds at once" },
  ],
  cacheParam: "event",
  cacheValues: [],
  related: {
    lessons: ["distributed-locks", "idempotency", "queues-and-workers", "retries-and-backoff", "why-rate-limit", "cache-aside", "sharding", "sagas"],
    drills: ["payments", "url-shortener"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design ticket booking",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first. The seat row will carry most of your correctness.",
        "On the canvas, add components and wire them the way requests travel.",
        "Run a load test. Several kinds of traffic run at once: reads, holds, bots, background jobs and payments.",
        "Some checks cannot be seen in graphs: double booking, retries. Choose settings in the design panel and the tests will tell you.",
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
            Three things happen to a seat: someone looks at it, someone reserves it, someone pays for it. Each gets an endpoint,
            and the shape of those endpoints decides what you can cache, what you can retry and what must be atomic.
          </p>
          <p>Design the method, path, fields and status for each, then check your work.</p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <p>
          Notice two quiet choices. The hold returns <code>expires_at</code>, so time is part of the contract. And the payment
          takes an <code>idempotency_key</code> and answers <strong>202</strong>: the client can retry safely, and the server is
          free to take the money in the background.
        </p>
      ),
    },
    {
      type: "schema",
      id: "schema",
      title: "Model the seats",
      short: "Data model",
      minutes: 5,
      body: (
        <>
          <p>
            A seat has a life: <strong>free → held → sold</strong>, and a hold can slide back to free. Model that on one seat row,
            then keep sold seats in a separate table the database can enforce rules on.
          </p>
          <p>
            The queries tell you what to store: &quot;all seats of event 7&quot;, &quot;claim seat 42 if it is free&quot; and
            &quot;find holds whose time is up&quot;.
          </p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          The unique <code>seat_id</code> on bookings is worth more than every lock you will add later. Locks prevent mistakes
          in the normal path; the constraint prevents disasters when someone forgets the normal path.
        </p>
      ),
    },
    design("launch", {
      title: "A first gig",
      short: "Launch",
      minutes: 3,
      story: "Gatepass lists its first comedy night: 400 seats, a few hundred visitors. It has to work, and it has to be cheap.",
      palette: P.base,
      knobs: ["size"],
      startGraph: START,
      hints: ["Users need code to run and a place to keep the seats.", "Wire Users → API server → Database.", "One small server and one database fits the budget."],
      concepts: [{ term: "Start simple", text: "The cheapest design that meets the goals wins. Add parts only when a test fails without them.", lesson: "the-design-process" }],
    }),
    design("onsale", {
      title: "Tickets go on sale",
      short: "On-sale spike",
      minutes: 5,
      story: "A stadium tour goes on sale at 8 p.m. For ten seconds, traffic is twenty times normal: 30,000 seat-map reads and 6,000 hold attempts a second. Then it calms down.",
      palette: P.scale,
      knobs: K,
      hints: [
        "Run the test and watch the timeline: the spike is the red band.",
        "Most of the spike is people reading the same seat map. A cache can answer most of it.",
        "Add a load balancer, several medium servers and Redis. Holds are writes, so they need database capacity: try more shards.",
      ],
      concepts: [
        { term: "Read-heavy, write-hot", text: "The seat map is read constantly and cached cheaply. Holds are writes on the same few rows and cannot be cached.", lesson: "why-cache" },
        { term: "Sharding", text: "Splitting rows over several databases multiplies write capacity.", lesson: "sharding" },
      ],
    }),
    {
      type: "read",
      id: "read-waiting-room",
      title: "Fairness and bots",
      short: "Waiting room",
      minutes: 3,
      body: (
        <>
          <p>
            Half the traffic on a hot on-sale is not fans. Resellers run scripts that fire thousands of hold requests a second,
            from a handful of addresses. If every request gets equal treatment, the bots win: they are faster than people.
          </p>
          <p>
            Two tools work together. A <strong>rate limiter</strong> drops the abusive sources before they reach the servers. A{" "}
            <strong>virtual waiting room</strong> gives every real fan a place in line and admits them at the rate the booking
            system can handle.
          </p>
          <Diagram w={640} h={170} caption="The waiting room admits fans at the speed the booking system can take.">
            <Box x={10} y={60} w={110} label="Fans + bots" icon="client" />
            <Box x={180} y={60} w={130} label="Waiting room" sub="limiter" icon="limiter" tone="accent" />
            <Box x={370} y={60} w={120} label="Booking" icon="server" />
            <Box x={540} y={60} w={90} label="DB" icon="db" />
            <Wire points={[[120, 86], [180, 86]]} tone="req" label="40k/s" labelAt={[130, 78]} />
            <Wire points={[[310, 86], [370, 86]]} tone="req" label="1k/s" labelAt={[322, 78]} />
            <Wire points={[[490, 86], [540, 86]]} />
            <Packet points={[[120, 86], [180, 86], [310, 86], [370, 86]]} dur={2} />
            <Tag x={185} y={130} tone="warn">bots dropped</Tag>
            <Text x={190} y={30} size={11} tone="muted">
              fans: &quot;you are number 3,200&quot;
            </Text>
          </Diagram>
          <p>
            The key detail is what happens to people over the limit. A <strong>429 page</strong> makes them hit refresh, which
            is another request. A <strong>queue with a visible position</strong> makes them wait.
          </p>
          <KeyIdea>Protect the expensive path by controlling how fast people enter, not by making everyone fail equally.</KeyIdea>
        </>
      ),
    },
    design("waitroom", {
      title: "Bots at the gate",
      short: "Waiting room",
      minutes: 4,
      story: "Resellers aim 40,000 requests a second at the hold endpoint during the sale. Your servers are busy answering scripts while real fans see errors.",
      palette: P.edge,
      knobs: K,
      hints: ["Run the test. Which flow's success drops, and what is eating the servers?", "Add a rate limiter in front of everything.", "Then choose what fans over the limit see: a waiting room, not an error page."],
      concepts: [
        { term: "Rate limiting", text: "Reject traffic that exceeds its share before it costs you anything.", lesson: "why-rate-limit" },
        { term: "Waiting room", text: "A queue in front of the system that admits users at a fixed rate and shows their place.", lesson: "rate-limit-algorithms" },
      ],
    }),
    {
      type: "read",
      id: "read-double-booking",
      title: "Two fans, one seat",
      short: "Double booking",
      minutes: 4,
      body: (
        <>
          <p>Here is the bug that ends companies. Priya and Rahul both tap seat F12 in the same millisecond. Both requests run:</p>
          <ol className="list-decimal pl-5">
            <li>read the seat: status is free</li>
            <li>decide it is free, so go ahead</li>
            <li>write status = held, holder = me</li>
          </ol>
          <p>
            Between step 1 and step 3 the world moved. Both read &quot;free&quot;, both write, and the last write wins. Two
            people hold the same seat and the first one is silently overwritten. This is a <strong>race condition</strong>, and
            it only appears under load, which is why it shows up on your biggest night.
          </p>
          <p>The cure is to make read-decide-write one <strong>atomic</strong> step. There are four common ways:</p>
          <ul className="list-disc pl-5">
            <li><strong>Nothing.</strong> The bug above.</li>
            <li><strong>Optimistic version.</strong> <code>UPDATE seats SET status=&apos;held&apos;, version=version+1 WHERE id=42 AND version=7</code>. If another writer got there first, zero rows change and you retry.</li>
            <li><strong>Pessimistic lock.</strong> <code>SELECT ... FOR UPDATE</code> locks the row until your transaction ends. Others wait.</li>
            <li><strong>Redis hold.</strong> <code>SET seat:42 buyer NX EX 480</code> succeeds for exactly one caller, then expires on its own.</li>
          </ul>
          <Callout tone="key" title="Contention decides">
            When conflicts are rare, optimistic wins: no waiting, and a rare retry. When conflicts are the norm (the best 200
            seats at 8 p.m.) nearly every attempt loses and retries, so optimism melts down precisely when you need it.
          </Callout>
        </>
      ),
    },
    design("double", {
      title: "Same seat, same instant",
      short: "Prevent double booking",
      minutes: 5,
      story: "1,200 fans go for the same 200 front-row seats in the same second. Customer support is already preparing for the argument over who sat where.",
      palette: P.edge,
      knobs: K,
      hints: ["Open the design panel and look at 'Taking a seat'.", "No lock is the bug. Optimistic retries multiply traffic on hot seats.", "Use SELECT ... FOR UPDATE, or a Redis hold (then wire a server to Redis)."],
      concepts: [
        { term: "Race condition", text: "The result depends on who writes first, and two writers each believe they are first.", lesson: "distributed-locks" },
        { term: "Optimistic vs pessimistic", text: "Optimistic assumes conflicts are rare and retries. Pessimistic assumes they are common and waits.", lesson: "distributed-locks" },
      ],
    }),
    design("expiry", {
      title: "Abandoned carts",
      short: "Holds with TTL",
      minutes: 5,
      story: "Half the holds are never paid for: people close the tab, cards fail, phones die. Every abandoned hold must return to sale, or you sell out with empty seats.",
      palette: P.jobs,
      knobs: K,
      hints: ["Three settings matter: how long a hold lasts, and what releases it.", "A hold needs to outlive a checkout, but not much longer.", "Add a queue and a worker for the release job, and set release to a worker sweep."],
      concepts: [
        { term: "TTL", text: "Time to live: the moment after which a record no longer counts.", lesson: "queues-and-workers" },
        { term: "Background worker", text: "Work driven by time rather than by a request. Seats must return even if nobody looks at them.", lesson: "queues-and-workers" },
      ],
    }),
    {
      type: "read",
      id: "read-payment",
      title: "Paying through someone else's API",
      short: "External payments",
      minutes: 3,
      body: (
        <>
          <p>
            You cannot scale a payment provider or fix its bad days. It has a rate limit, a latency you do not control and, now
            and then, a timeout after which you do not know whether the money moved.
          </p>
          <p>Three habits make that survivable:</p>
          <ul className="list-disc pl-5">
            <li><strong>Queue the call</strong>, so a slow provider fills a queue and not your web servers.</li>
            <li><strong>Retry with backoff and jitter</strong>, so failures do not become a retry storm.</li>
            <li><strong>Idempotency keys</strong>, so a retry after a timeout cannot charge twice.</li>
          </ul>
          <Diagram w={640} h={150} caption="The queue lets checkout answer instantly while charges happen at the provider's pace.">
            <Box x={10} y={50} w={110} label="Checkout" icon="server" />
            <Box x={180} y={50} w={110} label="Queue" icon="queue" tone="accent" />
            <Box x={350} y={50} w={110} label="Workers" icon="worker" />
            <Box x={520} y={50} w={110} label="Provider" icon="service" dashed />
            <Wire points={[[120, 76], [180, 76]]} tone="req" />
            <Wire points={[[290, 76], [350, 76]]} tone="req" />
            <Wire points={[[460, 76], [520, 76]]} tone="req" label="key: bk_42" labelAt={[464, 66]} />
            <Packet points={[[120, 76], [180, 76], [290, 76], [350, 76], [460, 76], [520, 76]]} dur={2.6} />
          </Diagram>
        </>
      ),
    },
    design("payment", {
      title: "The provider has a bad night",
      short: "Payment incident",
      minutes: 6,
      story: "Mid-sale the payment provider slows to 800 ms and fails three charges in ten. Queue them, retry sensibly and never bill a card twice.",
      palette: P.pay,
      knobs: K,
      hints: ["Wire servers → Queue → Workers → Provider so checkout never waits on the provider.", "Workers hold a thread for the whole slow call: a slow provider needs many more of them.", "Retry with backoff, and send an idempotency key."],
      concepts: [
        { term: "Retries with backoff", text: "Wait longer after each failure, with random jitter, so clients do not all retry together.", lesson: "retries-and-backoff" },
        { term: "Idempotency", text: "Doing it twice has the same effect as doing it once.", lesson: "idempotency" },
      ],
    }),
    {
      type: "choose",
      id: "choose-lock",
      title: "Which lock would you ship?",
      short: "Locking deep dive",
      minutes: 4,
      prompt: "Gatepass sells 40,000 seats a night, mostly in a ten-second burst. Pick the strategy you'd ship, then read the tradeoffs.",
      body: <p>All four of these are used in production. Which fits depends on how contended the rows are and what you are willing to operate.</p>,
      options: [
        {
          id: "optimistic",
          title: "Optimistic version check",
          summary: "UPDATE ... WHERE version = n. Retry the loser.",
          pros: ["No locks held, no waiting", "Simple SQL, works anywhere", "Great when conflicts are rare"],
          cons: ["Hot seats cause retry storms", "Needs a retry policy with backoff", "Unfair: who wins is a coin toss"],
          when: "Editing a profile, a cart, a document: anything where two writers rarely collide.",
        },
        {
          id: "forupdate",
          title: "SELECT ... FOR UPDATE",
          summary: "Lock the row inside a short transaction.",
          pros: ["Easy to reason about and correct", "No lost work: waiters get a turn", "Everything stays in one database"],
          cons: ["Database becomes the hot path", "Long transactions stall everyone behind them", "Deadlocks if you lock rows in different orders"],
          when: "Moderate contention and a database that can take the write rate. A good first answer.",
        },
        {
          id: "redis",
          title: "Redis hold with TTL",
          summary: "SET key NX EX: one atomic call, expires by itself.",
          pros: ["Very fast, takes the hot path off Postgres", "Expiry built in: no release job for holds", "Fits a spike"],
          cons: ["Two stores to keep consistent", "If Redis loses a key, a seat may be double-held (keep the unique constraint)", "More moving parts to operate"],
          when: "Large spikes on few rows, like a stadium on-sale.",
        },
        {
          id: "queue",
          title: "One queue per event",
          summary: "Serialise every claim for an event through a single consumer.",
          pros: ["No race by construction", "Perfectly fair: first in, first served", "Easy to audit"],
          cons: ["One consumer caps throughput per event", "Head-of-line blocking", "The latency is the queue's depth"],
          when: "When fairness matters more than speed, often behind a waiting room.",
        },
      ],
      after: (
        <p>
          Many real systems layer them: a waiting room to shape traffic, a Redis hold for speed, the database constraint as the
          last line of defence. Pick the cheapest one that meets the contention you have, and keep the constraint regardless.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed ticket booking",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You sized for a ten-second spike, kept bots out with a waiting room, made seat claims atomic, let a worker give abandoned
          seats back and put a queue, backoff and idempotency key between your customers and a flaky provider. The pattern repeats
          across the whole domain of money and inventory: <strong>make the claim atomic, expire what is not confirmed, and make
          every retry safe.</strong> The next drill, payments, goes deeper on that last part.
        </p>
      ),
    },
  ],
};
