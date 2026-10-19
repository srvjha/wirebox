import type { ApiRequirement, Endpoint } from "../../../lib/lab/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());

const HASH = /hash|chunk|digest|sha|block/i;
const VERSION = /version|rev|base|parent/i;
const CURSOR = /cursor|since|token|seq|offset|after/i;

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "have",
    title: "Ask which chunks the server lacks",
    story: "Before uploading a 400 MB deck, the laptop lists the hashes of its chunks and asks which ones the server doesn't already have.",
    praise: "A read-style question sent as a POST because the list of hashes is too long for a URL. 200 OK with only the missing hashes: this one call is where the bandwidth saving happens.",
    hint: "Try POST /chunks/missing with { hashes: string }, answering 200 with { missing: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push("The list of hashes can be thousands long and doesn't fit in a URL, so send it in a body: use POST (it is still a question, not a change).");
      if (params(e.path).length) p.push("This asks about many chunks at once, so no single hash belongs in the path.");
      if (!named(e.body).some((f) => HASH.test(f.name))) p.push("Send the chunk hashes you want to check, in a field like hashes.");
      if (e.status !== 200) p.push("Answer 200 OK: nothing was created, you're just reporting what is missing.");
      if (!named(e.response).some((f) => /missing|need|unknown|absent|upload|want/i.test(f.name) || HASH.test(f.name)))
        p.push("Answer with the hashes the server doesn't have, like missing. Anything it has is skipped.");
      return p;
    },
  },
  {
    id: "chunk",
    title: "Upload a chunk",
    story: "The server said it lacks chunk 9f2c…; the laptop sends those bytes.",
    praise: "PUT to an address named by the chunk's own hash. Sending it twice does exactly the same thing as sending it once, so retries are always safe.",
    hint: "Try PUT /chunks/:hash with { data: string }, answering 201.",
    check: (e) => {
      const p: string[] = [];
      if (e.method === "POST") {
        p.push("With POST, a retried upload could store the chunk twice. Because the address is the chunk's own hash, PUT is the natural fit: same address, same bytes, same result.");
      } else if (e.method !== "PUT") {
        p.push(`${e.method} isn't how you store bytes at a known address. Use PUT.`);
      }
      if (!params(e.path).length) p.push("The chunk's hash is its name. Put it in the path, like /chunks/:hash.");
      if (!named(e.body).length) p.push("Add the chunk's bytes as a body field (data).");
      if (e.status !== 201 && e.status !== 200 && e.status !== 204) p.push("Answer 201 Created (200 or 204 if it already existed).");
      return p;
    },
  },
  {
    id: "commit",
    title: "Commit a new version of a file",
    story: "All chunks are up. The laptop tells the server: “file 77 is now these chunks, and I started from version 12”.",
    praise: "POST a new version of the file, naming the version it started from. The server can accept it or answer 409 when someone else got there first.",
    hint: "Try POST /files/:id/versions with { base_version: integer, chunks: string }, answering 201 with { version: integer }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push("A commit adds a new version to the file's history, so it's a POST.");
      if (!params(e.path).length) p.push("Which file? Put its id in the path, like /files/:id/versions.");
      const b = named(e.body);
      if (!b.some((f) => /chunk|block|hash|content|manifest/i.test(f.name))) p.push("Say what the new version is made of: the list of chunk hashes (chunks).");
      const v = b.find((f) => VERSION.test(f.name));
      if (!v) p.push("Without the version this edit started from, the server can't detect that someone else committed in the meantime. Add base_version.");
      else if (v.type !== "integer") p.push(`${v.name} counts up, so it should be an integer.`);
      if (e.status !== 201) p.push("A new version now exists: answer 201 Created. (A stale commit would get 409 Conflict.)");
      if (!named(e.response).some((f) => VERSION.test(f.name))) p.push("Reply with the new version number so the device knows where it stands.");
      return p;
    },
  },
  {
    id: "changes",
    title: "Ask what changed",
    story: "The phone was off all night. When it connects, it wants everything that changed since it last looked, and nothing more.",
    praise: "A read-only GET with a cursor: “everything after the point I last saw”. It works the same for a device that was away for ten seconds or ten days.",
    hint: "Try GET /changes answering 200 with { changes: string, cursor: string }. The device sends back the last cursor it got.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Reading changes doesn't change anything, so it's a GET.");
      if (named(e.body).length) p.push("GET requests don't carry a body. A cursor travels in the query string, which isn't modeled here.");
      if (e.status !== 200) p.push("Answer 200 OK with the list of changes.");
      const r = named(e.response);
      if (!r.some((f) => /change|file|event|update|item/i.test(f.name))) p.push("Return the changes themselves, in a field like changes.");
      const c = r.find((f) => CURSOR.test(f.name));
      if (!c) p.push("Return a cursor: the position the device has reached. Next time it asks “after this”, and never re-reads old changes.");
      else if (c.type === "integer" || c.type === "timestamp") p.push(`Consider making ${c.name} an opaque string. A cursor is a bookmark the server controls: today a number, tomorrow something else.`);
      if (all.commit && e.method === all.commit.method && e.path.toLowerCase() === all.commit.path.toLowerCase()) p.push("That's the same address as committing a version.");
      return p;
    },
  },
];
