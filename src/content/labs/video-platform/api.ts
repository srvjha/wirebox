import type { ApiRequirement, Endpoint } from "../../../lib/lab/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());
const has = (fields: Endpoint["body"], re: RegExp) => named(fields).some((f) => re.test(f.name));

export const UPLOAD_URL = /upload|url|put/i;
export const STATUS = /status|state/i;
export const MANIFEST = /manifest|playlist|stream|m3u8|mpd/i;

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "start",
    title: "Start an upload",
    story: "A creator on a train picks a 1.4 GB clip and taps Upload. The app needs somewhere to send those bytes.",
    praise: "A POST to the collection creates the video record and returns where to upload. The API never touches the 1.4 GB itself.",
    hint: "Try POST /videos with { title, size_bytes }, answering 201 with { video_id, upload_url }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push(`Creating a video record is a POST to the collection, not a ${e.method}.`);
      if (!e.path.startsWith("/") || segments(e.path).length === 0) p.push("Give it a path that names the collection, like /videos.");
      else if (params(e.path).length) p.push("The video doesn't have an id yet, so the id can't be in the path. Post to the collection.");
      if (!has(e.body, /title|name/i)) p.push("Take a title in the body so the video has a name from the start.");
      if (!has(e.body, /size|bytes|length/i)) p.push("Send the file size (size_bytes) so the server can pick single or multipart upload and reject files that are too big.");
      if (e.status !== 201) p.push(`${e.status} isn't quite right: a new video record was created, so answer 201 Created.`);
      if (!has(e.response, /id/i)) p.push("Return the new video's id so the app can refer to it later.");
      if (!has(e.response, UPLOAD_URL)) p.push("Return an upload_url. The phone sends the file there, straight to object storage, instead of through your API servers.");
      return p;
    },
  },
  {
    id: "complete",
    title: "Finish the upload",
    story: "The last byte lands. The creator should see 'processing' immediately, not a spinner for ten minutes.",
    praise: "202 Accepted says exactly the right thing: 'I've got it, the work happens later.' The video's status will tell the app when it's ready.",
    hint: "Try POST /videos/:id/complete answering 202 with { status: string }.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method === "GET") p.push("This changes the video's state (it starts the pipeline), so it can't be a GET.");
      if (!params(e.path).length) p.push("Name the video in the path, like /videos/:id/complete.");
      if (all.start && e.path === all.start.path) p.push("This needs its own path, separate from starting the upload.");
      if (e.status === 200 || e.status === 201) p.push(`${e.status} suggests the video is ready. Transcoding takes minutes and hasn't started yet: answer 202 Accepted.`);
      else if (e.status !== 202) p.push(`${e.status} doesn't fit. The request was accepted for later processing: 202.`);
      if (!has(e.response, STATUS)) p.push("Return the video's status (processing) so the app can show it.");
      return p;
    },
  },
  {
    id: "watch",
    title: "Watch a video",
    story: "A fan opens a video on a flaky mobile connection. The player needs to know what to fetch and whether it's ready.",
    praise: "A GET returns status plus a manifest address. The player reads the manifest and fetches segments straight from the CDN.",
    hint: "Try GET /videos/:id answering 200 with { title, status, manifest_url }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push(`Reading a video is a GET, not a ${e.method}.`);
      if (!params(e.path).length) p.push("Name the video in the path, like /videos/:id.");
      if (e.status !== 200) p.push(`Answer 200 OK; ${e.status} doesn't describe a successful read.`);
      if (!has(e.response, STATUS)) p.push("Include status. While a video is processing the player shows a placeholder instead of failing.");
      if (!has(e.response, MANIFEST)) p.push("Include manifest_url: the playlist listing every quality and segment. The player picks segments from it as its network changes.");
      return p;
    },
  },
];
