import { Box, Diagram, Group, Packet, Tag, Text, Wire } from "@/components/diagram/kit";
import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Lab, LabGraph } from "@/lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: LabGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };
const P = {
  sync: ["client", "server", "db", "external"] as DesignStep["palette"],
  lb: ["client", "lb", "server", "db", "external"] as DesignStep["palette"],
  jobs: ["client", "lb", "server", "db", "queue", "worker", "external"] as DesignStep["palette"],
};

const design = (id: keyof typeof DESIGN, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief" | "flows" | "incident" | "incidentText" | "nodeDefaults" | "customKnobs" | "customChecks" | "customCheckLabels">): DesignStep => ({
  type: "design",
  id,
  ...DESIGN[id],
  debrief: DEBRIEFS[id],
  ...step,
});

export const payments: Lab = {
  slug: "payments",
  version: 1,
  title: "Design a payment system",
  product: "Payment system",
  intro: (
    <>
      <p>
        Every Gatepass ticket ends with someone&apos;s money moving. A payment system looks like a single API call to a provider,
        and that is exactly why it goes wrong: networks drop responses, providers time out, phones retry, servers crash between
        two lines of code, and every one of those failures is a chance to charge someone twice or lose a payment entirely.
      </p>
      <p>
        The goal is simple to say and hard to build: <strong>money moves exactly once</strong>. You&apos;ll design it step by step:
        idempotency keys, a queue between you and a flaky provider, the outbox pattern for events, an append-only ledger, and a
        nightly reconciliation that checks your own work.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Charge a card through a provider", detail: "You never touch raw card numbers; the provider does." },
    { kind: "functional", text: "Report the outcome", detail: "Pending, succeeded or failed, by polling and by event." },
    { kind: "functional", text: "Refund fully or partly", detail: "For cancelled shows, once per request." },
    { kind: "functional", text: "Record every movement of money", detail: "Who paid, who is owed, and when." },
    { kind: "non-functional", text: "Exactly once", detail: "A retry, a double tap or a timeout never charges twice." },
    { kind: "non-functional", text: "Never lose an event", detail: "Orders, emails and invoices follow every payment." },
    { kind: "non-functional", text: "Auditable", detail: "Every cent can be traced; the books balance." },
    { kind: "non-functional", text: "Survive a flaky provider", detail: "Slow, failing or silent for minutes at a time." },
  ],
  estimates: [
    { label: "Payments at peak", value: "~80/s", math: "7M a day, bunched around evening on-sales" },
    { label: "Ledger entries", value: "2 per payment", math: "one debit, one credit, always summing to zero" },
    { label: "Provider latency", value: "~300 ms", math: "healthy; seconds during incidents" },
    { label: "Workers in an incident", value: "~13", math: "80/s × ~1.2 s per slow call ÷ 8 threads" },
  ],
  cacheParam: "payment",
  cacheValues: [],
  related: {
    lessons: ["idempotency", "outbox-pattern", "retries-and-backoff", "delivery-guarantees", "queues-and-workers", "sagas", "event-sourcing", "two-phase-commit"],
    labs: ["ticket-booking", "url-shortener"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design a payment system",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first. Money is stored as whole units, and one unique index will do a lot of work.",
        "On the canvas, add components and wire them the way requests travel.",
        "Several traffic types run at once: charges, retries, events and payouts.",
        "Some correctness cannot be seen in graphs. Choose settings in the design panel and the tests will tell you what breaks.",
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
            A payment API is a promise about repetition. A client that does not get a response will try again, because it has no
            choice. Your endpoints have to make trying again safe.
          </p>
          <p>Design an endpoint for each requirement. Pay attention to how money is typed and what a retry looks like.</p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <p>
          Two details carry the whole design: amounts are <strong>integers</strong> in the smallest unit, and every operation that
          creates a charge carries an <strong>idempotency key</strong> chosen by the client. A retry then repeats the same
          request, and the server can say &quot;I already did that&quot;.
        </p>
      ),
    },
    {
      type: "schema",
      id: "schema",
      title: "Model the money",
      short: "Ledger design",
      minutes: 6,
      body: (
        <>
          <p>
            Three tables do the work. <strong>payments</strong> is a state machine for one charge. <strong>ledger_entries</strong>{" "}
            records every movement of money as an immutable row. <strong>outbox</strong> holds events that must be published.
          </p>
          <p>
            Pick an engine, then shape the tables. The unique index on the idempotency key and the whole-unit amounts are the
            parts that stop real bugs.
          </p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          Notice what you never do: update an amount, delete a row or store money in a float. A refund is a new pair of entries,
          not an edit. History is the product.
        </p>
      ),
    },
    design("launch", {
      title: "First payments",
      short: "Launch",
      minutes: 3,
      story: "Gatepass takes its first card payments: 40 a second. Call the provider inline and write the result down.",
      palette: P.sync,
      knobs: ["size"] as Knob[],
      startGraph: START,
      hints: ["Wire Users → API server, then the server to the database and to the payment provider.", "The provider appears as a Third-party API in the palette.", "One small server is enough at 40/s."],
      concepts: [{ term: "External dependency", text: "A service you do not run. It has its own rate limit and bad days, and your design must assume both.", lesson: "service-communication" }],
    }),
    {
      type: "read",
      id: "read-idempotency",
      title: "What if the response never arrives?",
      short: "Idempotency",
      minutes: 4,
      body: (
        <>
          <p>Priya taps Pay. Your server charges her card. The response is lost in a tunnel. Her phone sees a timeout and retries.</p>
          <p>
            From the phone&apos;s side the two outcomes look identical: &quot;it failed&quot; and &quot;it worked but I did not
            hear&quot;. If a retry is a new payment, one of those outcomes charges her twice.
          </p>
          <Diagram w={640} h={170} caption="The same key arrives twice. The database answers the second time.">
            <Box x={10} y={60} w={100} label="Phone" icon="phone" />
            <Box x={190} y={60} w={120} label="API" icon="server" />
            <Box x={390} y={20} w={120} label="payments" sub="UNIQUE(key)" icon="db" tone="accent" />
            <Box x={390} y={100} w={120} label="Provider" icon="service" dashed />
            <Wire points={[[110, 86], [190, 86]]} tone="req" label="key: k9" labelAt={[118, 76]} />
            <Wire d="M310 80 C350 80 350 46 390 46" tone="req" />
            <Wire d="M310 94 C350 94 350 126 390 126" tone="req" dashed />
            <Tag x={530} y={46} tone="ok">2nd: same row</Tag>
            <Text x={530} y={130} size={11} tone="muted">
              charged once
            </Text>
            <Packet points={[[110, 86], [190, 86], [310, 86]]} dur={2} />
          </Diagram>
          <p>
            An <strong>idempotency key</strong> is a unique string the client generates once per intended payment and sends with
            every attempt. The server stores the key with the payment under a unique constraint. A repeat hits the constraint and
            returns the stored result.
          </p>
          <Callout tone="warn" title="Where the key lives matters">
            Keep it in the same database, in the same transaction as the payment. A key in Redis disappears on restart; a key
            checked in code but written separately leaves a gap where two requests both pass the check.
          </Callout>
        </>
      ),
    },
    design("idempotency", {
      title: "Double taps",
      short: "Idempotency keys",
      minutes: 4,
      story: "One in six taps is repeated: a nervous double tap, a retry after a dropped response, an impatient second tab. 40 of every 240 requests are duplicates.",
      palette: P.sync,
      knobs: ["size"] as Knob[],
      hints: ["The graph is fine; the question is what the server does with a repeat.", "Look at the 'Duplicate requests' setting in the design panel.", "Only a unique key stored with the payment is reliable."],
      concepts: [{ term: "Idempotency", text: "Doing something twice has the same effect as doing it once.", lesson: "idempotency" }],
    }),
    design("timeouts", {
      title: "The provider times out",
      short: "Timeouts & retries",
      minutes: 6,
      story: "The provider starts answering in 900 ms and failing three charges in ten. Calling it inline ties up your servers. Retrying carelessly makes it worse.",
      palette: P.jobs,
      knobs: ["size", "shards"] as Knob[],
      hints: ["Take the provider call out of the request: server → Queue → Workers → provider.", "A slow call holds a worker thread. Count how many you need.", "Set retries to backoff with jitter, and keep the idempotency key from the last step."],
      concepts: [
        { term: "Backoff + jitter", text: "Wait longer after every failure, with randomness, so many clients do not retry in lockstep.", lesson: "retries-and-backoff" },
        { term: "Queue as shock absorber", text: "A queue turns a provider's bad minute into a short delay instead of an outage.", lesson: "queues-and-workers" },
      ],
    }),
    {
      type: "read",
      id: "read-outbox",
      title: "The dual-write problem",
      short: "Outbox",
      minutes: 4,
      body: (
        <>
          <p>After a payment succeeds, three things must happen: send the confirmation email, issue the ticket, tell finance. A natural handler does this:</p>
          <ol className="list-decimal pl-5">
            <li>save the payment in the database</li>
            <li>publish &quot;payment.succeeded&quot; to the queue</li>
          </ol>
          <p>
            Two systems, two writes, no transaction spanning both. If the process dies between them, the money moved and nobody
            was told. If you reverse the order, you tell everyone about a payment that was never saved.
          </p>
          <Diagram w={640} h={170} caption="One transaction writes the payment and the event; a relay publishes it later.">
            <Box x={10} y={60} w={110} label="API" icon="server" />
            <Group x={170} y={10} w={190} h={150} label="One transaction" tone="accent" />
            <Box x={185} y={40} w={160} h={44} label="payments" icon="db" />
            <Box x={185} y={96} w={160} h={44} label="outbox" icon="db" />
            <Box x={410} y={60} w={100} label="Relay" icon="worker" />
            <Box x={550} y={60} w={80} label="Queue" icon="queue" />
            <Wire points={[[120, 86], [170, 86]]} tone="req" />
            <Wire points={[[360, 86], [410, 86]]} />
            <Wire points={[[510, 86], [550, 86]]} tone="res" />
          </Diagram>
          <p>
            The <strong>outbox pattern</strong> makes it one write: insert the event into an <code>outbox</code> table in the same
            transaction as the payment. A relay reads unpublished rows, publishes them, then marks them sent. The relay may
            publish and crash before marking, so events can arrive twice, which is fine if receivers skip ids they have seen.
          </p>
          <KeyIdea>You cannot make two systems atomic, but you can make one system atomic and let the other catch up.</KeyIdea>
        </>
      ),
    },
    design("outbox", {
      title: "A crash between two writes",
      short: "Outbox pattern",
      minutes: 5,
      story: "A server crashes right after saving a payment and before announcing it. The invoice never goes out. Eighty payments a second means this happens all day.",
      palette: P.jobs,
      knobs: ["size", "shards", "healthChecks"] as Knob[],
      hints: ["Switch 'Announcing a payment' to the outbox, and have consumers skip duplicates.", "A relay needs a queue and a worker. They already exist from the last step.", "A crashed server needs a replacement: a load balancer with health checks and a second server."],
      concepts: [
        { term: "Outbox pattern", text: "Write the event to a table in the same transaction as the state change, and publish it from there.", lesson: "outbox-pattern" },
        { term: "At-least-once delivery", text: "Messages may repeat. Consumers must be idempotent.", lesson: "delivery-guarantees" },
      ],
    }),
    design("ledger", {
      title: "Payout day",
      short: "Ledger design",
      minutes: 5,
      story: "At midnight Gatepass pays out every organiser. Ledger postings jump tenfold for twelve seconds, and every posting touches the same few platform accounts.",
      palette: P.jobs,
      knobs: ["size", "shards", "healthChecks"] as Knob[],
      hints: ["Run it and read the database: one shard is hot, and more shards will not fix that.", "A balance column is one row everybody updates. Switch the ledger to append-only entries.", "Then add a shard so the postings share the work."],
      concepts: [
        { term: "Double-entry ledger", text: "Every movement is two entries, a debit and a credit, that sum to zero. Balances are derived.", lesson: "event-sourcing" },
        { term: "Hot row", text: "One record that every writer needs. More machines do not help; spreading the writes does.", lesson: "hot-keys" },
      ],
    }),
    design("reconcile", {
      title: "The books disagree",
      short: "Reconciliation",
      minutes: 5,
      story: "Finance finds that the provider says it moved ₹3.2 lakh your ledger knows nothing about. A webhook was lost during an incident last month. Nobody noticed until the audit.",
      palette: P.jobs,
      knobs: ["size", "shards", "healthChecks"] as Knob[],
      hints: ["Reconciliation is a background job: it needs a queue, a worker, the ledger and the provider's settlement data.", "Wire the job's worker to both the database and the provider.", "Set 'Checking your books' to a nightly job."],
      concepts: [{ term: "Reconciliation", text: "Comparing your records with an outside source of truth and investigating every difference.", lesson: "batch-processing" }],
    }),
    {
      type: "choose",
      id: "choose-events",
      title: "How should events leave the database?",
      short: "Events deep dive",
      minutes: 4,
      prompt: "You need 'payment succeeded' to reach email, tickets and finance reliably. Which approach would you ship?",
      body: <p>All of these are used in production. Each one trades simplicity against guarantees.</p>,
      options: [
        {
          id: "dual",
          title: "Write, then publish",
          summary: "Save to the database, then send the message.",
          pros: ["Trivial to write", "Low latency"],
          cons: ["A crash between the steps loses the event", "Failures are silent and rare, so you find out from customers"],
          when: "Never for money. Fine for best-effort notifications.",
        },
        {
          id: "outbox",
          title: "Transactional outbox",
          summary: "Event row in the same transaction, relayed afterwards.",
          pros: ["Atomic with the business change", "Works with any message broker", "Easy to replay"],
          cons: ["A relay to run and monitor", "At-least-once: consumers must dedupe", "Adds latency of a poll interval"],
          when: "The default for events that must not be lost.",
        },
        {
          id: "cdc",
          title: "Change data capture",
          summary: "Tail the database's own log (Debezium-style) and publish every change.",
          pros: ["No outbox table in your code", "Captures changes from any writer", "Very low latency"],
          cons: ["Needs log access and operational skill", "Event shape is tied to table shape", "Another system to run"],
          when: "Many services share a database and you want events without touching their code.",
        },
        {
          id: "sourcing",
          title: "Event sourcing",
          summary: "The log of events is the database; state is derived.",
          pros: ["Perfect audit trail", "Replay any moment in history"],
          cons: ["Large change to how everything is built", "Reads need projections", "Hard to retrofit"],
          when: "Ledgers and audit-heavy domains where history is the product.",
        },
      ],
      after: <p>For a team shipping this month the outbox is the quiet winner. CDC is what you move to once many teams write to the same tables.</p>,
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed a payment system",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You made a repeat harmless with an <strong>idempotency key</strong>, protected checkout from a slow provider with a{" "}
          <strong>queue and backoff</strong>, made events reliable with an <strong>outbox</strong>, recorded money in an{" "}
          <strong>append-only ledger</strong> and checked your own work with <strong>reconciliation</strong>. The common thread:
          assume every call can fail after succeeding, design every step to be safe to repeat, and keep a record you can audit.
        </p>
      ),
    },
  ],
};
