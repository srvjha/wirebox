import type { DebriefContext } from "../../../lib/lab/types";

/** "Why it works" paragraphs, written from the learner's own passing design. */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");

function parts(ctx: DebriefContext) {
  const { graph, result } = ctx;
  const of = (kind: string) => graph.nodes.filter((n) => n.kind === kind);
  const util = (kind: string) => Math.max(0, ...of(kind).map((n) => result.steady.nodes[n.id]?.util ?? 0));
  const load = (kind: string) => of(kind).reduce((s, n) => s + (result.steady.nodes[n.id]?.load ?? 0), 0);
  return {
    servers: of("server").length,
    gateways: of("ws").length,
    workers: of("worker").length,
    storageLoad: load("storage"),
    serverUtil: util("server"),
    dbUtil: util("db"),
    wsUtil: util("ws"),
    cost: result.metrics.cost,
    knob: (id: string) => ctx.configs.custom?.[id],
  };
}

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `One server answers listings from the database and sends whole files to object storage: ${pct(p.serverUtil)} busy, $${num(p.cost)} a month. Files are in storage and facts about them are in the database from day one, so nothing has to be pulled apart later.`,
      "The cost shows up in bandwidth, not boxes: change one slide and the whole 400 MB deck uploads again. That is the next problem.",
    ];
  },
  chunks(ctx: DebriefContext) {
    const p = parts(ctx);
    const how = p.knob("chunking") === "cdc" ? "content-defined chunks" : "chunks";
    return [
      `With ${how}, the server checks each hash against an index in Redis and stores only what it hasn't seen. Object storage receives about ${num(p.storageLoad)} writes a second instead of 54,000; the rest are answered by the dedupe lookup.`,
      "Content-defined chunking cuts where a rolling hash of the bytes says to, not every 4 MB. Insert a line at the top of a document and only the chunk around the edit changes, rather than every chunk after it.",
      `${p.servers} servers run at ${pct(p.serverUtil)}: you still pay to hash and look up every chunk, just not to store it.`,
    ];
  },
  metadata(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Chunks go to object storage named by their hash; the database holds only small rows: files, versions and the list of hashes. Metadata queries stay in memory-sized tables, which is why ${pct(p.dbUtil)} database utilisation is plenty for 12,000 requests a second.`,
      "Databases are good at small, structured, transactional facts. Object stores are good at large, immutable blobs. Mixing them gets you the weaknesses of both.",
    ];
  },
  notify(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `Each of your ${p.gateways} gateways holds about ${num(200_000 / Math.max(1, p.gateways))} idle connections (${pct(p.wsUtil)} of what it can hold), and those cost almost nothing until something changes. 200,000 devices polling every 5 seconds would instead be 40,000 database queries a second, nearly all answered “no”.`,
      "The notification is tiny, “something changed, come get it”. The device then pulls the real changes with its cursor. That keeps the push path simple and means a device that was offline catches up exactly the same way.",
    ];
  },
  conflict() {
    return [
      "Each commit says which version it started from. If that isn't the latest, the server doesn't guess: it keeps both. The late arrival becomes a conflict copy, so no work is lost and a person decides which to keep.",
      "File sync can't merge arbitrary files (a PSD isn't text), and a locking model would make offline editing impossible. A visible conflict copy is the honest answer, and it is how the best-known sync tools behave.",
    ];
  },
  spike(ctx: DebriefContext) {
    const p = parts(ctx);
    return [
      `The scan queue absorbed the burst: ${p.workers} workers drain it at their own pace, and the upload path never waited for a scan. A queue turns a ten-second spike into a few seconds of lag, not an outage.`,
      "Resumable uploads and backoff matter just as much. A dropped upload asks which chunks exist and sends only the rest, and retries wait longer each time, so one failure doesn't feed the next.",
    ];
  },
};
