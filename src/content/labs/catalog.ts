/**
 * Every product lab, live or planned. A lab is playable when it has a
 * definition registered in ./index.ts (status "live").
 */

export type Difficulty = "easy" | "medium" | "hard";

export type LabMeta = {
  slug: string;
  product: string;
  title: string;
  tagline: string;
  difficulty: Difficulty;
  minutes: number;
  concepts: string[];
  status: "live" | "soon";
};

export const labCatalog: LabMeta[] = [
  {
    slug: "url-shortener",
    product: "URL shortener",
    title: "Design a URL shortener",
    tagline: "A few writes, billions of redirects, and short codes that never collide.",
    difficulty: "easy",
    minutes: 50,
    concepts: ["API design", "Schema", "Vertical & horizontal scaling", "Caching", "Rate limiting", "Failover", "Read-your-writes"],
    status: "live",
  },
  {
    slug: "pastebin",
    product: "Pastebin",
    title: "Design a pastebin",
    tagline: "Store text blobs cheaply, serve them fast, and expire them on time.",
    difficulty: "easy",
    minutes: 40,
    concepts: ["Object storage", "CDN", "TTL & expiry"],
    status: "soon",
  },
  {
    slug: "notifications",
    product: "Notification system",
    title: "Design a notification system",
    tagline: "Email, SMS and push to millions, without double-sending or dropping one.",
    difficulty: "medium",
    minutes: 50,
    concepts: ["Queues", "Workers", "Retries", "Idempotency"],
    status: "soon",
  },
  {
    slug: "video-platform",
    product: "Video platform",
    title: "Design a video platform",
    tagline: "Upload once, transcode to every quality, stream to any network.",
    difficulty: "medium",
    minutes: 60,
    concepts: ["Upload pipelines", "Transcoding", "Adaptive bitrate", "CDN"],
    status: "soon",
  },
  {
    slug: "chat",
    product: "Chat app",
    title: "Design a chat app",
    tagline: "Messages in order, with delivery ticks, to phones that keep going offline.",
    difficulty: "medium",
    minutes: 60,
    concepts: ["WebSockets", "Ordering", "Offline delivery", "Receipts"],
    status: "soon",
  },
  {
    slug: "news-feed",
    product: "Photo feed",
    title: "Design a photo feed",
    tagline: "Fan-out on write or on read, and the celebrity who breaks both.",
    difficulty: "medium",
    minutes: 55,
    concepts: ["Fan-out", "Timeline cache", "Hot users"],
    status: "soon",
  },
  {
    slug: "ticket-booking",
    product: "Ticket booking",
    title: "Design ticket booking",
    tagline: "Hold a seat, take the payment, never sell it twice.",
    difficulty: "medium",
    minutes: 55,
    concepts: ["Seat holds", "Locking", "Double-booking"],
    status: "soon",
  },
  {
    slug: "payments",
    product: "Payment system",
    title: "Design a payment system",
    tagline: "Money moves exactly once, even when every network call fails.",
    difficulty: "hard",
    minutes: 65,
    concepts: ["Idempotency keys", "Outbox", "Reconciliation"],
    status: "soon",
  },
  {
    slug: "ride-dispatch",
    product: "Ride dispatch",
    title: "Design ride dispatch",
    tagline: "Match the nearest driver to every rider while both are moving.",
    difficulty: "hard",
    minutes: 60,
    concepts: ["Geo-indexing", "Matching", "Location updates"],
    status: "soon",
  },
  {
    slug: "collab-editor",
    product: "Collaborative editor",
    title: "Design a collaborative editor",
    tagline: "Many people typing in one document, and nobody's edit lost.",
    difficulty: "hard",
    minutes: 65,
    concepts: ["OT & CRDTs", "Presence", "Sync"],
    status: "live",
  },
  {
    slug: "file-sync",
    product: "File sync",
    title: "Design file sync",
    tagline: "Keep every device in sync, and send only the bytes that changed.",
    difficulty: "medium",
    minutes: 55,
    concepts: ["Chunking", "Delta sync", "Conflicts"],
    status: "live",
  },
  {
    slug: "ranked-feed",
    product: "Ranked feed",
    title: "Design a ranked feed",
    tagline: "Votes pour in, and the ranking stays fresh and fair.",
    difficulty: "medium",
    minutes: 50,
    concepts: ["Counters", "Ranking", "Write-heavy"],
    status: "soon",
  },
  {
    slug: "presence",
    product: "Online presence",
    title: "Design online presence",
    tagline: "Who's online right now, for a hundred million users.",
    difficulty: "medium",
    minutes: 45,
    concepts: ["Heartbeats", "Pub/sub", "Fan-out"],
    status: "soon",
  },
  {
    slug: "search-autocomplete",
    product: "Search autocomplete",
    title: "Design search autocomplete",
    tagline: "Suggestions in under 50 ms, from billions of past queries.",
    difficulty: "medium",
    minutes: 50,
    concepts: ["Tries", "Top-k", "Caching"],
    status: "soon",
  },
  {
    slug: "key-value-store",
    product: "Key-value store",
    title: "Design a key-value store",
    tagline: "A store that stays up and correct when machines die.",
    difficulty: "hard",
    minutes: 70,
    concepts: ["Partitioning", "Replication", "Quorums"],
    status: "live",
  },
];

export function getLabMeta(slug: string) {
  return labCatalog.find((l) => l.slug === slug);
}
