/**
 * The Wirebox course: three parts, nineteen modules, one running story.
 *
 * The story app is Gatepass, a ticketing app for gigs, comedy nights and
 * college fests. Each module starts with a problem Gatepass actually hits as
 * it grows, and ends with the design that fixes it.
 *
 * A lesson is "live" when it has an MDX file registered in ./lessons/index.ts.
 */

export type LessonKind = "read" | "visual" | "drill";

export type LessonMeta = {
  slug: string;
  title: string;
  kind: LessonKind;
  minutes: number;
  summary: string;
  /** For kind "drill": the drill slug under /drills. */
  drill?: string;
};

export type ModuleMeta = {
  n: number;
  slug: string;
  title: string;
  summary: string;
  story: string;
  outcome: string;
  lessons: LessonMeta[];
};

export type PartMeta = {
  n: number;
  title: string;
  summary: string;
  modules: ModuleMeta[];
};

const L = (
  slug: string,
  title: string,
  minutes: number,
  summary: string,
  kind: LessonKind = "read",
  drill?: string,
): LessonMeta => ({ slug, title, minutes, summary, kind, drill });

export const course: PartMeta[] = [
  {
    n: 1,
    title: "Foundations",
    summary: "Grow one app from a single server to thousands of requests a second.",
    modules: [
      {
        n: 1,
        slug: "what-is-system-design",
        title: "What is system design?",
        summary: "The decisions behind the boxes and arrows, and a repeatable way to make them.",
        story:
          "Your friend wants an app to sell tickets for their college fest. Before writing any code, you need to know what you're building and how good it has to be.",
        outcome: "A process you can follow for any system: requirements, high-level design, low-level design.",
        lessons: [
          L("what-is-system-design", "Decisions, not diagrams", 6, "What system design actually is, and why the diagram is the last step."),
          L("the-design-process", "The design process", 12, "Requirements, high-level design and low-level design, followed through one feature."),
          L("requirements", "Functional and non-functional requirements", 10, "What the system must do, and how well it has to do it."),
          L("estimation", "Back-of-the-envelope numbers", 12, "Turn users into requests per second, storage and bandwidth in five minutes.", "visual"),
          L("tradeoffs", "Everything is a tradeoff", 9, "Every choice buys something and costs something. Learn to name both."),
        ],
      },
      {
        n: 2,
        slug: "a-simple-system",
        title: "Start with one server",
        summary: "One client, one server, one database. Design the API and the data before anything else.",
        story:
          "Gatepass launches with one fest and two hundred students. You need a backend that lists events, books tickets and never sells the same seat twice.",
        outcome: "A single-server design with a clean API, a sensible schema and an honest list of its limits.",
        lessons: [
          L("how-a-request-travels", "How a request travels", 10, "DNS, TCP, TLS and HTTP: everything between a tap and a response.", "visual"),
          L("client-server", "Clients, servers and databases", 8, "Who does what, and why the database is a separate process."),
          L("api-design", "Designing an API", 14, "Resources, methods, status codes and the contract between app and server.", "visual"),
          L("data-modeling", "Modeling the data", 14, "Tables, keys, relationships and the queries they have to answer.", "visual"),
          L("sql-vs-nosql", "SQL or NoSQL?", 11, "What each kind of database is good at, and how to choose."),
          L("indexes", "Indexes", 11, "Why one query takes 2 ms and another takes 2 seconds.", "visual"),
          L("latency-numbers", "Latency numbers to know", 8, "How long memory, disk and network actually take.", "visual"),
          L("drill-url-shortener", "Drill: design a URL shortener", 50, "Design, scale and break a link shortener, from one server to 50,000 requests a second.", "drill", "url-shortener"),
        ],
      },
      {
        n: 3,
        slug: "caching",
        title: "Caching",
        summary: "Serve repeated reads from memory, and deal with what goes stale.",
        story:
          "A famous band announces a show. Ninety percent of traffic is people refreshing the same event page, and the database runs the same query thousands of times a second.",
        outcome: "A cache in front of the database with a plan for expiry, invalidation and a cold start.",
        lessons: [
          L("why-cache", "Why caching works", 9, "Hot data, hit rates, and the 80/20 shape of real traffic.", "visual"),
          L("cache-aside", "Cache-aside, step by step", 11, "The most common caching pattern, and what the key and value should be.", "visual"),
          L("cache-invalidation", "Expiry and invalidation", 12, "TTLs, deleting on write, and why stale data is a product decision."),
          L("write-strategies", "Write-through, write-back, write-around", 10, "Three ways to keep the cache and the database in step.", "visual"),
          L("eviction", "Eviction: LRU, LFU and friends", 9, "What leaves the cache when memory runs out.", "visual"),
          L("thundering-herd", "Thundering herds", 10, "When a hot key expires and ten thousand requests hit the database at once.", "visual"),
          L("cdn-and-browser-cache", "CDNs and browser caches", 11, "Caching before the request even reaches you."),
        ],
      },
      {
        n: 4,
        slug: "scaling-servers",
        title: "When one server isn't enough",
        summary: "Scale up, then scale out, and fix what breaks on server number two.",
        story:
          "Tickets for the band go on sale at 10:00. At 10:00:01 the one API server hits 100% CPU and the queue of waiting requests grows by the second.",
        outcome: "Stateless servers behind a load balancer, with sessions and files moved out of them.",
        lessons: [
          L("vertical-vs-horizontal", "Bigger box or more boxes?", 10, "Vertical scaling, horizontal scaling and where each one stops.", "visual"),
          L("load-balancers", "Load balancers", 12, "Round robin, least connections and hashing, and what an L4 or L7 balancer sees.", "visual"),
          L("stateless-servers", "Stateless servers and sessions", 10, "Why a login breaks on server two, and how to fix it."),
          L("health-checks", "Health checks and redundancy", 9, "Noticing a dead server, and having enough left when one dies.", "visual"),
          L("object-storage", "Files, object storage and CDNs", 10, "Where posters, PDFs and images should live."),
          L("autoscaling", "Autoscaling", 9, "Adding servers before the rush, and removing them after."),
        ],
      },
      {
        n: 5,
        slug: "scaling-databases",
        title: "When one database isn't enough",
        summary: "Read replicas, replication lag, failover and backups you have actually tested.",
        story:
          "With ten API servers, the database is now the bottleneck. You add copies for reads, and a customer books a ticket that their own ticket page says doesn't exist.",
        outcome: "A primary for writes, replicas for reads, a failover plan and restorable backups.",
        lessons: [
          L("read-replicas", "Read replicas", 11, "Copy the data, spread the reads, keep one place for writes.", "visual"),
          L("replication-lag", "Replication lag and read-your-writes", 11, "Why a fresh write can vanish, and three ways to stop it.", "visual"),
          L("failover", "Failover", 10, "Promoting a replica when the primary dies, and what can go wrong.", "visual"),
          L("connection-pooling", "Connection pooling", 8, "Why a thousand servers can't each hold a hundred connections."),
          L("backups", "Backups and point-in-time recovery", 9, "The backup you haven't restored isn't a backup."),
        ],
      },
      {
        n: 6,
        slug: "live-updates",
        title: "Live updates",
        summary: "Push news to clients the moment it happens, across many servers.",
        story:
          "The seat map should show seats disappearing as other people book them. Right now every phone asks “any change?” every second, and most of the traffic is that question.",
        outcome: "A live seat map over WebSockets that works across servers and survives dropped connections.",
        lessons: [
          L("polling", "Polling and long polling", 9, "The simplest way to get updates, and what it costs.", "visual"),
          L("sse-and-websockets", "Server-sent events and WebSockets", 11, "Keeping a connection open, one way or both ways.", "visual"),
          L("scaling-websockets", "WebSockets across many servers", 11, "Sticky connections, pub/sub fan-out and reconnects.", "visual"),
          L("presence", "Presence: who's online", 9, "Heartbeats, timeouts and the cost of knowing who's here."),
        ],
      },
      {
        n: 7,
        slug: "background-jobs",
        title: "Background jobs",
        summary: "Move slow work out of the request, and make sure a job that runs twice does no harm.",
        story:
          "Booking a ticket saves it, generates a PDF, emails it and sends an SMS while the user waits. On fest night the SMS provider slows to four seconds and bookings start timing out.",
        outcome: "A queue and workers for after-the-response work, with retries that are safe to repeat.",
        lessons: [
          L("sync-vs-async", "Not everything belongs in the request", 8, "What the user must wait for, and what can happen later.", "visual"),
          L("queues-and-workers", "Queues and workers", 11, "Producers, consumers and a buffer between them.", "visual"),
          L("retries-and-backoff", "Retries, backoff and jitter", 10, "Trying again without making the outage worse.", "visual"),
          L("idempotency", "Idempotency", 11, "Making “send the ticket” safe to run twice."),
          L("dead-letter-queues", "Dead-letter queues and scheduled jobs", 8, "Where failed jobs go, and running work on a timer."),
        ],
      },
      {
        n: 8,
        slug: "rate-limiting",
        title: "Rate limiting",
        summary: "Decide how much each client may ask for, and enforce it across every server.",
        story:
          "A scalper's script asks for the booking page 20,000 times a second. Real fans can't get through, and every OTP the script triggers is an SMS you pay for.",
        outcome: "Limits on every expensive or abusable endpoint, shared by all servers.",
        lessons: [
          L("why-rate-limit", "Why limit at all?", 7, "Abuse, cost, fairness, and protecting yourself from your own clients."),
          L("rate-limit-algorithms", "Token bucket, leaky bucket and windows", 13, "Four algorithms, run side by side.", "visual"),
          L("distributed-rate-limiting", "Limiting across many servers", 10, "Counters in Redis, races and approximate limits.", "visual"),
          L("what-to-limit-by", "What to limit by", 8, "IP, user, API key or route, and the office behind one IP."),
        ],
      },
      {
        n: 9,
        slug: "growing-big",
        title: "Growing big",
        summary: "Years of data, many cities, many teams. Cheap steps first, hard steps last.",
        story:
          "Three years in, the tickets table has 900 million rows, Gatepass runs in forty cities and thirty engineers keep stepping on each other in one codebase.",
        outcome: "Archived history, partitioned tables, and sharding only where the numbers force it.",
        lessons: [
          L("archiving", "Archiving old data", 8, "Most queries ask about this week. Move the rest somewhere cheaper."),
          L("table-partitioning", "Partitioning a table", 10, "Splitting one big table into pieces the database can skip.", "visual"),
          L("sharding", "Sharding", 13, "Splitting data across databases, and choosing the shard key.", "visual"),
          L("splitting-the-monolith", "When to split the codebase", 9, "The signals that say one codebase is too many people's problem."),
        ],
      },
      {
        n: 10,
        slug: "putting-it-together",
        title: "Putting it together",
        summary: "Design a whole system from a blank page, and explain every choice.",
        story: "You've grown Gatepass from one server to forty cities. Now do it again from nothing, in forty-five minutes.",
        outcome: "A framework you can use for any design, at work or in an interview.",
        lessons: [
          L("design-framework", "A framework for any design", 12, "The steps, the time to spend on each, and what to say out loud."),
          L("worked-example", "Worked example: a ticketing system", 20, "The whole framework applied to Gatepass, start to finish.", "visual"),
          L("common-mistakes", "Common mistakes", 9, "Over-engineering, skipping numbers, and other traps."),
        ],
      },
    ],
  },
  {
    n: 2,
    title: "Distributed systems",
    summary: "What changes when the system is many machines that fail independently.",
    modules: [
      {
        n: 11,
        slug: "microservices",
        title: "Microservices",
        summary: "Where to draw service boundaries, how services talk, and how to trace a request.",
        story:
          "Gatepass splits into events, booking, payments and notifications services. Function calls become network calls, and a bug now spans four repos.",
        outcome: "Services with clear boundaries, a chosen way for each pair to talk, and tracing across them.",
        lessons: [
          L("service-boundaries", "Drawing service boundaries", 11, "Split by business capability, not by layer."),
          L("service-communication", "Sync and async communication", 10, "REST, gRPC and events between services.", "visual"),
          L("api-gateway", "API gateways and service discovery", 9, "One front door, and finding services that move."),
          L("distributed-tracing", "Distributed tracing", 9, "Following one request across ten services.", "visual"),
        ],
      },
      {
        n: 12,
        slug: "distributed-problems",
        title: "Problems in distributed systems",
        summary: "Timeouts, retries, clocks, locks and cascading failures.",
        story:
          "A payment call times out. Did the money move? Meanwhile the last five seats were sold eight times, and one slow service made every page slow.",
        outcome: "Designs that assume networks, clocks and machines will fail.",
        lessons: [
          L("network-failures", "The network is not reliable", 10, "Timeouts and the three possible outcomes of every call.", "visual"),
          L("clocks", "Clocks lie", 9, "Why you can't order events by timestamp across machines."),
          L("distributed-locks", "Distributed locks", 11, "Leases, fencing tokens and when not to lock.", "visual"),
          L("circuit-breakers", "Circuit breakers and bulkheads", 10, "Stopping one slow dependency from taking everything down.", "visual"),
        ],
      },
      {
        n: 13,
        slug: "replication",
        title: "Replication in depth",
        summary: "Leaders, followers, quorums and consistency.",
        story:
          "Two database nodes both believe they're the leader, and a booking appears in one read and disappears in the next.",
        outcome: "A consistency level chosen for each feature, with the replication setup to match.",
        lessons: [
          L("replication-modes", "Leader-follower, multi-leader, leaderless", 12, "Three ways to keep copies, and who accepts writes.", "visual"),
          L("quorums", "Quorums", 10, "R + W > N, and what it does and doesn't guarantee.", "visual"),
          L("consistency-models", "Consistency models", 12, "Strong, eventual, and the useful ones in between."),
          L("leader-election", "Leader election and Raft", 13, "How a cluster agrees on who's in charge.", "visual"),
          L("conflict-resolution", "Resolving conflicts", 9, "Last write wins, version vectors and CRDTs."),
        ],
      },
      {
        n: 14,
        slug: "partitioning",
        title: "Partitioning in depth",
        summary: "Spread data evenly, avoid hot spots, and rebalance without downtime.",
        story:
          "Sharding by city worked until Mumbai had ten times the bookings of any other city, and adding a shard meant moving half the data.",
        outcome: "Data spread evenly, shards added without downtime, and requests routed to the right place.",
        lessons: [
          L("partitioning-strategies", "Range, hash and directory partitioning", 11, "Three ways to decide where a row lives.", "visual"),
          L("hot-keys", "Hot keys and skew", 9, "When one key gets all the traffic."),
          L("rebalancing", "Rebalancing", 10, "Adding nodes without moving everything.", "visual"),
          L("request-routing", "Routing requests to partitions", 8, "Clients, proxies and coordination services."),
        ],
      },
      {
        n: 15,
        slug: "messaging",
        title: "Messaging: queues, pub/sub and Kafka",
        summary: "Publish events instead of calling a chain of services.",
        story:
          "Booking calls payments, seats, email, SMS and analytics one after another. If any one is down, the booking fails, though most of them only need to hear about it.",
        outcome: "One booking event that every interested service receives, in order, with duplicates handled.",
        lessons: [
          L("pub-sub", "Pub/sub", 9, "One message, many subscribers.", "visual"),
          L("kafka-internals", "Inside Kafka: logs, partitions, offsets", 13, "Why Kafka is a log, not a queue.", "visual"),
          L("consumer-groups", "Consumer groups and ordering", 10, "Scaling consumers without losing order.", "visual"),
          L("delivery-guarantees", "At-most-once, at-least-once, exactly-once", 10, "What each guarantee really means."),
        ],
      },
      {
        n: 16,
        slug: "distributed-transactions",
        title: "Transactions across services",
        summary: "Keep services consistent when any of them can fail halfway.",
        story:
          "The payment succeeded, then the booking service crashed before saving the ticket. The fan paid and has no ticket, and every database is internally consistent.",
        outcome: "Operations across services that complete or roll back, and events that are never lost.",
        lessons: [
          L("two-phase-commit", "Two-phase commit", 10, "The classic protocol, and why it's rarely used between services.", "visual"),
          L("sagas", "Sagas and compensation", 12, "Long transactions as a chain of steps and undos.", "visual"),
          L("outbox-pattern", "The outbox pattern", 9, "Saving data and publishing an event, atomically."),
        ],
      },
      {
        n: 17,
        slug: "events-and-streams",
        title: "Events and streams",
        summary: "Event sourcing, CQRS, stream processing and batch jobs.",
        story:
          "The business wants live sales per show, a full history of every booking change, and reports that don't slow down checkout.",
        outcome: "Live metrics from a stream, reports from batch, and neither touching the booking database.",
        lessons: [
          L("event-sourcing", "Event sourcing", 11, "Store what happened, derive what is.", "visual"),
          L("cqrs", "CQRS", 9, "Separate models for writing and reading."),
          L("stream-processing", "Stream processing", 11, "Windows, aggregates and late events.", "visual"),
          L("batch-processing", "Batch processing", 9, "MapReduce and its descendants."),
        ],
      },
      {
        n: 18,
        slug: "availability",
        title: "Availability and going global",
        summary: "Uptime targets, what each nine costs, and running in many regions.",
        story:
          "Gatepass launches in a second country. Users there are 220 ms away, the law says their data stays local, and last month a cloud region went down for five hours.",
        outcome: "An affordable uptime target, users served from nearby, and a plan for losing a region.",
        lessons: [
          L("slos-and-nines", "SLAs, SLOs and nines", 10, "What 99.9% means in minutes, and error budgets.", "visual"),
          L("multi-region", "Running in many regions", 12, "Active-passive, active-active and routing users to the nearest region.", "visual"),
          L("disaster-recovery", "Disaster recovery", 9, "RPO, RTO and the drills nobody wants to run."),
        ],
      },
    ],
  },
  {
    n: 3,
    title: "Under the hood",
    summary: "The algorithms inside big systems, as simulations you can break.",
    modules: [
      {
        n: 19,
        slug: "classic-algorithms",
        title: "Classic algorithms in action",
        summary: "Run them, break them, and see why they work.",
        story:
          "People say “just use consistent hashing” or “add a Bloom filter” as if everyone has watched one work. Here you will.",
        outcome: "The algorithms behind Parts 1 and 2, seen working and failing.",
        lessons: [
          L("consistent-hashing", "Consistent hashing", 12, "Add and remove nodes without reshuffling everything.", "visual"),
          L("bloom-filters", "Bloom filters", 10, "“Definitely not” or “probably yes”, in a few bytes.", "visual"),
          L("lsm-trees", "LSM trees", 12, "How write-heavy databases turn random writes into sequential ones.", "visual"),
          L("b-trees", "B-trees", 11, "The index inside almost every SQL database.", "visual"),
          L("geohashing", "Geohashes and quadtrees", 11, "Finding what's nearby.", "visual"),
          L("hyperloglog", "HyperLogLog", 9, "Counting a billion unique visitors in 12 KB.", "visual"),
          L("merkle-trees", "Merkle trees", 9, "Finding which replicas disagree, cheaply.", "visual"),
        ],
      },
    ],
  },
];

export type FlatLesson = LessonMeta & {
  module: ModuleMeta;
  part: PartMeta;
  /** "3.2" style number */
  n: string;
  index: number;
};

export const allLessons: FlatLesson[] = course.flatMap((part) =>
  part.modules.flatMap((module) =>
    module.lessons.map((lesson, i) => ({ ...lesson, module, part, n: `${module.n}.${i + 1}`, index: i })),
  ),
);

{
  const seen = new Set<string>();
  for (const l of allLessons) {
    if (seen.has(l.slug)) throw new Error(`course: duplicate lesson slug "${l.slug}"`);
    seen.add(l.slug);
  }
}

export function getLesson(slug: string) {
  return allLessons.find((l) => l.slug === slug);
}

export function getModule(slug: string) {
  for (const part of course) {
    const m = part.modules.find((m) => m.slug === slug);
    if (m) return { module: m, part };
  }
  return undefined;
}

export const courseStats = {
  parts: course.length,
  modules: course.reduce((n, p) => n + p.modules.length, 0),
  lessons: allLessons.length,
  minutes: allLessons.reduce((n, l) => n + l.minutes, 0),
};
