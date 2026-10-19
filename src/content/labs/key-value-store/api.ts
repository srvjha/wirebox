import type { ApiRequirement, Endpoint } from "../../../lib/lab/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());

const VALUE = /value|data|body|item/i;
const CONTEXT = /context|version|clock|vector|etag|rev/i;

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "get",
    title: "Get a value",
    story: "A Gatepass service asks for the seat map cached under the key map:indie-night-bandra.",
    praise: "GET by key, 200 with the value and a context. The context is what lets a later write say “I'm replacing exactly this version”.",
    hint: "Try GET /kv/:key answering 200 with { value: string, context: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Reading a value changes nothing, so it's a GET.");
      if (!params(e.path).length) p.push("The key is the address. Put it in the path, like /kv/:key.");
      if (named(e.body).length) p.push("GET requests don't carry a body; the key in the path is enough.");
      if (e.status !== 200) p.push(`Answer 200 OK${e.status === 404 ? " (404 is for a key that doesn't exist, which you'd send in that case)" : ""}.`);
      const r = named(e.response);
      if (!r.some((f) => VALUE.test(f.name))) p.push("Return the value, in a field like value.");
      if (!r.some((f) => CONTEXT.test(f.name)))
        p.push("Also return a context (a version or vector clock). With several copies, two replicas can hold different values for a key, and a later write needs to say which one it replaces.");
      return p;
    },
  },
  {
    id: "put",
    title: "Put a value",
    story: "A service stores a new seat map under the same key, replacing the old one.",
    praise: "PUT to the key's address: idempotent, so a client that times out can safely retry. The context says which version is being replaced.",
    hint: "Try PUT /kv/:key with { value: string, context: string }, answering 200 with { context: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method === "POST") p.push("Storing something at a known key is idempotent: do it twice and nothing changes. PUT says that; POST doesn't.");
      else if (e.method !== "PUT") p.push(`${e.method} isn't how you store a value at an address. Use PUT.`);
      if (!params(e.path).length) p.push("The key is the address. Put it in the path, like /kv/:key.");
      const b = named(e.body);
      if (!b.some((f) => VALUE.test(f.name))) p.push("Send the value in the body.");
      if (!b.some((f) => CONTEXT.test(f.name)))
        p.push("Send back the context from the read you're replacing. Without it, two writers who both read version 4 can't tell they're overwriting each other.");
      if (e.status !== 200 && e.status !== 201 && e.status !== 204) p.push("Answer 200 OK (or 201 when the key is new).");
      if (e.status !== 204 && !named(e.response).some((f) => CONTEXT.test(f.name))) p.push("Return the new context so the caller can chain its next write.");
      return p;
    },
  },
  {
    id: "delete",
    title: "Delete a key",
    story: "The event was cancelled; its cached seat map should disappear.",
    praise: "DELETE the key, 204 No Content. Internally, a delete is a write of a tombstone, not an erase, and the next steps will show why.",
    hint: "Try DELETE /kv/:key answering 204 with no response fields.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "DELETE") p.push("Removing something is a DELETE.");
      if (!params(e.path).length) p.push("Which key? Put it in the path.");
      if (named(e.body).length) p.push("A DELETE doesn't need a body: the key in the path says what to remove.");
      if (e.status !== 204 && e.status !== 200) p.push("Answer 204 No Content: it worked and there's nothing to say.");
      if (e.status === 204 && named(e.response).length) p.push("204 means there is no body. Remove the response fields.");
      if (all.put && e.method === all.put.method) p.push("That's the same method as put.");
      return p;
    },
  },
];
