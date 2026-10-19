import type { FlowResult, Kind, NodeStat } from "../../../sim";
import type { DebriefContext } from "../../../lib/lab/types";

/** "Why it works" text, written from the learner's own passing design. */
const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${num(x)}`;

function of(ctx: DebriefContext, kind: Kind) {
  const nodes = ctx.graph.nodes.filter((n) => n.kind === kind);
  const stats: NodeStat[] = nodes.map((n) => ctx.result.steady.nodes[n.id]).filter(Boolean);
  const busiest = stats.reduce<NodeStat | undefined>((a, s) => (!a || s.util > a.util ? s : a), undefined);
  return { count: nodes.length, busiest, load: stats.reduce((s, x) => s + x.load, 0) };
}
const flow = (ctx: DebriefContext, id: string) => (ctx.result.steady as FlowResult).flows.find((f) => f.id === id);

export const DEBRIEFS = {
  launch(ctx: DebriefContext) {
    const s = of(ctx, "server");
    return [
      `Three things hold your launch together: an API server for the logic (${pct(s.busiest?.util ?? 0)} busy), a database for titles and statuses, and object storage for the video files. The files never go in the database: storage is built for big blobs and costs a fraction as much.`,
      `All of it costs ${usd(ctx.result.metrics.cost)} a month. Fine for hundreds of viewers, and the next step will show where it stops being fine.`,
    ];
  },
  pipeline(ctx: DebriefContext) {
    const w = of(ctx, "worker");
    const up = flow(ctx, "upload");
    return [
      `The upload request now only has to save the file and drop a job on the queue, so it answers 202 in milliseconds. Your ${w.count} workers do the slow part (about 12 seconds of compute per video) at ${pct(w.busiest?.util ?? 0)} utilisation, and ${pct(up?.asyncOnTime ?? 1)} of videos were ready inside five minutes.`,
      "The queue is the shock absorber: if ten creators upload at once, jobs wait their turn instead of the API falling over. And because the phone sent its bytes to storage with a pre-signed URL, your API servers never carried a single gigabyte.",
    ];
  },
  cdn(ctx: DebriefContext) {
    const s = of(ctx, "server");
    const seg = flow(ctx, "segments");
    return [
      `Viewers asked for ${num(seg?.offered ?? 0)} segments a second. Your CDN answered most of them from an edge server near the viewer, so your origin saw only ${num(s.load)} requests a second in total and ran at ${pct(s.busiest?.util ?? 0)}.`,
      `Video is the perfect CDN workload: a segment never changes once written, and a popular one is requested thousands of times. Without the CDN, ${num(seg?.offered ?? 0)} requests a second would have blown past what object storage serves (${num(50000)}/s), never mind the servers in front of it. Total: ${usd(ctx.result.metrics.cost)} a month.`,
    ];
  },
  ladder(ctx: DebriefContext) {
    const w = of(ctx, "worker");
    const knob = ctx.configs.custom?.segment ?? "6s";
    return [
      `Each upload now becomes a ladder of renditions (240p to 1080p) plus a manifest, so a phone on a weak signal can step down mid-video instead of buffering. That multiplies transcoding work about threefold, which is why you needed ${w.count} workers, now at ${pct(w.busiest?.util ?? 0)}.`,
      `Your ${knob} segments keep the CDN hit rate high without making viewers wait for a huge first download. Shorter segments switch quality faster but create far more small objects for the CDN to hold; longer ones start slowly.`,
    ];
  },
  viral(ctx: DebriefContext) {
    const t = ctx.result.timeline;
    const s = of(ctx, "server");
    return [
      `For fifteen seconds, traffic jumped sixfold, and your worst second still served ${pct(t?.worst ?? 1)}. The CDN absorbed the repeat requests for the same hot segments; what leaked through landed on ${s.count} origin servers with room to spare.`,
      "A viral video is easy on a CDN because every viewer wants the same few files. The painful part is the cold start: the first request for each segment goes to the origin. Your segment length decides how many distinct objects that is.",
    ];
  },
};
