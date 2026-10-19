import { Box, Diagram, Packet, Tag, Wire } from "@/components/diagram/kit";
import { KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Lab, LabGraph } from "@/lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN, type StepId } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: LabGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };
const KNOBS: Knob[] = ["size"];
const KNOBS_DB: Knob[] = ["size", "shards"];

const P = {
  base: ["client", "server", "db", "storage"] as DesignStep["palette"],
  cdn: ["client", "cdn", "lb", "server", "db", "storage"] as DesignStep["palette"],
  all: ["client", "cdn", "lb", "server", "cache", "db", "storage", "queue", "worker"] as DesignStep["palette"],
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



export const newsFeed: Lab = {
  slug: "news-feed",
  version: 1,
  title: "Design a photo feed",
  product: "Photo feed",
  intro: (
    <>
      <p>
        Gatepass Moments lets fans post photos from gigs, follow each other, and scroll a feed of what their friends are doing.
        Open the app after a festival and it&apos;s a river of crowd shots.
      </p>
      <p>
        A feed is a question asked far more often than it is answered: &quot;what did the people I follow post?&quot; You can
        answer it when someone asks, or prepare the answer when someone posts. Both break differently. The interesting part is
        the account that breaks both: a celebrity with millions of followers. You&apos;ll build the feed, find the breaking
        point, and design around it.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Post a photo", detail: "A caption and one image." },
    { kind: "functional", text: "Follow people", detail: "Follow, unfollow, and a graph that can be very lopsided." },
    { kind: "functional", text: "A feed of what they posted", detail: "Newest first, paginated, loads in under a second." },
    { kind: "non-functional", text: "Fast reads", detail: "Feeds are opened about 100 times for every post." },
    { kind: "non-functional", text: "Photos load quickly everywhere", detail: "Served from the edge." },
    { kind: "non-functional", text: "A celebrity can post", detail: "Millions of followers must not stall anyone else's posts." },
    { kind: "non-functional", text: "A little staleness is fine", detail: "A post can take a few seconds to appear in feeds." },
  ],
  estimates: [
    { label: "Feed views", value: "~20,000/s peak", math: "50M daily users × ~10 opens ÷ 86,400 s × 3 for the evening peak" },
    { label: "Posts", value: "~100/s", math: "feed reads outnumber posts about 200 to 1" },
    { label: "Fan-out writes", value: "~20,000/s", math: "100 posts/s × ~200 followers each" },
    { label: "Celebrity post", value: "2,000,000 copies", math: "one post × 2M followers, if you push it everywhere" },
  ],
  cacheParam: "user",
  cacheValues: [],
  related: {
    lessons: ["why-cache", "write-strategies", "cdn-and-browser-cache", "queues-and-workers", "hot-keys", "object-storage"],
    labs: ["video-platform", "ranked-feed", "chat"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design a photo feed",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first.",
        "On the canvas, wire components for three kinds of traffic at once: photos, feed reads and new posts.",
        "Open the Design choices panel for the big decision: when does a feed get built?",
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
            Three actions make a social feed: post, follow and read. The read is the one to get right, because it runs ten times
            per user per day on a list that&apos;s constantly changing underneath.
          </p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <p>
          Cursor pagination isn&apos;t just a nicety here. If the feed were paged by number, a post arriving while someone
          scrolls would push every item down a slot and show them the same photo twice.
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
            Three relationships carry the product: <strong>who wrote a post</strong>, <strong>who follows whom</strong>, and
            (soon) <strong>what is in each person&apos;s timeline</strong>. Model all three, plus the number that will let you
            spot a celebrity.
          </p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          The timelines table is a <em>copy</em> of information you already have. That&apos;s deliberate: you&apos;re
          trading storage for speed, and you accept that the copy can lag the truth by a few seconds.
        </p>
      ),
    },
    design("launch", {
      title: "The first feed",
      short: "Launch",
      minutes: 3,
      story: "Moments opens to a few thousand fans. A feed view is a simple query: posts by people I follow, newest first. Photos live in object storage.",
      palette: P.base,
      knobs: KNOBS,
      startGraph: START,
      hints: [
        "Posts and follows are data; photos are files. Where does each live?",
        "Wire Users → API server, then the server to your database and to Object storage.",
        "One small server, one database, one bucket.",
      ],
      concepts: [
        { term: "Metadata vs content", text: "Rows describe the photo; the photo is a file in object storage.", lesson: "object-storage" },
        { term: "Feed query", text: "Select posts where author is in my follows, order by time. Cheap for 150 follows, costly for 5,000.", lesson: "data-modeling" },
      ],
    }),
    design("photos", {
      title: "Photos at festival scale",
      short: "Photos + CDN",
      minutes: 4,
      story: "A festival weekend: 60,000 photo requests a second. Photos are big and never change, but every one is travelling from your single bucket through your servers.",
      palette: P.cdn,
      knobs: KNOBS,
      hints: [
        "Object storage handles about 50,000 requests a second. This is over that, before the servers even try.",
        "Put a CDN in front: photos are the most cacheable thing you have.",
        "Wire Users → CDN → (load balancer) → API server. One medium server behind the CDN is enough.",
      ],
      concepts: [
        { term: "Immutable content", text: "A photo never changes, so any cache can keep it for as long as it likes.", lesson: "cdn-and-browser-cache" },
        { term: "Origin offload", text: "Every hit at the edge is a request your servers never see.", lesson: "why-cache" },
      ],
    }),
    {
      type: "read",
      id: "read-fanout",
      title: "Fan-out on read or on write",
      short: "Fan-out",
      minutes: 4,
      body: (
        <>
          <p>
            Feed views arrive twenty thousand times a second. Building one by querying the posts of everyone you follow means
            several database reads per view, over data that&apos;s scattered across authors. That&apos;s{" "}
            <strong>fan-out on read</strong> (pull): cheap to post, expensive to open.
          </p>
          <p>
            <strong>Fan-out on write</strong> (push) flips it. When Neha posts, a worker looks up her followers and appends the
            post id to each follower&apos;s <em>timeline</em> in a cache. Opening the feed is then one lookup.
          </p>
          <Diagram w={680} h={210} caption="Push: the work happens once, when someone posts, in the background.">
            <Box x={0} y={78} w={104} label="Neha posts" icon="phone" />
            <Box x={170} y={78} w={110} label="API" icon="server" />
            <Box x={340} y={78} w={100} label="Queue" icon="queue" tone="accent" />
            <Box x={500} y={78} w={110} label="Workers" icon="worker" />
            <Box x={500} y={10} w={110} h={46} label="Timelines" sub="cache" icon="cache" tone="accent" />
            <Wire points={[[104, 104], [170, 104]]} tone="req" />
            <Wire points={[[280, 104], [340, 104]]} tone="req" />
            <Wire points={[[440, 104], [500, 104]]} tone="req" />
            <Wire points={[[555, 78], [555, 56]]} tone="req" label="copy to 200 followers" labelAt={[560, 68]} />
            <Packet points={[[104, 104], [170, 104], [280, 104], [340, 104], [440, 104], [500, 104]]} dur={2.8} />
            <Tag x={170} y={160} tone="ok">reads: 1 cache lookup</Tag>
          </Diagram>
          <KeyIdea>Pull saves write work and spends read work. Push spends write work to make reads nearly free.</KeyIdea>
        </>
      ),
    },
    design("timelines", {
      title: "Twenty thousand feeds a second",
      short: "Fan-out",
      minutes: 6,
      story: "Moments is growing fast. 20,000 feed views a second, each needing the latest posts from hundreds of authors. Your database is drowning in feed queries; posts themselves arrive at only 100 a second.",
      palette: P.all,
      knobs: KNOBS_DB,
      hints: [
        "Run the test first (the default builds feeds on read) and look at the database.",
        "Open Design choices and build timelines on write. Then give it what it needs: Redis for timelines, a queue and workers to fill them.",
        "Wire servers → queue → workers → Redis, and servers → Redis for reads. Three workers cover 100 posts a second.",
      ],
      concepts: [
        { term: "Fan-out on write", text: "Do the per-follower work at post time, in the background.", lesson: "write-strategies" },
        { term: "Timeline cache", text: "A short list of post ids per user. Hot, small, and rebuilt if lost.", lesson: "why-cache" },
        { term: "Read:write ratio", text: "When reads dominate by 100:1, move work from read time to write time.", lesson: "tradeoffs" },
      ],
    }),
    design("celebrity", {
      title: "The celebrity problem",
      short: "Celebrities",
      minutes: 6,
      story: "A film star with two million followers joins Moments and posts twice a second across her team's accounts. Pushing each post to two million timelines ties up every worker for minutes, delaying everyone else's posts, and the copies push regular users' timelines out of the cache.",
      palette: P.all,
      knobs: KNOBS_DB,
      hints: [
        "Run it with push for everyone and read the queue lag.",
        "Most accounts have hundreds of followers. A handful have millions. Treat them differently.",
        "Choose Hybrid in Design choices: push for ordinary accounts, but keep celebrity posts in one place and merge them into the feed at read time.",
      ],
      concepts: [
        { term: "Hot key", text: "One entity attracting wildly more traffic than the rest, breaking even distribution.", lesson: "hot-keys" },
        { term: "Hybrid fan-out", text: "Push for the many small accounts, pull for the few giants.", lesson: "tradeoffs" },
        { term: "Queue lag", text: "How long a job waits. One huge job can starve all the small ones behind it.", lesson: "queues-and-workers" },
      ],
    }),
    design("spike", {
      title: "She posts, everyone looks",
      short: "Posting spike",
      minutes: 4,
      story: "The star's post lands. Within seconds her followers open the app: feed views and photo requests triple for twelve seconds. This is the first moment all your pieces are under stress together.",
      palette: P.all,
      knobs: KNOBS_DB,
      hints: [
        "Watch which node saturates first during the spike. It's usually the app tier.",
        "The CDN and timeline cache are doing their job; the servers just need headroom.",
        "Add servers behind the load balancer. Five medium servers cover the spike with room to spare.",
      ],
      concepts: [
        { term: "Thundering herd", text: "Many users asking for the same new thing at once.", lesson: "thundering-herd" },
        { term: "Headroom", text: "Capacity you hold in reserve for the moments that matter.", lesson: "autoscaling" },
      ],
    }),
    {
      type: "choose",
      id: "ranking",
      title: "Newest first, or ranked?",
      short: "Feed ordering",
      minutes: 3,
      body: (
        <p>
          Everything so far sorted the feed by time. Product wants the best photos first. That changes what a timeline stores
          and when it&apos;s built.
        </p>
      ),
      prompt: "What would you build first?",
      options: [
        {
          id: "chrono",
          title: "Reverse chronological",
          summary: "Newest first. Timelines are just post ids sorted by time.",
          pros: ["Trivial to precompute and cache", "Predictable; users understand it", "Cheap"],
          cons: ["Posters who post a lot drown out others", "Nothing about quality"],
          when: "Pick it for launch and for anything where recency is the product.",
        },
        {
          id: "rank-read",
          title: "Rank at read time",
          summary: "Fetch a few hundred candidate posts and score them with a model when the feed opens.",
          pros: ["Always uses the freshest signals", "The timeline cache stays simple"],
          cons: ["Adds latency to the slowest path", "Scoring runs 20,000 times a second"],
          when: "Pick it when the model is cheap or the candidate set is small.",
        },
        {
          id: "rank-write",
          title: "Rank in the background",
          summary: "Score posts asynchronously and store the order in the timeline.",
          pros: ["Fast reads", "Heavy models are affordable off the hot path"],
          cons: ["Order can be stale", "Re-ranking means rewriting timelines"],
          when: "Pick it for expensive models, accepting a few minutes of staleness.",
        },
      ],
      after: (
        <p>
          Whichever you pick, notice the pattern from this drill: <strong>decide what must be fresh, then move everything else
          out of the request</strong>. The ranked-feed drill picks up exactly there.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed a photo feed",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          Photos went to the <strong>edge</strong>, feeds were <strong>precomputed on write</strong> by background workers, and
          the accounts that break precomputation were handled with a <strong>hybrid</strong>. None of those was the first design;
          each was forced by a number getting out of hand. That&apos;s the habit: find the ratio that dominates, and move the
          work to wherever it&apos;s cheapest.
        </p>
      ),
    },
  ],
};
