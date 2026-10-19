import { Box, Diagram, Packet, Tag, Wire } from "@/components/diagram/kit";
import { Callout, KeyIdea } from "@/components/lesson/callout";
import type { DesignStep, Knob, Drill, DrillGraph } from "@/lib/drill/types";
import { API_REQUIREMENTS } from "./api";
import { DEBRIEFS } from "./debriefs";
import { DESIGN, type StepId } from "./scenarios";
import { ENGINES, SCHEMA_CHECKS, STARTER_SCHEMA } from "./schema";

const START: DrillGraph = { nodes: [{ id: "users", kind: "client", x: 0, y: 0 }], edges: [] };
const KNOBS: Knob[] = ["size"];

const P = {
  base: ["client", "server", "db", "storage"] as DesignStep["palette"],
  pipe: ["client", "lb", "server", "db", "storage", "queue", "worker"] as DesignStep["palette"],
  all: ["client", "cdn", "lb", "server", "db", "storage", "queue", "worker"] as DesignStep["palette"],
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

export const videoPlatform: Drill = {
  slug: "video-platform",
  version: 1,
  title: "Design a video platform",
  product: "Video platform",
  intro: (
    <>
      <p>
        Gatepass now hosts recaps: a comedian uploads a 20-minute set from their phone, and ten thousand people watch it that
        night, on everything from stadium Wi-Fi to a bus in the rain. Gatepass TV is a product of its own.
      </p>
      <p>
        Video breaks the habits you learned on text. Files are gigabytes, so they can&apos;t pass through your app servers.
        Turning a raw upload into something every phone can play takes minutes of CPU, so it can&apos;t happen inside a request.
        And streaming is mostly the same few files requested over and over, which makes it the best case for a CDN. You&apos;ll
        build the pipeline in that order.
      </p>
    </>
  ),
  requirements: [
    { kind: "functional", text: "Upload a video", detail: "Up to 2 GB from a phone, on a connection that can drop." },
    { kind: "functional", text: "Process it for every device", detail: "A ladder of qualities from 240p to 1080p." },
    { kind: "functional", text: "Stream it", detail: "Playback starts in a few seconds and adapts to the network." },
    { kind: "non-functional", text: "Uploads never block", detail: "The creator sees 'processing' at once, not a ten-minute spinner." },
    { kind: "non-functional", text: "Fast start, no stalls", detail: "Segments come from an edge server near the viewer." },
    { kind: "non-functional", text: "Survives a viral spike", detail: "Six times normal traffic for a short burst." },
    { kind: "non-functional", text: "Affordable", detail: "Transcoding is the biggest bill; each step sets a budget." },
  ],
  estimates: [
    { label: "Uploads", value: "~2/s", math: "170k videos a day ÷ 86,400 s ≈ 2/s" },
    { label: "Storage added", value: "~1 PB / year", math: "170k × ~1 GB across all renditions × 365 ≈ 62 PB; most are small. Plan in petabytes, not terabytes" },
    { label: "Transcode work", value: "~40 s CPU per video", math: "4 renditions × ~10 s of compute for a typical 5-minute clip" },
    { label: "Segment requests, peak", value: "~60,000/s", math: "300k concurrent viewers ÷ one 6-second segment each" },
  ],
  cacheParam: "video",
  cacheValues: [],
  related: {
    lessons: ["object-storage", "queues-and-workers", "sync-vs-async", "cdn-and-browser-cache", "cache-invalidation", "autoscaling"],
    drills: ["pastebin", "notifications", "file-sync"],
  },
  steps: [
    {
      type: "intro",
      id: "brief",
      title: "Design a video platform",
      short: "The brief",
      minutes: 2,
      how: [
        "Design the API and the data model first.",
        "On the canvas, wire components the way a request travels. Some work is synchronous; the rest happens later through a queue.",
        "Each test sends several kinds of traffic at once (page views, video segments, uploads) and grades each separately.",
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
            An upload has three moments: the creator says &quot;I&apos;m about to send a file&quot;, the file travels, then the
            creator says &quot;done&quot;. Playback is a fourth, separate request. Design one endpoint for each requirement.
          </p>
          <p>Pay attention to what the status code promises. It will decide how your whole pipeline behaves.</p>
        </>
      ),
      requirements: API_REQUIREMENTS,
      after: (
        <p>
          Notice what your API never does: touch the video bytes. Starting an upload returns an address in object storage, the
          phone sends the file there directly, and your servers only learn about it afterwards. That one decision keeps a 2 GB
          file from tying up a connection on every server you own.
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
            The database holds <strong>facts about videos</strong>, not the videos: who owns it, what state it&apos;s in, where
            the original and the finished renditions live. A 5-minute clip is hundreds of megabytes; its metadata row is under a
            kilobyte.
          </p>
          <p>Each check traces back to a field in your API.</p>
        </>
      ),
      engines: ENGINES,
      checks: SCHEMA_CHECKS,
      starter: STARTER_SCHEMA,
      after: (
        <p>
          A <code>status</code> column quietly runs the whole product: the 202 you designed means a video is born
          &quot;processing&quot;, and a worker flips it to &quot;ready&quot; when the last rendition is written.
        </p>
      ),
    },
    design("launch", {
      title: "The first recaps",
      short: "Launch",
      minutes: 4,
      story:
        "Gatepass TV opens with a handful of creators and a few hundred viewers. Uploads go in, videos play back. Keep it simple and cheap.",
      palette: P.base,
      knobs: KNOBS,
      startGraph: START,
      hints: [
        "Three jobs: run the logic, remember the metadata, hold the video files.",
        "Wire Users → API server, then the server to both Postgres (or your engine) and Object storage.",
        "One small server, one database and one object store will do. No need for a load balancer yet.",
      ],
      concepts: [
        { term: "Object storage", text: "Cheap, durable, endlessly scalable storage for big files, addressed by key instead of folder.", lesson: "object-storage" },
        { term: "Metadata vs content", text: "The database knows about the video; storage holds the video.", lesson: "data-modeling" },
      ],
    }),
    {
      type: "read",
      id: "read-pipeline",
      title: "Accept now, transcode later",
      short: "Pipelines",
      minutes: 3,
      body: (
        <>
          <p>
            Phones record in whatever format they like: huge, high bitrate, sometimes unplayable in a browser. Before anyone can
            watch, a worker must <strong>transcode</strong> it: decode, resize and re-encode. A single 5-minute clip costs tens of
            seconds of CPU, nothing like the millisecond a normal request takes.
          </p>
          <p>
            So you can&apos;t do it while the creator waits. The API saves the file, drops a job on a{" "}
            <strong>queue</strong> and answers <strong>202 Accepted</strong>. Workers pull jobs at their own pace, and the video
            shows &quot;processing&quot; until one finishes.
          </p>
          <Diagram w={680} h={190} caption="The upload request ends at the queue; everything after it is asynchronous.">
            <Box x={0} y={68} w={104} label="Phone" icon="phone" />
            <Box x={170} y={68} w={120} label="Storage" sub="raw file" icon="storage" />
            <Box x={170} y={0} w={120} h={46} label="API" icon="server" tone="accent" />
            <Box x={350} y={68} w={104} label="Queue" icon="queue" tone="accent" />
            <Box x={510} y={68} w={110} label="Workers" icon="worker" />
            <Wire points={[[104, 94], [170, 94]]} tone="req" label="PUT file" labelAt={[137, 118]} />
            <Wire points={[[230, 46], [230, 68]]} tone="req" dashed />
            <Wire points={[[290, 94], [350, 94]]} tone="req" />
            <Wire points={[[454, 94], [510, 94]]} tone="req" />
            <Packet points={[[104, 94], [170, 94], [290, 94], [350, 94], [454, 94], [510, 94]]} dur={3} />
            <Tag x={420} y={150} tone="ok">202 already sent</Tag>
          </Diagram>
          <ul>
            <li>
              <strong>Pre-signed URLs.</strong> Your API signs a short-lived address in storage. The phone uploads straight
              there, so no gigabyte ever passes through your app servers.
            </li>
            <li>
              <strong>Workers scale with the queue.</strong> A worker handles eight jobs at once, but a heavy transcode holds
              each thread for many seconds, so you need many workers. Count them: jobs per second × seconds per job ÷ 8.
            </li>
          </ul>
          <KeyIdea>If work takes longer than a person will wait, accept it, queue it, and report progress.</KeyIdea>
        </>
      ),
    },
    design("pipeline", {
      title: "Uploads that don't block",
      short: "Pipeline",
      minutes: 6,
      story:
        "Two videos a second now, each needing about 12 seconds of encoder time, and creators on slow networks keep retrying because the request hangs. Build the pipeline: bytes to storage, a queue, workers, and an honest 202.",
      palette: P.pipe,
      knobs: KNOBS,
      hints: [
        "Wire API server → Object storage → Queue → Workers → Object storage (workers write the renditions back).",
        "Open the Design choices panel: pick the 202 response and the pre-signed URL path.",
        "Each worker finishes about 0.67 jobs a second at this workload. You need 2 per second with headroom: four workers.",
      ],
      concepts: [
        { term: "202 Accepted", text: "The request was understood and queued; the result isn't ready. Pair it with a status the client can check.", lesson: "sync-vs-async" },
        { term: "Queue lag", text: "How long a job waits before a worker picks it up. Rising lag means workers are too few.", lesson: "queues-and-workers" },
        { term: "Pre-signed URL", text: "A temporary, single-purpose address that lets a client upload straight to storage.", lesson: "object-storage" },
      ],
    }),
    {
      type: "read",
      id: "read-cdn",
      title: "Streaming is a CDN job",
      short: "CDN",
      minutes: 3,
      body: (
        <>
          <p>
            Players don&apos;t download a video; they fetch a stream of small files called <strong>segments</strong>, a few
            seconds each. Once written, a segment never changes. That makes video the ideal thing to cache: a popular segment is
            requested by thousands of viewers, and all of them can be served by an edge server a few milliseconds away.
          </p>
          <Diagram w={680} h={170} caption="A hit never reaches your origin. Only the first viewer in each region does.">
            <Box x={0} y={58} w={104} label="Viewers" icon="client" />
            <Box x={190} y={58} w={120} label="CDN edge" icon="cdn" tone="accent" />
            <Box x={400} y={58} w={120} label="Origin" icon="server" />
            <Box x={570} y={58} w={100} label="Storage" icon="storage" />
            <Wire points={[[104, 84], [190, 84]]} tone="req" />
            <Wire points={[[310, 84], [400, 84]]} tone="req" dashed label="miss only" labelAt={[355, 70]} />
            <Wire points={[[520, 84], [570, 84]]} tone="req" />
            <Packet points={[[104, 84], [190, 84]]} dur={1.4} />
            <Packet points={[[104, 84], [190, 84], [310, 84], [400, 84], [520, 84], [570, 84]]} dur={3.6} delay={1} />
            <Tag x={200} y={134} tone="ok">HIT · 5 ms</Tag>
          </Diagram>
          <p>
            Object storage can serve about 50,000 requests a second and your API servers far fewer. A CDN carries a million
            and answers most of the traffic before it reaches either.
          </p>
        </>
      ),
    },
    design("cdn", {
      title: "The Saturday night crowd",
      short: "CDN",
      minutes: 4,
      story:
        "A big comedy festival ends and 300,000 people start watching recaps: 60,000 segment requests a second. Your origin was built for hundreds. Put the CDN in front of the video path.",
      palette: P.all,
      knobs: KNOBS,
      hints: [
        "Run it and look at which nodes are red: segments flow through servers into storage.",
        "Add a CDN between Users and the API server and wire it to your origin.",
        "At a 95% hit rate the CDN answers almost everything; one medium server can handle what leaks through.",
      ],
      concepts: [
        { term: "CDN", text: "Edge servers all over the world that keep copies of popular files near viewers.", lesson: "cdn-and-browser-cache" },
        { term: "Hit rate", text: "Share of requests the CDN answers itself. Your origin sees only the misses.", lesson: "why-cache" },
      ],
    }),
    {
      type: "read",
      id: "read-abr",
      title: "Adaptive bitrate",
      short: "Adaptive bitrate",
      minutes: 3,
      body: (
        <>
          <p>
            One 1080p file is a problem for a phone on a weak signal: it can&apos;t download fast enough, so the video stalls.
            The fix is to transcode every upload into a <strong>ladder</strong>: 240p, 480p, 720p, 1080p. Each rendition is cut
            into segments, and a small text file called the <strong>manifest</strong> (HLS&apos;s .m3u8) lists them.
          </p>
          <p>
            The player downloads a segment, measures how fast it arrived, and picks the quality of the next one. Network
            improves? Step up. Gets worse? Step down. No stall.
          </p>
          <Callout tone="warn" title="Two costs to know">
            More renditions mean several times more transcoding per upload. And segment length is a dial: short segments let the
            player react faster but make millions of tiny objects (the CDN holds fewer of them warm); long ones cache well but
            make playback wait for a big first chunk.
          </Callout>
        </>
      ),
    },
    design("ladder", {
      title: "Every phone, every network",
      short: "Adaptive",
      minutes: 6,
      story:
        "Viewers on trains and in stadium basements are stalling on the single 1080p file. Make a ladder of renditions with manifests, and decide how long a segment should be. Transcoding work per video roughly triples.",
      palette: P.all,
      knobs: KNOBS,
      hints: [
        "Open Design choices: select the ladder and choose a segment length.",
        "A ladder triples transcode time per video, so your four workers won't keep up. Run it and read the queue lag.",
        "Each video now needs about 40 seconds of encoder time: a worker finishes 0.2 jobs a second, so ten workers just match 2 uploads a second.",
      ],
      concepts: [
        { term: "Adaptive bitrate (ABR)", text: "The player switches between renditions segment by segment as the network changes.", lesson: "cdn-and-browser-cache" },
        { term: "Manifest", text: "A playlist file listing every rendition and its segments.", lesson: "object-storage" },
        { term: "Segment length", text: "Short = quick quality switches, many objects. Long = fewer objects, slow start.", lesson: "tradeoffs" },
      ],
    }),
    design("viral", {
      title: "A video goes viral",
      short: "Viral spike",
      minutes: 5,
      story:
        "A comic's set is shared in every group chat at once. For fifteen seconds, plays and segment requests jump sixfold. The CDN is warm for yesterday's videos, not this one.",
      palette: P.all,
      knobs: KNOBS,
      hints: [
        "Watch the timeline: the dip at second 5 is the spike. Which node saturates first?",
        "Misses go to the origin, so the origin tier must carry the spike's leak-through. Add a load balancer and more servers.",
        "Segment length changes the CDN hit rate. Very short segments leak much more to the origin.",
      ],
      concepts: [
        { term: "Cold cache", text: "The first request for each object always misses. A brand-new video is cold everywhere.", lesson: "thundering-herd" },
        { term: "Headroom for bursts", text: "Size the origin for the leak-through of a spike, not for the average.", lesson: "autoscaling" },
      ],
    }),
    {
      type: "choose",
      id: "split",
      title: "How do you transcode a long video?",
      short: "Transcoding strategy",
      minutes: 3,
      body: (
        <p>
          A 90-minute talk takes one worker over ten minutes at this ladder. Creators won&apos;t wait that long to see their
          video. You can change how the job is cut up.
        </p>
      ),
      prompt: "Which would you build?",
      options: [
        {
          id: "whole",
          title: "One job per video",
          summary: "A single worker transcodes the whole file, rendition after rendition.",
          pros: ["Simple to build and debug", "One status to track", "Cheapest at small scale"],
          cons: ["A 90-minute video takes a very long time", "A crash near the end redoes everything"],
          when: "Pick it while most videos are short and publishing delay doesn't matter.",
        },
        {
          id: "chunks",
          title: "Split into chunks, transcode in parallel",
          summary: "Cut the file into 30-second pieces, transcode each on its own worker, then stitch the manifests together.",
          pros: ["A long video finishes in roughly the time of a short one", "A failed chunk retries alone", "Workers stay evenly busy"],
          cons: ["A fan-out/fan-in step to coordinate", "Cuts must land on keyframes", "More jobs to monitor"],
          when: "Pick it once long videos are common, or when time-to-publish is a product feature.",
        },
        {
          id: "tiered",
          title: "Fast low-quality first, the rest later",
          summary: "Produce a 480p rendition right away so the video is watchable, then finish the other renditions in the background.",
          pros: ["Creators see 'ready' within a minute", "Heavy renditions can use cheaper spare capacity"],
          cons: ["A video is briefly available in fewer qualities", "The manifest changes after publish"],
          when: "Pick it when speed to first view matters more than having everything at once.",
        },
      ],
      after: (
        <p>
          Each option changes what &quot;ready&quot; means, which is why the <code>status</code> column in your schema is worth
          more than it looks: it can grow from two states into a small state machine without touching the files.
        </p>
      ),
    },
    {
      type: "finish",
      id: "finish",
      title: "You designed a video platform",
      short: "Wrap-up",
      minutes: 2,
      body: (
        <p>
          Four ideas carried this design: <strong>bytes bypass your servers</strong> (pre-signed URLs and object storage),{" "}
          <strong>slow work goes behind a queue</strong> (202 and workers), <strong>popular files are served from the edge</strong>{" "}
          (CDN) and <strong>quality adapts on the viewer&apos;s side</strong> (ladders and manifests). The same shape handles
          photo processing, document conversion, and anything where the work is heavy and the audience is large.
        </p>
      ),
    },
  ],
};
