import { Box, Diagram, Packet, Text, Wire } from "@/components/diagram/kit";
import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Lab, LabGraph } from "@/lib/lab/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: LabGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };

const K = {
  launch: ["size"] as Knob[],
  cache: ["size"] as Knob[],
  topk: ["size"] as Knob[],
  fresh: ["size"] as Knob[],
  spike: ["size"] as Knob[],
};

const P = {
  launch: ["client", "server", "db"] as DesignStep["palette"],
  cache: ["client", "lb", "server", "cache", "db"] as DesignStep["palette"],
  topk: ["client", "lb", "server", "cache", "db", "search"] as DesignStep["palette"],
  fresh: ["client", "lb", "server", "cache", "db", "search", "queue", "worker"] as DesignStep["palette"],
  all: ["client", "cdn", "lb", "server", "cache", "db", "search", "queue", "worker"] as DesignStep["palette"],
};

const design = (id: keyof typeof DESIGN, step: Omit<DesignStep, "type" | "id" | "scenario" | "constraints" | "debrief">): DesignStep => ({
  type: "design",
  id,
  ...DESIGN[id],
  debrief: DEBRIEFS[id],
  ...step,
});

export const searchAutocomplete: Lab = {
  slug: "search-autocomplete",
  version: 1,
  title: "Design search autocomplete",
  product: "Search autocomplete",
  intro: (
    <>
      <p>
        Type <strong>ind</strong> into the Gatepass search box and a list drops down: <em>indie night bandra</em>,{" "}
        <em>indian ocean live</em>, <em>indoor comedy fest</em>. It has to appear before you press the next key, which means
        under <strong>50 milliseconds</strong> from the server, for every keystroke of every person searching.
      </p>
      <p>
        That&apos;s a strange workload: tiny requests, enormous volume, almost all of them repeating. A database can answer a
        prefix query, a search engine can rank one, but neither is built to be asked a hundred thousand times a second at
        50 ms. You&apos;ll find out which tricks actually work: caching what everyone asks, computing the answers before they
        are asked, and sending fewer requests in the first place.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Suggest completions", detail: "The top 10 terms starting with what has been typed so far." },
    { kind: "functional", text: "Learn from searches", detail: "What people search shapes what is suggested tomorrow, or sooner." },
    { kind: "functional", text: "Show what's trending", detail: "A list before anyone types." },
    { kind: "non-functional", text: "Fast", detail: "p99 under 50 ms at the server. Slower and the list lags behind the typing." },
    { kind: "non-functional", text: "Huge read volume", detail: "Tens of thousands of lookups a second, dominated by a few popular prefixes." },
    { kind: "non-functional", text: "Fresh enough", detail: "A newly announced event is suggested the same day, not next week." },
    { kind: "non-functional", text: "Affordable", detail: "Every cache and cluster has a monthly bill." },
  ],
  estimates: [
    { label: "Searches", value: "~1,000/s", math: "~85M searches a day ÷ 86,400 s" },
    { label: "Lookups, per keystroke", value: "~10,000/s", math: "~10 keystrokes per search, before debouncing" },
    { label: "Lookups, after debouncing", value: "~3,000/s avg · 60k peak", math: "~3 pauses per search; evening peak ≈ 20× average" },
    { label: "Distinct prefixes", value: "~50M", math: "most never asked twice; a few thousand carry most of the traffic" },
  ],
  cacheParam: "prefix",
  cacheValues: [],
  related: {
    lessons: ["why-cache", "cache-aside", "cdn-and-browser-cache", "hot-keys", "queues-and-workers", "stream-processing", "indexes"],
    labs: ["url-shortener", "news-feed", "key-value-store"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design search autocomplete",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first. A suggestion is a read that has to be cacheable.",
        "On the canvas, add components and wire them the way requests travel: from the browser toward the data.",
        "Run a load test. The simulator models capacity, latency, queues and monthly cost, and judges p99 against 50 ms.",
        "Some choices (debouncing, where answers come from) are settings. Look in the design panel and on components.",
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
            An autocomplete endpoint is called more than every other endpoint in the product combined. So the design question is
            less &quot;what does it return&quot; than <strong>&quot;how many layers can answer it without bothering me&quot;</strong>.
          </p>
          <p>Design one endpoint per requirement. Think about what makes a request cacheable by a browser or CDN.</p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <>
          <p className="mb-2 text-[16px] font-semibold text-fg">The prefix goes in the path on purpose</p>
          <p>
            A cache key is the address. If everyone asking for &quot;ind&quot; requests <code>/suggestions/ind</code>, a CDN
            can serve them all one copy. Tuck the prefix into a body or an unusual header and every cache in the world
            treats the requests as different. That small choice is worth an order of magnitude in load.
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
            There are two shapes of data. <strong>Counts</strong>: every term, how often it was searched, how recently. And{" "}
            <strong>answers</strong>: for each prefix, the finished top 10, ready to serve.
          </p>
          <p>
            Counts are for the background job. Answers are for the request path. Model both, and notice which one is keyed by
            what.
          </p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          The second table is a <strong>precomputed result</strong>: redundant on purpose. You&apos;re trading storage and a
          background job for a request that does one lookup instead of a scan and a sort. Most fast read paths work this way.
        </p>
      ),
    },
    design("launch", {
      title: "Launch: a prefix query",
      short: "Launch",
      minutes: 3,
      story:
        "The search box ships. A few hundred suggestion requests a second, one query each: find terms starting with what was typed, sorted by popularity. The 50 ms budget is generous when there is almost no traffic.",
      palette: P.launch,
      knobs: K.launch,
      startGraph: START,
      hints: [
        "A request needs code to run it and a table to query.",
        "Wire Users → API server → Database.",
        "One small server and one database. Anything more is unnecessary at this size.",
      ],
      concepts: [
        { term: "Prefix query", text: "WHERE term LIKE 'ind%' with an index can jump straight to the matching range instead of reading every row.", lesson: "indexes" },
        { term: "p99 latency", text: "99 out of 100 requests are faster than this. For a dropdown that must keep up with typing, the slow ones are the ones people notice.", lesson: "latency-numbers" },
      ],
    }),
    {
      type: "read",
      id: "read-repeat",
      title: "Everyone types the same things",
      short: "Caching",
      minutes: 3,
      body: (
        <>
          <p>
            A few thousand prefixes (&quot;a&quot;, &quot;in&quot;, &quot;ban&quot;, &quot;indie&quot;) account for most of the
            traffic. They are asked again and again, by different people, and the right answer rarely changes. That is the ideal
            workload for a cache.
          </p>
          <p>
            Put <strong>Redis</strong> in front of the database, keyed by prefix. The first &quot;ind&quot; is a miss; the next
            million are answered from memory in a fraction of a millisecond.
          </p>
          <Diagram w={640} h={170} caption="Short prefixes repeat so often that the database barely sees them.">
            <Box x={10} y={59} w={100} label="Browser" icon="client" />
            <Box x={160} y={59} w={110} label="API" icon="server" />
            <Box x={330} y={10} w={120} label="Redis" sub="prefix → top 10" icon="cache" tone="accent" />
            <Box x={330} y={108} w={120} label="Database" icon="db" dim />
            <Wire points={[[110, 85], [160, 85]]} tone="req" />
            <Wire d="M270 85 C300 85 300 36 330 36" tone="req" label="most" />
            <Wire d="M270 85 C300 85 300 134 330 134" dashed tone="muted" label="rare" />
            <Packet d="M110 85 L160 85 L270 85 C300 85 300 36 330 36" dur={1.4} />
            <Packet d="M110 85 L160 85 L270 85 C300 85 300 36 330 36" dur={1.4} delay={0.5} />
            <Text x={540} y={90} size={11} anchor="middle" tone="muted">
              miss → compute once, remember
            </Text>
          </Diagram>
          <Callout tone="tip" title="The cheapest request is the one you never receive">
            Browsers fire a request per keystroke unless told otherwise. <strong>Debouncing</strong> (waiting ~150 ms after the
            last key) cuts the traffic by two thirds, and the requests that remain are the ones that are actually read.
          </Callout>
          <KeyIdea>Cache what many people ask; don&apos;t ask what nobody will read.</KeyIdea>
        </>
      ),
    },
    design("cache", {
      title: "Lunchtime peak",
      short: "Caching",
      minutes: 5,
      story:
        "Everyone searches at once: 36,000 lookups a second, after debouncing. One database tops out near 35,000, and you still need under 50 ms. Look for the setting that controls how the search box sends requests.",
      palette: P.cache,
      knobs: K.cache,
      hints: [
        "Run it first and see which box is red. How many of those requests ask for something new?",
        "Add Redis beside the API servers, wire each server to it, and add enough servers: 36k lookups at ~60% utilisation.",
        "A load balancer and four medium servers, one Redis, one database. And open the design panel: how should the browser behave while someone types?",
      ],
      concepts: [
        { term: "Cache-aside", text: "Look in the cache first; on a miss, query the database and store the answer.", lesson: "cache-aside" },
        { term: "Hit rate", text: "The share of lookups answered by the cache. At 90%, the database sees a tenth of the traffic.", lesson: "why-cache" },
        { term: "Debouncing", text: "Waiting for a pause before acting, so a burst of events becomes one.", lesson: "polling" },
      ],
    }),
    {
      type: "read",
      id: "read-topk",
      title: "Trie, search engine, or a table of answers?",
      short: "Top-k",
      minutes: 4,
      body: (
        <>
          <p>
            A cache only holds what was asked before. But there are tens of millions of possible prefixes, and the long tail
            (&quot;indie night ban&quot;, &quot;indo-western fus&quot;) is asked rarely, so it always misses, and a miss means finding every
            matching term and <strong>sorting them by popularity</strong> to take ten. That is expensive, and it happens on the
            slow path, exactly when the cache didn&apos;t help.
          </p>
          <p>
            The fix is to <strong>stop computing at request time</strong>. A background job walks the counts and writes down the
            top 10 for every prefix. Serving a suggestion becomes a single key lookup, the same cost whether the prefix is hot or
            brand new.
          </p>
          <p>
            In memory, the same idea is a <strong>trie</strong>: a tree where each node is a letter and each path spells a
            prefix. Store the top 10 at every node and a lookup walks one letter at a time, no scanning. A key-value table keyed
            by prefix is the same structure, spread over many machines.
          </p>
          <Callout tone="warn" title="Why not just use Elasticsearch?">
            A search engine is brilliant at ranking, typo tolerance and filters, with a mean query around 12 ms and a p99
            above 50 before any queueing. That&apos;s fine for the results page. For a dropdown firing on every pause it&apos;s
            too slow and too costly. Use it where its power matters.
          </Callout>
          <KeyIdea>Do the expensive thinking ahead of time, so the request only has to look something up.</KeyIdea>
        </>
      ),
    },
    design("topk", {
      title: "The long tail",
      short: "Top-k",
      minutes: 6,
      story:
        "The catalogue grows to millions of terms and 60,000 lookups a second at peak. Popular prefixes are cached, but a large share of requests ask for something Redis has never seen, and each one is a slow ranking query. Choose where the answers come from.",
      palette: P.topk,
      knobs: K.topk,
      hints: [
        "Look at the database after the test. Which requests reach it, and what is each one doing?",
        "Open the design panel and compare the options for where completions come from. One of them makes a miss rare.",
        "Precompute the top 10 for every prefix; then Redis can hold nearly all of them and the database only sees the stragglers. Keep debouncing on.",
      ],
      concepts: [
        { term: "Trie", text: "A tree keyed letter by letter. With the best results stored at each node, a prefix lookup never scans.", lesson: "data-modeling" },
        { term: "Precomputation", text: "Trade storage and a background job for a request that is one lookup.", lesson: "why-cache" },
        { term: "Long tail", text: "Many rarely-requested items that together are a large share of traffic. Caches handle the head, not the tail.", lesson: "hot-keys" },
      ],
    }),
    design("fresh", {
      title: "A headliner is announced",
      short: "Freshness",
      minutes: 6,
      story:
        "Gatepass announces a surprise headliner at noon and a million people search for them. Precomputed lists only change when the job runs. Search logs arrive at thousands a second and must update the counts without slowing typing.",
      palette: P.fresh,
      knobs: K.fresh,
      hints: [
        "The search log is background work that shouldn't delay typing. You've seen this shape before: queue and workers.",
        "Server → Queue → Workers → Database. Then open the design panel: how often should the top 10s be rebuilt?",
        "Two workers handle 2,400 log lines a second comfortably. Choose the rolling refresh.",
      ],
      concepts: [
        { term: "Stream processing", text: "Fold events into aggregates continuously instead of in one huge nightly batch.", lesson: "stream-processing" },
        { term: "Staleness", text: "How old an answer is allowed to be. Chosen per feature, never zero.", lesson: "cache-invalidation" },
        { term: "Write path vs read path", text: "Keep the slow bookkeeping off the path a user is waiting on.", lesson: "queues-and-workers" },
      ],
    }),
    design("spike", {
      title: "Tickets go on sale",
      short: "The spike",
      minutes: 6,
      story:
        "A headline show goes on sale and for ten seconds three times as many people type the same few words. Traffic that would be 180,000 requests a second at its peak lands on a design built for 60,000. Everything is the same few prefixes, so the answer is identical for everyone.",
      palette: P.all,
      knobs: K.spike,
      hints: [
        "Identical answers for everyone can be served closer than your servers. What sits in front of the origin?",
        "Put a CDN in front of the load balancer. Then click it: how long should the edge keep an answer?",
        "With the edge taking most of the load you may not need six servers. Four is enough, and the budget expects you to notice.",
      ],
      concepts: [
        { term: "Edge caching", text: "Serve shared answers from servers near the user. Your origin sees a fraction.", lesson: "cdn-and-browser-cache" },
        { term: "Hot key", text: "A few keys carrying a huge share of the traffic. They overwhelm a single node unless a layer in front absorbs them.", lesson: "hot-keys" },
        { term: "TTL tradeoff", text: "Longer means fewer origin hits; shorter means fresher data. Pick by how much staleness the feature tolerates.", lesson: "cache-invalidation" },
      ],
    }),
    {
      type: "choose",
      id: "personal",
      title: "Same suggestions for everyone?",
      short: "Personalisation",
      minutes: 3,
      body: (
        <p>
          Everything so far assumed one answer per prefix. But a fan in Pune might want different completions to one in Delhi,
          and a returning user has history. Every dimension you add multiplies the number of distinct answers, and divides the
          cache hit rate.
        </p>
      ),
      prompt: "How personal should suggestions be?",
      options: [
        {
          id: "global",
          title: "One list for everyone",
          summary: "A single top 10 per prefix, shared by all users and cacheable at the edge.",
          pros: ["Highest cache hit rate: the CDN serves the crowd", "Cheapest by a wide margin", "Easy to reason about and test"],
          cons: ["Pune and Delhi get the same list", "Ignores the user's own history"],
          when: "Start here. It already feels good, and everything you've built assumes it.",
        },
        {
          id: "segment",
          title: "Per city or segment",
          summary: "A top 10 per prefix per segment (city, language), still shared by everyone in it.",
          pros: ["Noticeably more relevant", "Still cacheable: a CDN key just includes the segment"],
          cons: ["Storage and precompute multiply by the number of segments", "Small segments have thin data"],
          when: "When regions differ meaningfully. Add one dimension at a time and watch hit rate.",
        },
        {
          id: "personal",
          title: "Blend in the user's own history",
          summary: "Serve the shared list, then re-rank client-side or in a thin layer using recent searches.",
          pros: ["Feels personal while the heavy lifting stays shared", "The expensive part is still cached"],
          cons: ["More code, and more privacy to take care of", "Cannot be fully cached at the edge"],
          when: "When you have a logged-in user base. Keep the personal layer small and cheap.",
        },
      ],
      after: (
        <p>
          The pattern: cache the shared part, personalise the thin part. Every extra dimension of personalisation is paid for in
          hit rate, and hit rate is what let you serve this at 50 ms.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed autocomplete",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          You sent <strong>fewer requests</strong> (debouncing), <strong>answered the common ones from memory</strong> (Redis),{" "}
          <strong>stopped computing at request time</strong> (precomputed top 10s), <strong>kept fresh without slowing typing</strong>{" "}
          (a queue and workers), and let the <strong>edge</strong> absorb the crowd. Each layer exists to shield the one behind it, and
          each answers a question you can now name: who is asking, how often, and how stale may the answer be?
        </p>
      ),
    },
  ],
};
