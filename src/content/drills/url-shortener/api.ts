import type { ApiRequirement, Endpoint } from "../../../lib/drill/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const shape = (path: string) => `/${segments(path).map((s) => (s.startsWith(":") ? ":p" : s.toLowerCase())).join("/")}`;
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());

export const URL_FIELD = /url|link|target|dest/i;
export const SLUG_FIELD = /slug|code|short|key|id/i;
export const COUNT_FIELD = /click|count|visit|hit|view/i;

/** The path parameter the redirect looks links up by, e.g. "slug". */
export function slugParam(api: Record<string, Endpoint>) {
  const p = api.redirect ? params(api.redirect.path)[0] : undefined;
  return p ? p.slice(1).toLowerCase() : "slug";
}

/** The body field the create endpoint takes the long URL in, e.g. "long_url". */
export function urlField(api: Record<string, Endpoint>) {
  return api.create ? named(api.create.body).find((f) => URL_FIELD.test(f.name))?.name.toLowerCase() ?? "long_url" : "long_url";
}

/** The response field the stats endpoint returns the click count in, e.g. "clicks". */
export function countField(api: Record<string, Endpoint>) {
  return api.stats ? named(api.stats.response).find((f) => COUNT_FIELD.test(f.name))?.name.toLowerCase() ?? "clicks" : "clicks";
}

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "create",
    title: "Shorten a link",
    story: "Someone pastes https://gatepass.events/e/2024/indie-night-bandra?utm_source=poster and gets a short link back.",
    praise: "POST to a collection, the long URL in the body, 201 Created with the new slug. Textbook.",
    hint: "Try POST /links with a body of { long_url: url }, answering 201 with { slug: string, short_url: url }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method === "GET") {
        p.push("GET should never create anything. Browsers, link previews and crawlers send GETs freely, and each one would mint a new link. Use POST.");
      } else if (e.method === "PUT") {
        p.push("PUT means “store this at exactly the address I'm giving you”. Here the server picks the slug, so the client can't name the address yet. POST to a collection instead.");
      } else if (e.method !== "POST") {
        p.push(`${e.method} changes or removes something that already exists. Creating a new link is a POST.`);
      }
      if (!e.path.startsWith("/") || segments(e.path).length === 0) {
        p.push("Give it a path that names the collection, like /links.");
      } else if (params(e.path).length) {
        p.push("The slug doesn't exist until the server makes it, so it can't be in the request path. Post to the collection, like /links.");
      }
      const body = named(e.body);
      const url = body.find((f) => URL_FIELD.test(f.name));
      if (!url) {
        p.push("The server needs the long URL to shorten. Add a body field for it, like long_url.");
      } else if (url.type !== "url" && url.type !== "string") {
        p.push(`${url.name} is typed as ${url.type}, but a URL is text. Make it a url (or a string).`);
      }
      if (e.status === 200) {
        p.push("200 OK works, but 201 Created says precisely what happened: a new resource now exists. Use 201.");
      } else if (e.status !== 201) {
        p.push(`${e.status} doesn't describe a successful create. Answer 201 Created.`);
      }
      if (!named(e.response).some((f) => SLUG_FIELD.test(f.name))) {
        p.push("Send the short link back so the user can copy it: add slug or short_url to the response.");
      }
      return p;
    },
  },
  {
    id: "redirect",
    title: "Follow a short link",
    story: "A fan taps gp.st/x7Kp2Qa on a poster and should land on the event page.",
    praise: "GET /:slug answered with a 3xx and a Location header, no body. The browser never even shows a page.",
    hint: "Try GET /:slug answering 302 with the Location header on and no response fields.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push(`Tapping a link always sends a GET. A browser can't follow a plain link with ${e.method}.`);
      const segs = segments(e.path);
      if (!segs.some((s) => s.startsWith(":"))) {
        p.push("The path has to carry the code from the short link, as a parameter like /:slug.");
      } else if (segs.length > 1) {
        p.push("Every character of a short link counts. Put the code straight after the domain: /:slug, not /links/:slug.");
      }
      if (named(e.body).length) p.push("GET requests don't carry a body. Everything the server needs is the slug in the path.");
      if (e.status === 200) {
        p.push("A 200 hands the browser a page to show, so it wouldn't go anywhere. Answer with a redirect: a 3xx status.");
      } else if (e.status === 404) {
        p.push("404 is right for a slug that doesn't exist. For one that does, answer with a redirect (301, 302, 307 or 308).");
      } else if (e.status < 300 || e.status >= 400) {
        p.push(`${e.status} isn't a redirect. Use a 3xx status: 301, 302, 307 or 308.`);
      }
      if (!e.location) p.push("A redirect without a Location header leaves the browser stranded. Turn on Location: that's where the long URL goes.");
      if (named(e.response).length) p.push("Redirects don't need a body: the browser jumps to Location without reading it. Remove the response fields.");
      if (all.create && e.method === all.create.method && shape(e.path) === shape(all.create.path)) {
        p.push("This is the same method and path as creating a link, so the server couldn't tell them apart.");
      }
      return p;
    },
  },
  {
    id: "stats",
    title: "See a link's clicks",
    story: "The comedy club that made the link wants to know how many people tapped it.",
    praise: "A read-only GET for one link's numbers, 200 OK, with the count in the body.",
    hint: "Try GET /links/:slug/stats answering 200 with { clicks: integer }.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Reading numbers doesn't change anything, so it's a GET.");
      if (!params(e.path).length) {
        p.push("Which link's clicks? Put the slug in the path, like /links/:slug/stats.");
      } else if (all.redirect && shape(e.path) === shape(all.redirect.path) && e.method === all.redirect.method) {
        p.push("That's the same address as your redirect, so the server can't tell a click from a stats request. Give it its own path, like /links/:slug/stats.");
      }
      if (named(e.body).length) p.push("GET requests don't carry a body; the slug in the path is enough.");
      if (e.status !== 200) p.push(`Answer 200 OK with the numbers${e.status >= 300 && e.status < 400 ? ", not a redirect" : ""}.`);
      const count = named(e.response).find((f) => COUNT_FIELD.test(f.name));
      if (!count) p.push("Return the number they came for: a field like clicks.");
      else if (count.type !== "integer") p.push(`Clicks are whole numbers, so ${count.name} should be an integer.`);
      return p;
    },
  },
];
