import { Box, Diagram, Packet, Text, Wire } from "@/components/diagram/kit";
import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Drill, DrillGraph } from "@/lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: DrillGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };

const K = {
  launch: [] as Knob[],
  blast: ["size"] as Knob[],
  slow: ["size"] as Knob[],
  lanes: ["size"] as Knob[],
  once: ["size", "shards"] as Knob[],
};

const P = {
  launch: ["client", "server", "external"] as DesignStep["palette"],
  blast: ["client", "lb", "server", "queue", "worker", "external"] as DesignStep["palette"],
  once: ["client", "lb", "server", "queue", "worker", "db", "cache", "external"] as DesignStep["palette"],
};

const design = (id: keyof typeof DESIGN, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief">): DesignStep => ({
  type: "design",
  id,
  ...DESIGN[id],
  debrief: DEBRIEFS[id],
  ...step,
});

export const notifications: Drill = {
  slug: "notifications",
  version: 1,
  title: "Design a notification system",
  product: "Notification system",
  intro: (
    <>
      <p>
        Gatepass has to tell people things: your ticket is confirmed, doors open at seven, the headliner has changed, here is your
        login code. Some go to one person and must arrive in seconds. Some go to a million people at once and can take a few
        minutes. All of them go through <strong>someone else&apos;s servers</strong>: an email provider, an SMS gateway, Apple
        and Google for push.
      </p>
      <p>
        That&apos;s what makes it hard. Providers rate-limit you, they have slow afternoons, and they sometimes accept a message
        and then fail to tell you. You&apos;ll build a pipeline that survives all of it: queues so the app never waits,
        workers that retry politely, separate lanes so a login code never waits behind a newsletter, and a guard so the same
        text is never sent twice.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Send by email, SMS or push", detail: "To one user or a whole audience, from a template." },
    { kind: "functional", text: "Respect preferences", detail: "A fan who turned off SMS gets no SMS." },
    { kind: "functional", text: "Report status", detail: "Anyone can ask whether a message was sent." },
    { kind: "non-functional", text: "Never block the caller", detail: "Sending is accepted in milliseconds; delivery happens after." },
    { kind: "non-functional", text: "Urgent means seconds", detail: "Login codes in 5 s, even during a campaign." },
    { kind: "non-functional", text: "Not lost, not doubled", detail: "Every message is delivered, and never twice." },
    { kind: "non-functional", text: "Survives provider trouble", detail: "Slow or failing providers don't take the app down." },
  ],
  estimates: [
    { label: "Transactional", value: "~250/s", math: "login codes + confirmations, ~20M a day" },
    { label: "Campaign blast", value: "~450/s", math: "4M messages spread over ~2.5 hours" },
    { label: "Campaign spike", value: "~900/s", math: "marketing sends everything at once, 2× for a few minutes" },
    { label: "Provider limit", value: "1,500/s", math: "the contract with the email/SMS gateway" },
  ],
  cacheParam: "id",
  cacheValues: [],
  related: {
    lessons: ["sync-vs-async", "queues-and-workers", "retries-and-backoff", "idempotency", "delivery-guarantees", "dead-letter-queues", "circuit-breakers"],
    drills: ["pastebin", "payments", "chat"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design a notification system",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first. Notifications are asynchronous, which changes both.",
        "On the canvas, add components and wire them the way a message travels: from the caller to the fan's phone.",
        "Run a load test. The simulator models capacity, queues, provider slowness and cost.",
        "Some choices (how to retry, how to avoid doubles) are settings on a worker. Click it to see them.",
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
            Sending a notification is different from most requests: it can&apos;t finish while the caller waits. The provider
            takes hundreds of milliseconds, may be down, and the real outcome (the phone buzzing) happens even later.
          </p>
          <p>
            Design one endpoint per requirement: the method, the path, the JSON fields in and out, and a status code that tells the
            truth about how far the request got.
          </p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <>
          <p className="mb-2 text-[16px] font-semibold text-fg">202 is a promise, the key makes it safe</p>
          <p>
            <strong>202 Accepted</strong> means “I wrote it down and will try”. It doesn&apos;t mean delivered. Callers who never
            see the reply (a timeout, a dropped connection) will send again. The <strong>idempotency key</strong> is how the
            server recognises the repeat and answers with the first result instead of sending another text.
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
            Every notification is a small record with a life: queued, sent, failed. Writes are heavy (every message at least once
            or twice), reads are rare (support looking something up), and one rule matters above all: the same idempotency key
            must never produce two sends.
          </p>
          <p>Pick an engine, then shape the tables. Include where preferences live, since workers check them before sending.</p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          A <strong>unique</strong> idempotency key turns a hope into a guarantee: if two workers race to record the same
          message, the database lets exactly one in. Remember this column; the last design step leans on it.
        </p>
      ),
    },
    design("launch", {
      title: "Launch: send from the API",
      short: "Launch",
      minutes: 3,
      story:
        "Gatepass starts confirming tickets by email. Forty a second, one provider. The simplest thing that works: the API server calls the provider and answers the fan when it's done.",
      palette: P.launch,
      knobs: K.launch,
      startGraph: START,
      hints: [
        "You need code to receive the request and something to actually deliver the email. The provider is a Third-party API.",
        "Wire Users → API server → Third-party API.",
        "One small server and the provider. No queue yet, you'll earn that in the next step.",
      ],
      concepts: [
        { term: "Third-party API", text: "A system you don't run and can't fix. It has its own rate limits and its own bad days.", lesson: "service-communication" },
        { term: "Synchronous call", text: "The caller waits for the answer. Simple, but every delay downstream becomes your delay.", lesson: "sync-vs-async" },
      ],
    }),
    {
      type: "read",
      id: "read-queue",
      title: "Don't make the fan wait for the email",
      short: "Queues",
      minutes: 3,
      body: (
        <>
          <p>
            Sending inline ties your latency to the provider&apos;s. A festival announcement then makes it worse: thousands of
            requests arrive at once, each holding a server thread while waiting 300 ms for a slow gateway. And the provider
            only accepts <strong>1,500 a second</strong>, however fast you can ask.
          </p>
          <p>
            Put a <strong>queue</strong> between the request and the send. The API writes the message down (a few milliseconds)
            and answers 202. <strong>Workers</strong> take messages off the queue at whatever pace the provider tolerates.
          </p>
          <Diagram w={640} h={170} caption="The queue turns a spike into a line. The line drains at the provider's speed.">
            <Box x={10} y={59} w={100} label="API" icon="server" />
            <Box x={170} y={59} w={120} label="Queue" sub="holds the line" icon="queue" tone="accent" />
            <Box x={350} y={59} w={110} label="Workers" icon="worker" />
            <Box x={520} y={59} w={110} label="Provider" icon="service" dim />
            <Wire points={[[110, 85], [170, 85]]} tone="req" />
            <Wire points={[[290, 85], [350, 85]]} tone="req" />
            <Wire points={[[460, 85], [520, 85]]} tone="req" />
            <Packet points={[[110, 85], [170, 85]]} dur={0.7} />
            <Packet points={[[110, 85], [170, 85]]} dur={0.7} delay={0.2} />
            <Packet points={[[110, 85], [170, 85]]} dur={0.7} delay={0.4} />
            <Packet points={[[290, 85], [460, 85], [520, 85]]} dur={2.4} />
            <Text x={230} y={140} size={11} anchor="middle" tone="muted">
              fast in, steady out
            </Text>
          </Diagram>
          <KeyIdea>If the work doesn&apos;t have to finish before you answer, don&apos;t do it before you answer.</KeyIdea>
        </>
      ),
    },
    design("blast", {
      title: "Festival announcement",
      short: "Queue + workers",
      minutes: 5,
      story:
        "Marketing announces the surprise headliner to the whole audience. Hundreds of messages a second arrive with the usual ticket confirmations, and the API must still answer in milliseconds. Sending inline at this volume would hold every request hostage to the provider.",
      palette: P.blast,
      knobs: K.blast,
      hints: [
        "Run the current design first and read the p99: what is the API waiting for?",
        "Put a queue after the server and workers after the queue. Workers talk to the provider; the server doesn't any more.",
        "Each worker handles about 400 messages a second here. Two or three is plenty; watch worker utilisation, not just success.",
      ],
      concepts: [
        { term: "Queue", text: "Accepts work instantly and hands it out at the consumer's pace.", lesson: "queues-and-workers" },
        { term: "Queue lag", text: "How long a message waits before a worker picks it up. The honest measure of a backlog.", lesson: "queues-and-workers" },
        { term: "202 Accepted", text: "Received, not finished.", lesson: "sync-vs-async" },
      ],
    }),
    {
      type: "read",
      id: "read-retries",
      title: "Providers have bad days",
      short: "Retries",
      minutes: 3,
      body: (
        <>
          <p>
            Soon the provider will slow down, then start failing some calls. Your workers need a policy for a failed send. There
            are three, and two are wrong.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Drop it.</strong> Fast, but a few percent of ticket confirmations vanish, and nobody notices until a fan
              calls.
            </li>
            <li>
              <strong>Retry immediately.</strong> Feels responsible. But when the provider is struggling, every failure
              produces another call right away, so you triple the load on the thing that is already drowning.
            </li>
            <li>
              <strong>Retry with exponential backoff and jitter.</strong> Wait 1 s, then 2, 4, 8… with a random nudge so
              thousands of workers don&apos;t all retry at the same instant. Failures thin out as the provider recovers.
            </li>
          </ul>
          <Callout tone="warn" title="Slow is worse than down">
            A provider that answers in 2 seconds instead of 100 ms keeps each worker thread busy twenty times longer. Your
            fleet&apos;s capacity collapses without a single error. Queue lag is how you&apos;ll notice.
          </Callout>
          <KeyIdea>Retry later, not now; and spread the retries out.</KeyIdea>
        </>
      ),
    },
    design("slow", {
      title: "The provider slows down",
      short: "Slow provider",
      minutes: 6,
      story:
        "Five seconds into the afternoon the provider degrades: calls take longer and a quarter of them fail. The announcement is still going out. Click a worker to choose what it does on a failure, then size the fleet for slower calls.",
      palette: P.blast,
      knobs: K.slow,
      hints: [
        "Run the test. With the default setting, failed sends are dropped. Which is worse: late or lost?",
        "Open a worker's settings and compare the retry options. One of them helps the provider recover.",
        "Slower calls keep each worker busy longer, so the same workload needs more of them. Add workers until utilisation drops.",
      ],
      concepts: [
        { term: "Exponential backoff", text: "Wait longer after each failure. Gives a struggling dependency room to recover.", lesson: "retries-and-backoff" },
        { term: "Jitter", text: "Randomness added to waits so retries don't arrive in synchronized waves.", lesson: "retries-and-backoff" },
        { term: "Retry storm", text: "Immediate retries multiply load on a failing system, turning a slowdown into an outage.", lesson: "retries-and-backoff" },
      ],
    }),
    design("lanes", {
      title: "Codes behind a campaign",
      short: "Priority lanes",
      minutes: 6,
      story:
        "Marketing launches an early-bird campaign exactly when fans log in to buy. Login codes arrive at the same queue as the campaign. A code is useless after five seconds, and the bulk flow is spiking. Give urgent messages their own lane: a second queue with its own workers.",
      palette: P.blast,
      knobs: K.lanes,
      hints: [
        "Add a second queue and wire the servers to both. The simulator treats the extra queue as the urgent lane.",
        "Each queue needs workers of its own. If both queues share workers, a backlog still delays codes.",
        "Four workers per queue handles the spike with room. Keep the retry setting from the last step.",
      ],
      concepts: [
        { term: "Priority queues", text: "Separate lines for separate urgency, so a flood in one can't delay the other.", lesson: "queues-and-workers" },
        { term: "Head-of-line blocking", text: "A slow or large item at the front of a single line delays everything behind it.", lesson: "queues-and-workers" },
        { term: "Isolation", text: "Capacity reserved for what matters most, so a spike elsewhere can't starve it.", lesson: "common-mistakes" },
      ],
    }),
    {
      type: "read",
      id: "read-idempotency",
      title: "Exactly once is a trick",
      short: "Idempotency",
      minutes: 3,
      body: (
        <>
          <p>
            Retries have a cost. Imagine the provider sends the SMS, then the reply is lost. Your worker sees a timeout and
            tries again. The fan gets two texts. Or ten, if a message is retried repeatedly. Networks can guarantee a message
            arrives <em>at least once</em> or <em>at most once</em>; there is no setting for <em>exactly once</em>.
          </p>
          <p>
            What you can build is <strong>at-least-once delivery plus an idempotent receiver</strong>: give every message an id,
            and make doing it twice the same as doing it once. The cleanest way is to <strong>claim</strong> the id first: insert
            it under a unique constraint and send only if the insert succeeded. A &quot;look it up, then send&quot; check leaves a gap
            where two workers can both see &quot;not sent&quot;.
          </p>
          <KeyIdea>You can&apos;t stop the network from repeating itself, so make repeating harmless.</KeyIdea>
        </>
      ),
    },
    design("once", {
      title: "Never send twice",
      short: "Idempotency",
      minutes: 6,
      story:
        "The provider is shaky again, and this time some sends succeed on its side while the reply times out. Your workers retry them. Without protection, fans receive the same text repeatedly. Workers need somewhere to record what they've sent, and a way to claim a message atomically.",
      palette: P.once,
      knobs: K.once,
      hints: [
        "Workers need to remember which message ids they've handled. Where do you store small, strongly consistent facts?",
        "Wire the workers to a database, then open a worker's settings and choose how it guards against duplicates.",
        "Claiming the id before sending (a unique insert) beats checking and sending, which can race. Five workers per queue handles the slower provider.",
      ],
      concepts: [
        { term: "Idempotency", text: "Doing it twice has the same effect as doing it once.", lesson: "idempotency" },
        { term: "At-least-once", text: "Never lost, sometimes repeated. The practical default for queues.", lesson: "delivery-guarantees" },
        { term: "Atomic claim", text: "A single operation that either wins the id or learns someone else did. No gap in between.", lesson: "idempotency" },
      ],
    }),
    {
      type: "choose",
      id: "prefs",
      title: "Where do opt-outs get checked?",
      short: "Preferences",
      minutes: 3,
      body: (
        <p>
          A fan turns off SMS at 2:00. A campaign was queued at 1:55 and is still draining at 2:10. Which side of the queue
          decides whether this fan gets a text? The answer changes what a preference change actually means.
        </p>
      ),
      prompt: "Which would you build?",
      options: [
        {
          id: "enqueue",
          title: "Check when enqueuing",
          summary: "The API looks up preferences and only queues messages the fan accepts.",
          pros: ["Nothing wasted: unwanted messages never enter the queue", "Workers stay simple and fast"],
          cons: ["A fan who opts out at 2:00 still gets the text queued at 1:55", "Enqueuing a million messages means a million preference lookups up front"],
          when: "When messages are delivered within seconds anyway, so the window is tiny.",
        },
        {
          id: "send",
          title: "Check when sending",
          summary: "Workers check preferences right before calling the provider.",
          pros: ["An opt-out takes effect immediately, even for queued messages", "Handles quiet hours naturally: delay instead of drop"],
          cons: ["Every send does an extra lookup, so cache preferences", "Queue holds messages that will be thrown away"],
          when: "When trust and law matter: marketing, regulated channels. Opting out must mean now.",
        },
        {
          id: "both",
          title: "Check at both ends",
          summary: "Filter at enqueue to avoid waste, and re-check at send for correctness.",
          pros: ["Cheap bulk filtering plus a last-moment safety net", "Best behaviour for fans"],
          cons: ["Two code paths to keep consistent", "More moving parts to test"],
          when: "Large campaigns. Most mature systems end up here.",
        },
      ],
      after: (
        <p>
          Every queue creates a gap between the decision and the action. Anything that can change in that gap (preferences,
          quiet hours, a cancelled event) has to be re-checked on the far side, or you must accept the stale decision.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed a notification system",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You moved sending <strong>off the request path</strong> with a queue and workers, let the queue absorb spikes, survived a
          slow provider with <strong>retries and backoff</strong>, protected urgent messages with <strong>separate lanes</strong>, and
          made repeats harmless with <strong>an atomically claimed idempotency key</strong>. The same four ideas appear in payments,
          order processing and anything else that talks to the outside world.
        </p>
      ),
    },
  ],
};
