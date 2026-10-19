import { Box, Diagram, Packet, Wire } from "@/components/diagram/kit";
import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Lab, LabGraph } from "@/lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN, type StepId } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: LabGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };
const KNOBS: Knob[] = ["size"];
const KNOBS_DB: Knob[] = ["size", "shards"];

const P = {
  base: ["client", "server", "db"] as DesignStep["palette"],
  votes: ["client", "lb", "server", "cache", "db"] as DesignStep["palette"],
  jobs: ["client", "lb", "server", "cache", "db", "queue", "worker"] as DesignStep["palette"],
  all: ["client", "limiter", "lb", "server", "cache", "db", "queue", "worker"] as DesignStep["palette"],
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




export const rankedFeed: Lab = {
  slug: "ranked-feed",
  version: 1,
  title: "Design a ranked feed",
  product: "Ranked feed",
  intro: (
    <>
      <p>
        Gatepass Fan Wall is where fans share posters, setlists and clips from gigs, and vote the best ones to the top. After a
        big festival weekend the wall takes tens of thousands of votes a second, and everyone refreshes it to see what&apos;s
        winning.
      </p>
      <p>
        This is the opposite of most products. <strong>Writes dominate</strong>: every vote changes a number that a million
        people are also reading. A hot post turns one database row into the busiest thing you own, the ranking is a computation
        nobody wants to repeat on every page view, and the moment votes decide who gets seen, somebody tries to cheat. You&apos;ll
        meet each in turn.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Submit posts", detail: "A title and a link." },
    { kind: "functional", text: "Vote up or down", detail: "One vote per person per post, changeable." },
    { kind: "functional", text: "A front page of what's hot", detail: "Ranked by votes weighed against age." },
    { kind: "non-functional", text: "Absorb a vote storm", detail: "Tens of thousands a second, mostly on a handful of posts." },
    { kind: "non-functional", text: "Fresh enough", detail: "The ranking may be seconds old; it must never be minutes." },
    { kind: "non-functional", text: "Fair", detail: "Bots and brigades shouldn't be able to push a post to the top." },
    { kind: "non-functional", text: "Cheap to run", detail: "Each step sets a budget." },
  ],
  estimates: [
    { label: "Votes", value: "~30,000/s peak", math: "2M voters in an hour, ~54 votes each ≈ 30k/s" },
    { label: "Hot post share", value: "~90% on a few posts", math: "a viral post draws most of the votes: one row takes most of the writes" },
    { label: "Front page reads", value: "~50,000/s", math: "100× the post rate; everyone sees the same page" },
    { label: "Ranking job", value: "scan every few seconds", math: "100k recent posts × a score formula ≈ 1 s of CPU per pass" },
  ],
  cacheParam: "post",
  cacheValues: [],
  related: {
    lessons: ["write-strategies", "hot-keys", "queues-and-workers", "why-rate-limit", "what-to-limit-by", "cache-invalidation"],
    labs: ["news-feed", "url-shortener", "presence"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design a ranked feed",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first.",
        "On the canvas, votes (writes), front-page reads and a background ranking job all share the same machines.",
        "Open the Design choices panel for decisions the picture can't show: counter layout and what the limiter counts.",
        "Meet every constraint to unlock the next problem.",
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
            Three calls: submit, vote, and read the front page. The vote is the one that will take the beating, so think about
            what happens when it is retried, replayed, or sent by a script.
          </p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <p>
          A vote that&apos;s <strong>idempotent</strong> (&quot;set my vote to up&quot;, not &quot;add one&quot;) is a small
          choice with a big payoff: retries become harmless and one account can&apos;t inflate a score by repeating itself.
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
            Two things hold the product together. The <strong>votes</strong> table is the record of truth: who voted for what.
            The <strong>count and rank</strong> on each post are derived from it, stored so reads don&apos;t have to add up
            thousands of rows.
          </p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          You now have two representations of a score: the votes (exact, durable) and the count (fast, slightly behind). Keeping
          them in agreement is the whole job of the next three steps.
        </p>
      ),
    },
    design("launch", {
      title: "The first votes",
      short: "Launch",
      minutes: 3,
      story: "The wall opens. A few hundred votes a second, a few hundred people watching the ranking. Everything is easy.",
      palette: P.base,
      knobs: KNOBS,
      startGraph: START,
      hints: ["Users → API server → database.", "A vote increments a counter; the front page reads the top posts.", "One small server and one database."],
      concepts: [
        { term: "Counter", text: "A number incremented by many writers.", lesson: "write-strategies" },
        { term: "Write vs read cost", text: "A write touches indexes, the log and the disk; a read can come from memory.", lesson: "latency-numbers" },
      ],
    }),
    {
      type: "read",
      id: "read-counters",
      title: "Write-heavy counters",
      short: "Counters",
      minutes: 4,
      body: (
        <>
          <p>
            Most systems are read-heavy and caches rescue them. Here the load is writes: a viral post may take 90% of 30,000
            votes a second, and every one is <code>UPDATE posts SET votes = votes + 1</code> on the same row. The database
            serialises writers on a row, so it processes them one after another no matter how many cores you add.
          </p>
          <Diagram w={680} h={190} caption="A hot row is a queue of one.">
            <Box x={0} y={72} w={110} label="30,000 votes/s" icon="client" />
            <Box x={200} y={72} w={110} label="Server" icon="server" />
            <Box x={400} y={72} w={130} label="posts row 7731" icon="db" tone="err" />
            <Wire points={[[110, 98], [200, 98]]} tone="req" />
            <Wire points={[[310, 98], [400, 98]]} tone="req" label="one at a time" labelAt={[355, 84]} />
            <Packet points={[[110, 98], [200, 98], [310, 98], [400, 98]]} dur={1.2} />
            <Packet points={[[110, 98], [200, 98], [310, 98], [400, 98]]} dur={1.2} delay={0.4} />
            <Packet points={[[110, 98], [200, 98], [310, 98], [400, 98]]} dur={1.2} delay={0.8} />
          </Diagram>
          <p>There are two ways out.</p>
          <ul>
            <li>
              <strong>Spread the writes.</strong> Keep a post&apos;s count in many rows (a <em>sharded counter</em>); each vote
              picks one, and reading adds them. Throughput scales with shards, and so does the bill.
            </li>
            <li>
              <strong>Batch the writes.</strong> Count votes in Redis (atomic, in memory, 100k+ ops a second) and flush the
              totals to the database every second. One write replaces hundreds. The cost is a brief lag and care if Redis
              restarts; the votes table still records every vote durably.
            </li>
          </ul>
          <KeyIdea>If you can&apos;t make a write cheaper, make fewer of them.</KeyIdea>
        </>
      ),
    },
    design("votes", {
      title: "A vote storm",
      short: "Vote storm",
      minutes: 6,
      story: "The headliner's after-party video goes up and 30,000 votes a second pour in, about 90% for that one post. One database node takes 8,000 writes a second, and this is one row.",
      palette: P.votes,
      knobs: KNOBS_DB,
      hints: [
        "Run it and look at the database: it's write-bound, and the hot row is the problem.",
        "Two routes: spread the counter over shards (select the layout on the database), or buffer the votes in Redis.",
        "Buffering is cheaper. Wire the servers to Redis; it absorbs ~98% of votes and flushes the rest in batches. Three medium servers carry 30k requests a second.",
      ],
      concepts: [
        { term: "Hot row", text: "One row taking most of the writes. More machines don't help; more rows do.", lesson: "hot-keys" },
        { term: "Write batching", text: "Accumulate many small writes in memory and flush one combined write.", lesson: "write-strategies" },
        { term: "Sharded counter", text: "A count stored as N partial counts, summed on read.", lesson: "hot-keys" },
      ],
    }),
    {
      type: "read",
      id: "read-ranking",
      title: "Ranking is a background job",
      short: "Ranking",
      minutes: 3,
      body: (
        <>
          <p>
            &quot;Hot&quot; isn&apos;t votes alone. A post with 500 votes from yesterday shouldn&apos;t outrank one with 300
            from the last hour. Typical formulas divide votes by a power of the post&apos;s age, which means every post&apos;s
            score changes continuously, even when nobody votes.
          </p>
          <p>
            Computing the order means reading recent posts, scoring them and sorting. That&apos;s fine once; it&apos;s
            disastrous 25,000 times a second. And everyone sees <em>the same</em> answer, which is an invitation to compute
            it once and share it.
          </p>
          <Callout tone="tip" title="Recompute on a schedule, serve from memory">
            A worker re-ranks every few seconds and writes the top few hundred post ids to Redis. A page view reads that list
            and fetches the post bodies. If the job dies, the old list keeps serving; if it&apos;s slow, the ranking is a
            little stale.
          </Callout>
        </>
      ),
    },
    design("ranking", {
      title: "The front page is expensive",
      short: "Ranking job",
      minutes: 6,
      story: "25,000 people a second open the wall. Each page view re-sorts recent posts by their score, six queries deep. The database is on its knees even though the votes are now handled.",
      palette: P.jobs,
      knobs: KNOBS_DB,
      hints: [
        "Cache the ranking in Redis. Everyone reads the same list.",
        "Something has to fill it: a queue and workers that read the posts and write the result to Redis.",
        "Wire the API servers to the queue, the queue to workers, and the workers to both the database and Redis. Two workers are plenty at this volume.",
      ],
      concepts: [
        { term: "Precomputation", text: "Do the expensive work on a schedule, not per request.", lesson: "write-strategies" },
        { term: "Staleness budget", text: "How old an answer may be before users or the business care.", lesson: "tradeoffs" },
      ],
    }),
    design("frontpage", {
      title: "A post takes off",
      short: "Front page rush",
      minutes: 4,
      story: "One post spreads outside the app. For twelve seconds ranking reads double to 100,000 a second. Everyone gets the same answer, and the same answer is cached, but your servers still have to deliver it.",
      palette: P.jobs,
      knobs: KNOBS_DB,
      hints: [
        "Watch the timeline: which node saturates when the rush starts?",
        "The cache protects the database; the app servers still touch every request.",
        "Size the server tier for the rush, not the average: eight medium servers.",
      ],
      concepts: [
        { term: "Cache hit rate", text: "The share of reads the cache answers. At a 95% hit rate the database sees 5%.", lesson: "why-cache" },
        { term: "Headroom", text: "Capacity held in reserve for the spike you can't predict.", lesson: "autoscaling" },
      ],
    }),
    {
      type: "read",
      id: "read-abuse",
      title: "When votes become a prize",
      short: "Abuse",
      minutes: 3,
      body: (
        <>
          <p>
            Anything that decides what millions of people see will be gamed. A <strong>brigade</strong> is a swarm of fake or
            hijacked accounts voting a post to the top, or burying a rival. They arrive as a flood of ordinary-looking votes.
          </p>
          <p>
            A rate limiter in front of the app turns the flood away before it costs anything. What matters is{" "}
            <strong>what it counts</strong>:
          </p>
          <ul>
            <li>
              <strong>Per IP</strong>: easy, but botnets use thousands of IPs, and a campus or office shares one.
            </li>
            <li>
              <strong>Per account</strong>: stops one account from voting too fast, but accounts are cheap to make.
            </li>
            <li>
              <strong>Account age and velocity</strong>: new accounts get a small allowance, and a burst of fresh accounts all
              voting for one post is a signal in itself.
            </li>
          </ul>
        </>
      ),
    },
    design("brigade", {
      title: "A brigade shows up",
      short: "Brigading",
      minutes: 5,
      story: "A rival fan group sends 120,000 fake votes a second at one post from a rented botnet. Honest voters keep arriving too, including a whole college hostel behind a single IP address.",
      palette: P.all,
      knobs: KNOBS_DB,
      hints: [
        "Put a rate limiter in front of everything: Users → Rate limiter → Load balancer.",
        "Open Design choices and decide what the limiter counts. One option blocks real people on shared networks.",
        "Count by account, and add account age and velocity for the strongest effect. Keep the servers from the earlier steps; you may not need more.",
      ],
      concepts: [
        { term: "Rate limiting", text: "Reject traffic beyond a budget before it costs you anything.", lesson: "why-rate-limit" },
        { term: "What to limit by", text: "The key decides who gets punished: IP, account, API key, or a combination.", lesson: "what-to-limit-by" },
        { term: "False positives", text: "Real users caught by a rule meant for bots. Every anti-abuse rule has a price.", lesson: "tradeoffs" },
      ],
    }),
    {
      type: "choose",
      id: "decay",
      title: "How should a score age?",
      short: "Ranking formula",
      minutes: 3,
      body: (
        <p>
          Everything depends on the formula the ranking job runs. It&apos;s a product decision with technical consequences for
          how often the job must run.
        </p>
      ),
      prompt: "Which would you start with?",
      options: [
        {
          id: "votes",
          title: "Just net votes",
          summary: "Order by upvotes minus downvotes, forever.",
          pros: ["Trivial", "Cheap: only re-rank when a vote lands"],
          cons: ["Old posts squat at the top", "Nothing new can ever win"],
          when: "Fine for an 'all time best' page, never the front page.",
        },
        {
          id: "gravity",
          title: "Votes divided by age (time decay)",
          summary: "Score = votes ÷ (age + 2)^1.5. Everything slides down the page over time.",
          pros: ["New posts get a chance", "One formula, easy to tune"],
          cons: ["Every score changes every second, so the job must re-rank on a schedule", "Early votes matter far more than late ones"],
          when: "The standard for a 'hot' page. Re-rank every few seconds.",
        },
        {
          id: "windowed",
          title: "Votes in a recent window",
          summary: "Count only votes from the last few hours.",
          pros: ["Fresh by construction", "Resistant to old posts"],
          cons: ["Needs timestamps on votes and a sliding window store", "Quiet hours reshuffle everything"],
          when: "Good for a 'trending now' page layered on top of hot.",
        },
      ],
      after: (
        <p>
          Time decay is why the job exists at all. With plain votes you could update rank when a vote lands; with decay, scores
          move on their own and the ranking must be recomputed on a clock.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed a ranked feed",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You <strong>buffered writes</strong> so a hot counter stopped being a queue of one, moved the ranking into a{" "}
          <strong>background job</strong> with a cached result, sized the app tier for the <strong>rush</strong>, and put a{" "}
          <strong>limiter that counts the right thing</strong> in front. The thread through all of it: say precisely how fresh
          each number needs to be, then spend only that much.
        </p>
      ),
    },
  ],
};
