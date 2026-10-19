import type { ApiRequirement, Endpoint } from "../../../lib/drill/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());

const VERSION = /version|rev|seq|base|since/i;
const OPS = /op|change|edit|delta|patch/i;
const CONTENT = /content|text|body|doc|data|snapshot/i;

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "create",
    title: "Create a document",
    story: "Asha clicks New document and lands in a blank page that already has an address.",
    praise: "POST to a collection, 201 Created, and the new id comes back so everyone can open the same address.",
    hint: "Try POST /docs with { title: string }, answering 201 with { id: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push(`Creating something new is a POST; ${e.method} is for things that already exist.`);
      if (segments(e.path).length === 0) p.push("Give it a collection path like /docs.");
      else if (params(e.path).length) p.push("The id doesn't exist until the server makes it, so keep it out of the path. Post to the collection, like /docs.");
      if (e.status !== 201) p.push(`Answer 201 Created, not ${e.status}: a new document now exists.`);
      if (!named(e.response).some((f) => /id|url|link/i.test(f.name))) p.push("Send the new document's id back so the client can open it and share it.");
      return p;
    },
  },
  {
    id: "open",
    title: "Open a document",
    story: "Ben opens the link Asha sent. He needs the document as it is right now, and the version it is at.",
    praise: "A read-only GET that returns the text and the version it is at. The version is what live edits will build on.",
    hint: "Try GET /docs/:id answering 200 with { content: string, version: integer }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Opening a document changes nothing, so it's a GET.");
      if (!params(e.path).length) p.push("Which document? Put its id in the path, like /docs/:id.");
      if (named(e.body).length) p.push("GET requests don't carry a body; the id in the path is enough.");
      if (e.status !== 200) p.push("Answer 200 OK with the document.");
      const r = named(e.response);
      if (!r.some((f) => CONTENT.test(f.name))) p.push("Return the document itself: a field like content.");
      const v = r.find((f) => VERSION.test(f.name));
      if (!v) p.push("Also return the version the content is at. Every live edit says “this applies on top of version N”, so Ben's client needs to know N.");
      else if (v.type !== "integer") p.push(`A version counts up, so ${v.name} should be an integer.`);
      return p;
    },
  },
  {
    id: "send",
    title: "Send edits",
    story: "Typing is sent live over a WebSocket, but a flaky connection falls back to plain HTTP. Either way an edit says what changed and what it was based on.",
    praise: "A POST on the document's operations: what changed, the version it builds on, and the new version in return. That base version is how the server notices two people edited the same moment.",
    hint: "Try POST /docs/:id/ops with { base_version: integer, ops: string }, answering 200 with { version: integer }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST" && e.method !== "PATCH") p.push("Sending edits changes the document. Use POST (each edit is a new operation) or PATCH.");
      if (!params(e.path).length) p.push("Say which document: put the id in the path, like /docs/:id/ops.");
      const b = named(e.body);
      if (!b.some((f) => OPS.test(f.name))) p.push("Send what changed, not the whole document. Add a field for the operations, like ops.");
      const v = b.find((f) => VERSION.test(f.name));
      if (!v) p.push("Without the version the edit was based on, the server can't tell whether someone else edited in between. Add base_version.");
      else if (v.type !== "integer") p.push(`${v.name} counts up, so make it an integer.`);
      if (e.status !== 200 && e.status !== 201 && e.status !== 202) p.push("Answer 200 (or 202 Accepted): the edit was received.");
      const r = named(e.response).find((f) => VERSION.test(f.name));
      if (!r) p.push("Reply with the document's new version so the client knows where it stands.");
      return p;
    },
  },
  {
    id: "catchup",
    title: "Catch up after a gap",
    story: "Ben's train goes into a tunnel. When the signal returns, his client should fetch only what happened while he was away.",
    praise: "A GET for operations after a version: small, cacheable, and the reason reconnecting needn't reload the document.",
    hint: "Try GET /docs/:id/ops answering 200 with { ops: string, version: integer }. The client says which version it last saw.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Fetching changes is a read, so a GET.");
      if (!params(e.path).length) p.push("Which document? Put the id in the path.");
      if (all.send && e.method === all.send.method && e.path.toLowerCase() === all.send.path.toLowerCase())
        p.push("That's the same method and path as sending edits; the server couldn't tell them apart.");
      if (e.status !== 200) p.push("Answer 200 OK with the missed operations.");
      const r = named(e.response);
      if (!r.some((f) => OPS.test(f.name))) p.push("Return the operations the client missed, in a field like ops.");
      if (!r.some((f) => VERSION.test(f.name))) p.push("Return the version they bring the client up to, so it can ask from there next time.");
      return p;
    },
  },
];
