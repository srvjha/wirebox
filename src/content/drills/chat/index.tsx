import { Box, Diagram, Packet, Tag, Wire } from "@/components/diagram/kit";
import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Drill, DrillGraph } from "@/lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN, type StepId } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: DrillGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };
const KNOBS: Knob[] = ["size"];
const KNOBS_HC: Knob[] = ["size", "healthChecks"];

const P = {
  base: ["client", "ws", "db"] as DesignStep["palette"],
  scale: ["client", "lb", "ws", "db"] as DesignStep["palette"],
  pubsub: ["client", "lb", "ws", "pubsub", "db"] as DesignStep["palette"],
  push: ["client", "lb", "ws", "pubsub", "server", "db", "queue", "worker", "external"] as DesignStep["palette"],
  all: ["client", "lb", "ws", "pubsub", "server", "cache", "db", "queue", "worker", "external"] as DesignStep["palette"],
};

const design = (id: StepId, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief" | "flows">): DesignStep => {
  const d = DESIGN[id] as (typeof DESIGN)[StepId] & Partial<Pick<DesignStep, "incident" | "incidentText" | "customKnobs" | "customChecks" | "customCheckLabels" | "nodeDefaults">>;
  return {
    type: "design",
    id,
    scenario: { label: step.title, load: { reads: 0, writes: 0, attack: 0 } },
    flows: d.flows,
    constraints: d.constraints,
    incident: d.incident,
    incidentText: d.incidentText,
    customKnobs: d.customKnobs,
    customChecks: d.customChecks,
    customCheckLabels: d.customCheckLabels,
    nodeDefaults: d.nodeDefaults,
    debrief: DEBRIEFS[id],
    ...step,
  };
};


export const chat: Drill = {
  slug: "chat",
  version: 1,
  title: "Design a chat app",
  product: "Chat app",
  intro: (
    <>
      <p>
        Gatepass added chat: fans in the same gig group coordinate rides, promoters message ticket holders, and friends argue
        about the setlist. Within a month the app has a quarter of a million people connected at once, many on trains and
        patchy mobile data.
      </p>
      <p>
        Chat looks like the easy case of &quot;send a thing, show a thing&quot;, but nearly every default fails. A normal
        request has the phone ask the server; here the server must reach the phone, so connections stay open. Those connections
        pin users to different machines, so machines must talk to each other. Phones vanish mid-sentence and come back with
        stale clocks. You&apos;ll build each fix in the order the problems appear.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "1:1 and group messages", detail: "Groups of up to a few hundred people." },
    { kind: "functional", text: "Delivered in order", detail: "Everyone in a conversation sees messages in the same order." },
    { kind: "functional", text: "Offline delivery", detail: "A message for a phone that's off is waiting when it comes back, and a push nudges it." },
    { kind: "functional", text: "Delivery and read receipts", detail: "Two ticks, then blue." },
    { kind: "non-functional", text: "Instant", detail: "A message arrives in well under a second when both people are online." },
    { kind: "non-functional", text: "Never lose a message", detail: "Once the sender sees one tick, it's stored." },
    { kind: "non-functional", text: "Survives a gateway failing", detail: "Reconnect storms must not take the rest down." },
  ],
  estimates: [
    { label: "Connected users", value: "250,000", math: "5 gateways × ~50,000 connections each, plus one spare" },
    { label: "Messages", value: "~4,000/s", math: "250k users × ~1 message a minute each ≈ 4,200/s" },
    { label: "Group deliveries", value: "~2,400/s", math: "300 group messages/s × 8 members on average" },
    { label: "Receipts", value: "~8,000/s", math: "about two per message: delivered, then read" },
  ],
  cacheParam: "conversation",
  cacheValues: [],
  related: {
    lessons: ["sse-and-websockets", "scaling-websockets", "pub-sub", "queues-and-workers", "idempotency", "health-checks"],
    drills: ["presence", "notifications", "collab-editor"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design a chat app",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and data model first.",
        "On the canvas, wire gateways, brokers and stores the way a message travels.",
        "Each test sends several kinds of traffic at once (messages, group messages, pushes, receipts) and grades each separately.",
        "Some problems aren't about speed. Design choices in the side panel decide ordering and delivery guarantees.",
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
            Live delivery runs over a WebSocket, but the contract underneath is still a small API: send, catch up, and
            acknowledge. Treat the shapes below as the messages your gateway understands.
          </p>
          <p>Think about what happens when each call is made twice, or never arrives.</p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <p>
          Two details carry the whole design: the <strong>client-generated id</strong> turns a risky retry into a no-op, and the{" "}
          <strong>sequence number</strong> gives every message a place in line that both sides agree on.
        </p>
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
            Almost every read is <strong>&quot;messages in this conversation, after sequence N&quot;</strong>, and every write
            appends to the end of a conversation. Choose a layout where a conversation&apos;s messages live together and sort
            by seq.
          </p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          Notice <code>last_read_seq</code>: instead of a receipt row per message per person, one number per member says
          &quot;everything up to here is read&quot;. Groups of 200 would otherwise produce 200 rows per message.
        </p>
      ),
    },
    design("launch", {
      title: "The first group chats",
      short: "Launch",
      minutes: 3,
      story:
        "Chat opens to a pilot: 20,000 phones connected, about 500 messages a second. Phones should be pushed messages, not polling for them.",
      palette: P.base,
      knobs: KNOBS,
      startGraph: START,
      hints: [
        "Phones keep a long-lived connection open. Which component holds those?",
        "Wire Users → WebSocket gateway → Postgres (or your engine). The gateway saves each message before delivering.",
        "One gateway is plenty for 20,000 connections.",
      ],
      concepts: [
        { term: "WebSocket", text: "A connection that stays open so the server can push to the client at any time.", lesson: "sse-and-websockets" },
        { term: "Connection limit", text: "A gateway's capacity is mostly how many open connections it can hold, not requests per second.", lesson: "scaling-websockets" },
      ],
    }),
    design("scale", {
      title: "A quarter million connections",
      short: "Gateways",
      minutes: 4,
      story:
        "A festival weekend: 250,000 phones connected at once. One gateway holds about 50,000 connections, so a single one drops everyone else.",
      palette: P.scale,
      knobs: KNOBS,
      hints: [
        "Run it first: the gateway turns red because of its connection count, not message volume.",
        "Add a load balancer and several gateways behind it. Wire each gateway to the database.",
        "250,000 ÷ 50,000 is five. Run six so no gateway sits at its limit.",
      ],
      concepts: [
        { term: "Sticky connections", text: "A phone stays attached to one gateway for the life of its connection.", lesson: "scaling-websockets" },
        { term: "Connection-bound scaling", text: "You add gateways to hold more people, even when the message rate is low.", lesson: "scaling-websockets" },
      ],
    }),
    {
      type: "read",
      id: "read-pubsub",
      title: "Gateways that can't hear each other",
      short: "Pub/sub",
      minutes: 3,
      body: (
        <>
          <p>
            Asha is on gateway 1; Ravi is on gateway 4. Asha&apos;s message arrives at gateway 1, which has no connection to
            Ravi. Left alone it can only deliver to people who happen to share its machine, 1 in 6 with six gateways.
          </p>
          <p>
            A <strong>pub/sub broker</strong> connects them. Each gateway subscribes to the conversations its users are in;
            the sender&apos;s gateway publishes once, and every gateway holding a member delivers locally.
          </p>
          <Diagram w={680} h={210} caption="Publish once; each gateway with a member delivers to its own phones.">
            <Box x={0} y={78} w={104} label="Asha" sub="gateway 1" icon="phone" />
            <Box x={170} y={78} w={110} label="Gateway 1" icon="stream" />
            <Box x={340} y={78} w={110} label="Pub/sub" icon="stream" tone="accent" />
            <Box x={520} y={10} w={110} label="Gateway 4" icon="stream" />
            <Box x={520} y={148} w={110} label="Gateway 5" icon="stream" />
            <Wire points={[[104, 104], [170, 104]]} tone="req" />
            <Wire points={[[280, 104], [340, 104]]} tone="req" label="publish" labelAt={[310, 90]} />
            <Wire d="M450 104 C490 104 490 36 520 36" tone="res" />
            <Wire d="M450 104 C490 104 490 174 520 174" tone="res" />
            <Packet points={[[104, 104], [170, 104], [280, 104], [340, 104], [450, 104]]} dur={2.4} />
            <Tag x={640} y={36} tone="ok">Ravi</Tag>
            <Tag x={640} y={174} tone="ok">Meera</Tag>
          </Diagram>
          <Callout tone="note" title="Fan-out is real load">
            A group message to eight people is one send but eight deliveries. The broker and the gateways pay for deliveries,
            not sends.
          </Callout>
        </>
      ),
    },
    design("pubsub", {
      title: "Reaching the right gateway",
      short: "Pub/sub",
      minutes: 4,
      story:
        "Group chats go live and people complain that messages arrive only for friends on the same gateway. Group messages fan out to about eight people each.",
      palette: P.pubsub,
      knobs: KNOBS,
      hints: [
        "Look at the Delivery check: only a fraction of recipients get each message.",
        "Add a pub/sub broker. Wire every gateway to it, and wire it back to every gateway.",
        "Both directions matter: gateways publish into the broker, and the broker pushes out to gateways.",
      ],
      concepts: [
        { term: "Pub/sub", text: "Senders publish to a topic; every subscriber gets a copy. Neither side knows the other.", lesson: "pub-sub" },
        { term: "Fan-out", text: "One message turning into many deliveries. Group size multiplies the work.", lesson: "scaling-websockets" },
      ],
    }),
    design("ordering", {
      title: "Which message came first?",
      short: "Ordering",
      minutes: 4,
      story:
        "Ravi replies 'yes!' to Asha's 'coming?' but on Meera's phone the answer shows up before the question. Messages from different phones through different gateways don't arrive in the order they were sent.",
      palette: P.pubsub,
      knobs: KNOBS,
      hints: [
        "This isn't capacity. Open Design choices and look at how order is decided.",
        "Arrival order depends on network luck, and phone clocks drift by seconds.",
        "Pick the per-conversation sequence number: one writer numbers each conversation's messages.",
      ],
      concepts: [
        { term: "Causal vs total order", text: "You only need order within one conversation, not across the whole system.", lesson: "consistency-models" },
        { term: "Clock skew", text: "Two machines disagree about the time. Never order events by wall clocks you don't control.", lesson: "clocks" },
        { term: "Partitioning by key", text: "Route every message for one conversation to the same writer so numbering is easy.", lesson: "partitioning-strategies" },
      ],
    }),
    {
      type: "read",
      id: "read-offline",
      title: "When the phone isn't there",
      short: "Offline",
      minutes: 3,
      body: (
        <>
          <p>
            Phones lose signal, run out of battery or sit in a pocket with the app closed. A WebSocket only helps while a
            connection exists, so a message for an absent user needs a second path.
          </p>
          <ol>
            <li>
              <strong>Store</strong> the message durably, before acknowledging the sender.
            </li>
            <li>
              <strong>Push</strong> a notification through Apple or Google so the person knows. That&apos;s a call to a
              third-party API with its own rate limit, so it goes through a queue and workers.
            </li>
            <li>
              <strong>Sync</strong> on reconnect: the phone sends &quot;I have up to seq 412&quot; and the server returns
              everything after.
            </li>
          </ol>
          <KeyIdea>The push is only a nudge. The stored message and the seq-based sync are the delivery.</KeyIdea>
        </>
      ),
    },
    design("offline", {
      title: "Messages for sleeping phones",
      short: "Offline",
      minutes: 5,
      story:
        "About 800 messages a second are for people who aren't connected. They must be stored, and a push sent without hammering the push provider (it allows 2,000 calls a second and throttles beyond that).",
      palette: P.push,
      knobs: KNOBS,
      hints: [
        "Add an API server beside the gateways for the offline logic: gateway → server → database and queue.",
        "Queue → workers → third-party push provider. Workers call out; the request itself shouldn't.",
        "Open Design choices and set offline messages to be stored. At ~200 pushes a second per worker, four workers match 800 a second; run six.",
      ],
      concepts: [
        { term: "Store-and-forward", text: "Keep a message until the recipient can take it.", lesson: "queues-and-workers" },
        { term: "Push provider limits", text: "APNs and FCM throttle you. A queue turns bursts into a steady stream.", lesson: "retries-and-backoff" },
        { term: "Sync cursor", text: "A seq number per conversation lets a reconnecting phone ask for exactly what it missed.", lesson: "idempotency" },
      ],
    }),
    design("receipts", {
      title: "Two ticks, a lot of writes",
      short: "Receipts",
      minutes: 4,
      story:
        "Receipts go live. Every message now produces roughly two small updates (delivered, read): 8,000 a second, nearly twice the write capacity of your database.",
      palette: P.all,
      knobs: KNOBS,
      hints: [
        "Run it and read which node is over capacity.",
        "You can add shards, but cheaper: most receipts are overwritten moments later. Buffer them.",
        "Add Redis, wire the gateways to it, and set receipts to batch in the Design choices panel.",
      ],
      concepts: [
        { term: "Write coalescing", text: "Merge many small updates to the same thing into one write.", lesson: "write-strategies" },
        { term: "Write amplification", text: "One user action causing many database writes. Receipts double it.", lesson: "tradeoffs" },
      ],
    }),
    design("failure", {
      title: "A gateway dies",
      short: "Gateway failure",
      minutes: 4,
      story:
        "At the busiest hour a gateway's host fails. About 36,000 phones lose their connection at once and immediately try to reconnect.",
      palette: P.all,
      knobs: KNOBS_HC,
      hints: [
        "Turn on health checks on the load balancer so reconnecting phones aren't sent to the dead gateway.",
        "The survivors must hold everyone, including the reconnects. Do the maths on connections per gateway.",
        "With six gateways, five survivors hold exactly 50,000 each: no room. Add a seventh.",
      ],
      concepts: [
        { term: "Reconnect storm", text: "Every dropped client retries at once. Without room to spare, one failure cascades.", lesson: "retries-and-backoff" },
        { term: "N+1 gateways", text: "Run enough that losing any one leaves the rest under their limit.", lesson: "health-checks" },
      ],
    }),
    {
      type: "choose",
      id: "delivery",
      title: "How exact must delivery be?",
      short: "Delivery guarantees",
      minutes: 3,
      body: (
        <p>
          A phone disconnects between your server sending a message and the app confirming it. Did it arrive? You can&apos;t
          know. Your design has to pick what happens next.
        </p>
      ),
      prompt: "Which guarantee would you build?",
      options: [
        {
          id: "at-most",
          title: "At most once",
          summary: "Send it once and forget it. If the phone missed it, so be it.",
          pros: ["Simplest", "Never duplicates"],
          cons: ["Messages vanish on flaky networks", "Users lose trust quickly"],
          when: "Fine for ephemeral things like typing indicators or presence pings, never for messages.",
        },
        {
          id: "at-least",
          title: "At least once, deduplicate on the client",
          summary: "Keep sending until the phone acks. The client drops duplicates by message id and seq.",
          pros: ["Nothing is lost", "Cheap, uses ids you already have"],
          cons: ["Every client needs dedupe logic", "Retries add load during incidents"],
          when: "The default for chat. It's why the send API takes a client-generated id and the schema has a unique constraint.",
        },
        {
          id: "exactly",
          title: "Exactly once",
          summary: "Coordinate sender, broker and phone so each message is processed once.",
          pros: ["Conceptually clean"],
          cons: ["Needs distributed transactions or heavy coordination", "Slower, and still not truly achievable end to end"],
          when: "Almost never. At-least-once plus idempotency gives the same result for users at far lower cost.",
        },
      ],
      after: (
        <p>
          &quot;Exactly once&quot; in practice means <strong>at least once delivery plus idempotent handling</strong>. You
          already built both halves: the client id on the way in, the seq on the way out.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed a chat app",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You held connections open with <strong>gateways</strong>, connected them with <strong>pub/sub</strong>, ordered each
          conversation with <strong>sequence numbers</strong>, made offline users reachable with <strong>store, push and
          sync</strong>, shrank receipts with <strong>coalescing</strong>, and kept spare gateways for the day one dies. Presence,
          typing indicators and media come next, and each one follows the same pattern: find what breaks, add one idea.
        </p>
      ),
    },
  ],
};
