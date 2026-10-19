import { Box, Diagram, Packet, Wire } from "@/components/diagram/kit";
import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Lab, LabGraph } from "@/lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: LabGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };

const K = {
  launch: ["size"] as Knob[],
  scale: ["size"] as Knob[],
  fanout: ["size"] as Knob[],
  timeouts: ["size"] as Knob[],
  gateway: ["size", "healthChecks"] as Knob[],
};

const P = {
  launch: ["client", "ws", "server", "cache"] as DesignStep["palette"],
  scale: ["client", "lb", "ws", "server", "cache", "db"] as DesignStep["palette"],
  fanout: ["client", "lb", "ws", "server", "cache", "db", "pubsub"] as DesignStep["palette"],
};

const design = (id: keyof typeof DESIGN, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief">): DesignStep => ({
  type: "design",
  id,
  ...DESIGN[id],
  debrief: DEBRIEFS[id],
  ...step,
});

export const presence: Lab = {
  slug: "presence",
  version: 1,
  title: "Design online presence",
  product: "Online presence",
  intro: (
    <>
      <p>
        On Gatepass, a green dot beside a friend&apos;s name means they&apos;re on the site right now, maybe lining up for the
        same gig. It&apos;s a tiny feature that quietly breaks assumptions: the server has to know who is online, but{" "}
        <strong>nobody ever tells it when someone leaves</strong>. Phones lose signal, laptops close, batteries die.
      </p>
      <p>
        Now make it work for <strong>100 million users</strong>, with a fifth of them online at once. Every one holds a
        connection open. Every time one of them comes or goes, their online friends should hear about it. You&apos;ll design the
        gateways that hold the connections, the timeouts that decide who has left, the broker that carries news between
        machines, and what happens when a gateway dies with fifty thousand people on it.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Show who's online", detail: "A green dot, and “last seen” for everyone else." },
    { kind: "functional", text: "Update in near real time", detail: "Friends hear about a status change within a couple of seconds." },
    { kind: "functional", text: "Friend list at a glance", detail: "Opening the app shows which of 200 friends are online, in one request." },
    { kind: "non-functional", text: "Millions of connections", detail: "~20M online at once, each holding an open socket." },
    { kind: "non-functional", text: "Honest", detail: "A closed app disappears within a minute; a glitch doesn't make anyone flicker." },
    { kind: "non-functional", text: "Cheap per user", detail: "Heartbeats from 20M users are a constant background load." },
    { kind: "non-functional", text: "Survives a gateway dying", detail: "~50,000 reconnects without a stampede." },
  ],
  estimates: [
    { label: "Users", value: "100M · 20M online", math: "20% online at the evening peak" },
    { label: "Gateways", value: "~400 in all", math: "20M ÷ 50,000 connections each" },
    { label: "Heartbeats", value: "~1M/s", math: "20M users ÷ one ping every 20 s" },
    { label: "Fan-out", value: "~60k/s per region", math: "status changes × ~40 online friends. Tests model one 300k-user region" },
  ],
  cacheParam: "user_id",
  cacheValues: [],
  related: {
    lessons: ["presence", "scaling-websockets", "sse-and-websockets", "pub-sub", "health-checks", "retries-and-backoff", "failover"],
    labs: ["chat", "notifications", "collab-editor"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design online presence",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first. Presence is mostly written, rarely read.",
        "On the canvas, add components and wire them the way messages travel, including gateways that keep connections open.",
        "Run a load test. The simulator tracks open connections, messages per second, delivery and cost. Each test models one 300,000-user region.",
        "Some choices (heartbeat timing, reconnect behaviour) are settings. Look on the gateway and in the design panel.",
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
            The live path will run over a WebSocket, which has no URLs and status codes. But a presence service still needs plain
            HTTP: for the first screen when the app opens, for profile pages, and for clients that can&apos;t hold a socket.
          </p>
          <p>Design one endpoint for each requirement, thinking about who calls it and how often.</p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <>
          <p className="mb-2 text-[16px] font-semibold text-fg">Batch, because round trips are the cost</p>
          <p>
            The friend-list endpoint exists because 200 separate lookups would be 200 round trips and 200 chances to be slow.
            One request, one answer. The same reasoning shows up inside your system: gateways batch heartbeats into one Redis
            call rather than one per user.
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
            Two kinds of data again, with very different lives. <strong>Presence</strong> is tiny, constantly changing and
            allowed to vanish: written every few seconds, wrong if more than a minute old. <strong>Friendships</strong> change
            rarely but must never be lost.
          </p>
          <p>Model both, plus the one fact that makes pushing possible: which gateway each user&apos;s socket lives on.</p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          In the simulator, “who is online right now” lives in Redis with a timeout, because a durable database can&apos;t take a
          write per user every 20 seconds. The table you just designed is the durable shape: last seen, friends, and where a
          user is connected.
        </p>
      ),
    },
    {
      type: "choose",
      id: "transport",
      title: "How do you keep a connection open?",
      short: "Transport",
      minutes: 3,
      body: (
        <p>
          Presence needs the server to <em>push</em>: when a friend comes online, your phone must hear without asking. HTTP
          alone was built for the opposite, with the client asking and the server answering. Three standard ways around that:
        </p>
      ),
      prompt: "Which would you build the live connection on?",
      options: [
        {
          id: "polling",
          title: "Polling",
          summary: "Every client asks “anything new?” every few seconds.",
          pros: ["Works everywhere, no special infrastructure", "Stateless servers: any machine can answer"],
          cons: ["At 20M online and a 5 s interval that's 4M requests a second, mostly “no”", "Updates arrive up to 5 s late"],
          when: "Small audiences, or where a few seconds' delay doesn't matter.",
        },
        {
          id: "sse",
          title: "Server-sent events",
          summary: "One long-lived HTTP response; the server streams updates down it.",
          pros: ["Simple, with automatic reconnect built into browsers", "Plain HTTP, friendly to proxies"],
          cons: ["One direction only: heartbeats still need separate requests", "Still holds a connection per user"],
          when: "When clients only listen: live scores, dashboards.",
        },
        {
          id: "ws",
          title: "WebSocket",
          summary: "A full-duplex connection: heartbeats up, updates down, one socket.",
          pros: ["A lost connection is itself a presence signal", "Lowest overhead per message in both directions"],
          cons: ["Stateful: each user is pinned to a gateway", "Load balancers and deploys need care"],
          when: "Chat, presence, collaboration, games. The one you'll use in this drill.",
        },
      ],
      after: (
        <p>
          Holding an open connection per user is the cost of real-time. Now the question becomes how many one machine can hold,
          and what keeps them all in sync.
        </p>
      ),
    },
    design("launch", {
      title: "Launch: one gateway",
      short: "Launch",
      minutes: 4,
      story:
        "Presence ships to the first 30,000 users. Each holds a WebSocket and pings every 20 seconds. Friend lists are fetched from an API. A machine that keeps sockets open and a place to hold who is online right now: that's the whole system.",
      palette: P.launch,
      knobs: K.launch,
      startGraph: START,
      hints: [
        "Users need something that keeps connections open: the WebSocket gateway. The API serves friend lists.",
        "Heartbeats go gateway → Redis. Lookups go API server → Redis. Wire both to the cache.",
        "Users → gateway → Redis, and Users → API server → Redis. One of each.",
      ],
      concepts: [
        { term: "WebSocket gateway", text: "A server whose job is holding open connections. Each user is attached to exactly one.", lesson: "scaling-websockets" },
        { term: "Heartbeat", text: "A small periodic message that says “still here”. Silence is how you notice someone left.", lesson: "presence" },
        { term: "TTL key", text: "A key that expires on its own. Refresh it with each heartbeat, and a user who goes quiet simply disappears.", lesson: "presence" },
      ],
    }),
    design("scale", {
      title: "A region at evening peak",
      short: "Connections",
      minutes: 5,
      story:
        "One region now has 300,000 people online at once. A gateway holds at most 50,000 connections, no matter how many messages it handles. Heartbeats are 15,000 a second and friend lists are being fetched 8,000 times a second.",
      palette: P.scale,
      knobs: K.scale,
      hints: [
        "Run it and look at the gateway: is it short of messages per second, or of connections?",
        "300,000 connections ÷ 50,000 per gateway is six, with nothing left over. How many do you actually want?",
        "Add a load balancer so users spread over the gateways. Eight gateways run at 75%, which leaves room.",
      ],
      concepts: [
        { term: "Connection limit", text: "A gateway's real bound is open sockets (memory, file descriptors), not request rate.", lesson: "scaling-websockets" },
        { term: "Stateful tier", text: "Unlike stateless API servers, each user is stuck to one gateway, so you can't redistribute them freely.", lesson: "scaling-websockets" },
      ],
    }),
    {
      type: "read",
      id: "read-fanout",
      title: "Telling friends",
      short: "Fan-out",
      minutes: 3,
      body: (
        <>
          <p>
            When Asha comes online, her 40 online friends should see her dot turn green. Those friends are connected to{" "}
            <strong>different gateways</strong>, and a gateway only knows about its own sockets. How does the news travel?
          </p>
          <p>
            A <strong>pub/sub broker</strong> is a switchboard. When Asha&apos;s gateway sees her connect, it publishes
            &quot;Asha is online&quot;. Every gateway that has one of her friends subscribes, receives the message, and pushes it down
            the right sockets.
          </p>
          <Diagram w={640} h={220} caption="One publish, many deliveries. Gateways don't need to know about each other.">
            <Box x={10} y={88} w={100} label="Asha" icon="phone" />
            <Box x={150} y={88} w={110} label="Gateway A" icon="service" />
            <Box x={320} y={88} w={100} label="Pub/sub" icon="stream" tone="accent" />
            <Box x={480} y={14} w={110} label="Gateway B" icon="service" />
            <Box x={480} y={162} w={110} label="Gateway C" icon="service" />
            <Wire points={[[110, 114], [150, 114]]} tone="req" />
            <Wire points={[[260, 114], [320, 114]]} tone="req" label="publish" />
            <Wire d="M420 114 C450 114 450 40 480 40" tone="res" />
            <Wire d="M420 114 C450 114 450 188 480 188" tone="res" />
            <Packet points={[[110, 114], [150, 114], [260, 114], [320, 114]]} dur={1.8} />
            <Packet d="M420 114 C450 114 450 40 480 40" dur={1.2} delay={1.4} tone="res" />
            <Packet d="M420 114 C450 114 450 188 480 188" dur={1.2} delay={1.5} tone="res" />
          </Diagram>
          <Callout tone="warn" title="Fan-out is where the load hides">
            One status change costs one publish plus a delivery per online friend. A user with 5,000 friends turns a single
            heartbeat into thousands of messages, and a celebrity into millions. Real systems skip pushing to people who
            aren&apos;t looking at the list.
          </Callout>
          <KeyIdea>Gateways hold the sockets; the broker carries news between them.</KeyIdea>
        </>
      ),
    },
    design("fanout", {
      title: "Friends see each other",
      short: "Fan-out",
      minutes: 5,
      story:
        "Fifteen hundred status changes a second, each delivered to about 40 online friends: 60,000 deliveries a second, spread across your gateways. A friend could be on any of them. Your task is to make sure the update reaches them all.",
      palette: P.fanout,
      knobs: K.fanout,
      hints: [
        "Run it and read the delivery number. If your gateways can't reach each other, who hears about the change?",
        "Add a pub/sub broker and wire it both ways: each gateway publishes into it and receives from it.",
        "Gateway → Pub/sub and Pub/sub → gateway for every gateway. The broker handles 500,000 messages a second, plenty.",
      ],
      concepts: [
        { term: "Pub/sub", text: "Publishers send to a topic; subscribers receive from it. Neither knows the other.", lesson: "pub-sub" },
        { term: "Fan-out", text: "One event becomes many deliveries. It multiplies load by the number of recipients.", lesson: "presence" },
        { term: "Delivery", text: "The share of messages that reach every recipient. A broker is what makes it 100%.", lesson: "pub-sub" },
      ],
    }),
    {
      type: "read",
      id: "read-timeouts",
      title: "How long is long enough?",
      short: "Timeouts",
      minutes: 3,
      body: (
        <>
          <p>
            Every presence system has two numbers: <strong>how often</strong> a client says &quot;still here&quot;, and{" "}
            <strong>how many missed messages</strong> you tolerate before deciding they&apos;re gone. They pull in opposite
            directions.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Ping often, give up fast.</strong> Offline shows in seconds, but 300,000 users pinging every two seconds is
              150,000 writes a second, and one dropped packet on a train makes someone flicker offline and back, telling all
              their friends twice.
            </li>
            <li>
              <strong>Ping rarely, give up slowly.</strong> Cheap, but a user who closes the app still glows green for five
              minutes. People notice ghosts.
            </li>
            <li>
              <strong>In between.</strong> Ping every 20 s, wait for three misses. Glitches are forgiven, departures show within a
              minute, and the traffic is reasonable.
            </li>
          </ul>
          <KeyIdea>A timeout is a bet that silence means gone. Make the bet long enough to survive a bad packet.</KeyIdea>
        </>
      ),
    },
    design("timeouts", {
      title: "Tuning the heartbeat",
      short: "Heartbeats",
      minutes: 4,
      story:
        "Users complain: some friends flicker online and offline, others show as online for minutes after leaving. Your gateways are already built; the question is the heartbeat policy. Click a gateway to choose how often clients ping and when to give up.",
      palette: P.fanout,
      knobs: K.timeouts,
      hints: [
        "Open a gateway's settings and read each option's description. Which failure does each one trade for?",
        "A good setting lets one bad packet pass, but doesn't leave ghosts for more than a minute or two.",
        "Ping every 20 s and wait for three misses. Redis can handle the pings; pinging every 2 s needs several Redis nodes.",
      ],
      concepts: [
        { term: "Timeout", text: "How long silence is tolerated before concluding something is gone.", lesson: "health-checks" },
        { term: "Flapping", text: "Rapid back-and-forth between states, here offline/online, each flip causing a wave of messages.", lesson: "presence" },
        { term: "False positive", text: "Declaring someone offline who is only briefly unreachable.", lesson: "health-checks" },
      ],
    }),
    design("gateway", {
      title: "A gateway dies",
      short: "Failure",
      minutes: 6,
      story:
        "Five seconds into the evening peak, a gateway's host fails with about 33,000 users on it. All of them lose their connection at once and try to come back, each login hitting your API servers and database. Meanwhile their friends must not see a wave of false “offline”s.",
      palette: P.fanout,
      knobs: K.gateway,
      hints: [
        "Run it. What happens to the users on the dead gateway? Who notices, and how fast?",
        "Capacity: if one gateway disappears, can the others hold everybody? And can the balancer tell the dead one is dead?",
        "Add one more gateway than the load needs, wire servers and a database for logins, turn on health checks, and set reconnects to back off with jitter. Two servers handle the logins.",
      ],
      concepts: [
        { term: "Thundering herd", text: "Many clients retry at the same moment and overwhelm the thing that just recovered.", lesson: "thundering-herd" },
        { term: "Jitter", text: "A random delay added to retries so clients spread out.", lesson: "retries-and-backoff" },
        { term: "N+1", text: "One more gateway than the load needs, so losing one is a non-event.", lesson: "failover" },
      ],
    }),
    {
      type: "choose",
      id: "fanout-strategy",
      title: "Push to everyone, or only to those looking?",
      short: "Fan-out strategy",
      minutes: 3,
      body: (
        <p>
          You pushed every status change to every online friend. It works at 40 friends. A user with 5,000 friends turns one
          change into 5,000 messages, and most of those friends aren&apos;t even looking at the list. How should the system
          decide who gets what?
        </p>
      ),
      prompt: "Which would you build?",
      options: [
        {
          id: "push",
          title: "Push to every online friend",
          summary: "On each change, publish to all online friends.",
          pros: ["Always current: the dot updates the moment it changes", "Simple to explain and build"],
          cons: ["Cost grows with friends × changes, and popular users blow it up", "Wastes work on people not looking"],
          when: "Small friend lists (hundreds), where fan-out stays modest.",
        },
        {
          id: "subscribe",
          title: "Subscribe to who's on screen",
          summary: "A client subscribes only to the friends visible right now, and unsubscribes on scroll.",
          pros: ["Fan-out follows attention, not friend count", "Celebrities cost almost nothing"],
          cons: ["Clients and gateways track subscriptions", "A subscription on every scroll is its own traffic"],
          when: "Large friend lists or follower counts. Most big products end up here.",
        },
        {
          id: "pull",
          title: "Pull on open",
          summary: "No pushes at all: the app fetches the friend list's status when opened, and every 30 s.",
          pros: ["No fan-out at all", "Very simple and cacheable"],
          cons: ["Dots are up to 30 s stale", "Polling load scales with users on screen"],
          when: "When “nearly live” is fine, for example a contact list that nobody stares at.",
        },
      ],
      after: (
        <p>
          Fan-out is a choice between doing work on write and doing it on read. Pushing makes reads instant and writes
          expensive; pulling does the opposite. Subscribing is the middle path, which spends effort only where someone is
          paying attention.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed presence",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You held connections on <strong>WebSocket gateways</strong> sized by sockets, not requests, kept “who&apos;s online” in{" "}
          <strong>Redis with timeouts</strong>, carried news between gateways with <strong>pub/sub</strong>, chose a{" "}
          <strong>heartbeat policy</strong> that forgives glitches without keeping ghosts, and survived a dead gateway with{" "}
          <strong>spare capacity, health checks and jittered reconnects</strong>. Real-time products are mostly this: a lot of
          small, open, stateful connections that must be allowed to fail gracefully.
        </p>
      ),
    },
  ],
};
