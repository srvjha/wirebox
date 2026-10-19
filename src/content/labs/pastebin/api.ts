import type { ApiRequirement, Endpoint } from "../../../lib/lab/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const shape = (path: string) => `/${segments(path).map((s) => (s.startsWith(":") ? ":p" : s.toLowerCase())).join("/")}`;
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());

export const TEXT_FIELD = /content|text|body|paste|code|data/i;
export const EXPIRY_FIELD = /expire|expiry|ttl|lifetime|duration|until/i;
export const ID_FIELD = /id|key|code|slug|url|link/i;

/** The path parameter reads look a paste up by, e.g. "id". */
export function pasteParam(api: Record<string, Endpoint>) {
  const p = api.read ? params(api.read.path)[0] : undefined;
  return p ? p.slice(1).toLowerCase() : "id";
}

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "create",
    title: "Paste some text",
    story: "A developer pastes a 200-line stack trace, picks “delete after one day”, and gets a link to drop into the team chat.",
    praise: "POST to a collection, the text and its lifetime in the body, 201 Created with the new id. Exactly the shape clients expect.",
    hint: "Try POST /pastes with { content: string, expires_in: integer } answering 201 with { id: string, url: url }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method === "GET") p.push("GET must never create anything: crawlers and link previews send GETs freely. Use POST.");
      else if (e.method === "PUT") p.push("PUT means “store this at the address I'm giving you”, but the server picks the id. POST to the collection instead.");
      else if (e.method !== "POST") p.push(`${e.method} changes or removes something that already exists. Creating a paste is a POST.`);
      if (!e.path.startsWith("/") || segments(e.path).length === 0) p.push("Give it a path that names the collection, like /pastes.");
      else if (params(e.path).length) p.push("The id doesn't exist until the server makes it, so it can't be in the request path. Post to the collection, like /pastes.");
      const body = named(e.body);
      const text = body.find((f) => TEXT_FIELD.test(f.name));
      if (!text) p.push("The server needs the text to store. Add a body field for it, like content.");
      else if (text.type !== "string") p.push(`${text.name} is typed as ${text.type}, but pasted text is a string.`);
      const exp = body.find((f) => EXPIRY_FIELD.test(f.name));
      if (!exp) p.push("Pastes should be able to expire. Add a body field for how long to keep it, like expires_in.");
      else if (exp.type !== "integer" && exp.type !== "timestamp") p.push(`${exp.name} should be a number of seconds (integer) or a timestamp, not ${exp.type}.`);
      if (e.status === 200) p.push("200 OK works, but 201 Created says precisely what happened: a new resource exists. Use 201.");
      else if (e.status !== 201) p.push(`${e.status} doesn't describe a successful create. Answer 201 Created.`);
      if (!named(e.response).some((f) => ID_FIELD.test(f.name))) p.push("Send the paste's id or link back so the user can share it: add id or url to the response.");
      return p;
    },
  },
  {
    id: "read",
    title: "Open a paste",
    story: "A teammate clicks the link and should see the text, even if a thousand other people clicked it in the same minute.",
    praise: "A GET with the id in the path, 200 OK, text in the body. Safe, cacheable, and a CDN can answer it without asking you.",
    hint: "Try GET /pastes/:id answering 200 with { content: string, expires_at: timestamp }.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push(`Opening a link always sends a GET, and only GETs can be cached by a CDN. ${e.method} can't be.`);
      if (!params(e.path).length) p.push("Which paste? Put the id in the path, like /pastes/:id.");
      if (named(e.body).length) p.push("GET requests don't carry a body. The id in the path is everything the server needs.");
      if (e.status !== 200) p.push(`Answer 200 OK with the text${e.status >= 300 && e.status < 400 ? ", not a redirect" : ""}.`);
      if (!named(e.response).some((f) => TEXT_FIELD.test(f.name))) p.push("Return the text the visitor came for: a field like content.");
      else if (named(e.response).some((f) => TEXT_FIELD.test(f.name) && f.type !== "string")) p.push("Pasted text is a string.");
      if (all.create && e.method === all.create.method && shape(e.path) === shape(all.create.path)) {
        p.push("That's the same method and path as creating a paste, so the server couldn't tell them apart.");
      }
      return p;
    },
  },
  {
    id: "remove",
    title: "Delete a paste",
    story: "Someone pasted an API key by mistake and needs it gone, now. Not tomorrow when it expires.",
    praise: "DELETE on the paste's own address, 204 No Content. Deleting twice is harmless, which is what you want from a retry.",
    hint: "Try DELETE /pastes/:id answering 204 with no response fields.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "DELETE") p.push(`Removing something is a DELETE, not a ${e.method}. The method is how clients and proxies know what the request does.`);
      if (!params(e.path).length) p.push("Which paste? Put the id in the path, like /pastes/:id.");
      if (named(e.body).length) p.push("DELETE doesn't need a body: the address already says what to remove.");
      if (e.status === 200) p.push("200 OK is acceptable, but with nothing to say back, 204 No Content is the precise answer.");
      else if (e.status !== 204) p.push(`${e.status} doesn't describe a successful delete. Answer 204 No Content.`);
      if (named(e.response).length) p.push("A 204 has no body. Remove the response fields.");
      if (all.read && e.method === all.read.method && shape(e.path) === shape(all.read.path)) {
        p.push("Same method and path as reading a paste: pick the verb that matches the intent.");
      }
      return p;
    },
  },
];
