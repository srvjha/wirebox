import type { ApiRequirement, Endpoint } from "../../../lib/drill/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const shape = (path: string) => `/${segments(path).map((s) => (s.startsWith(":") ? ":p" : s.toLowerCase())).join("/")}`;
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());

export const LIST_FIELD = /suggest|complet|result|term|item|match|option/i;
export const QUERY_FIELD = /query|q$|term|text|search|prefix/i;

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "suggest",
    title: "Suggest completions",
    story: "A fan has typed “ind” into the Gatepass search box. Within a blink they should see “indie night bandra”, “indian ocean live”…",
    praise: "A GET with the prefix in the path. Same prefix, same answer: exactly what a browser, a CDN and a Redis cache can all reuse.",
    hint: "Try GET /suggestions/:prefix answering 200 with { suggestions: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push(`Asking for suggestions changes nothing, so it's a GET. Only GETs can be cached by the browser and the CDN, and caching is how this endpoint gets fast. ${e.method} can't be.`);
      if (!params(e.path).length) p.push("The prefix has to be part of the address, like /suggestions/:prefix, so each prefix is its own cacheable URL.");
      if (named(e.body).length) p.push("GET requests don't carry a body. Put the prefix in the path.");
      if (e.status !== 200) p.push(`Answer 200 OK${e.status === 404 ? " (an unknown prefix still has an answer: an empty list)" : ""}.`);
      if (!named(e.response).some((f) => LIST_FIELD.test(f.name))) p.push("Return the completions: a field like suggestions.");
      return p;
    },
  },
  {
    id: "record",
    title: "Remember what people search",
    story: "When a fan presses enter, the term should count toward tomorrow's suggestions. The fan shouldn't wait on that.",
    praise: "A POST that answers right away with 202 Accepted: the search is recorded in the background, and typing never waits on bookkeeping.",
    hint: "Try POST /searches with { query: string } answering 202, no response fields.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push(`Recording an event is a POST, not a ${e.method}: each call adds something new.`);
      if (params(e.path).length) p.push("There's no existing thing to address; post to a collection like /searches.");
      if (!named(e.body).some((f) => QUERY_FIELD.test(f.name))) p.push("What was searched? Add a body field like query.");
      if (e.status === 201) p.push("201 says a new resource the caller can fetch was created. Nobody will ever GET a search-log line, so 202 (or 204) fits better.");
      else if (e.status !== 202 && e.status !== 204) p.push(`${e.status} isn't right for fire-and-forget logging. Answer 202 Accepted or 204 No Content.`);
      return p;
    },
  },
  {
    id: "trending",
    title: "What's trending",
    story: "Before anyone types, the search box can show what everyone is looking for right now.",
    praise: "A read-only GET at a fixed address. The same answer for everyone makes it the easiest thing on the whole site to cache.",
    hint: "Try GET /trending answering 200 with { terms: string }.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Reading the trending list doesn't change anything, so it's a GET.");
      if (params(e.path).length) p.push("Trending is the same for everyone: no parameter needed. A fixed path like /trending is cacheable by anyone.");
      if (named(e.body).length) p.push("GET requests don't carry a body.");
      if (e.status !== 200) p.push(`Answer 200 OK, not ${e.status}.`);
      if (!named(e.response).some((f) => LIST_FIELD.test(f.name))) p.push("Return the terms: a field like terms.");
      if (all.suggest && shape(e.path) === shape(all.suggest.path)) p.push("Same address as the suggestions endpoint: the server couldn't tell them apart.");
      return p;
    },
  },
];
