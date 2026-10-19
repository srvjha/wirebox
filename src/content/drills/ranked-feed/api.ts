import type { ApiRequirement, Endpoint } from "../../../lib/drill/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());
const has = (fields: Endpoint["body"], re: RegExp) => named(fields).some((f) => re.test(f.name));

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "submit",
    title: "Submit a post",
    story: "Isha shares a link to a fan-made poster gallery from last night's gig, with a title.",
    praise: "Plain collection POST, 201 and an id. The post starts life with zero votes.",
    hint: "Try POST /posts with { title, url }, answering 201 with { post_id }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push(`Creating a post is a POST, not a ${e.method}.`);
      if (params(e.path).length) p.push("The post has no id yet. Post to the collection, like /posts.");
      if (!has(e.body, /title|text|name/i)) p.push("A post needs a title.");
      if (e.status !== 201) p.push(`${e.status} isn't quite right: something was created, so answer 201 Created.`);
      if (!has(e.response, /id/i)) p.push("Return the new post's id.");
      return p;
    },
  },
  {
    id: "vote",
    title: "Vote on a post",
    story: "Dev upvotes Isha's post. Then his phone retries because the network blinked.",
    praise: "PUT says 'my vote on this post is up'. Sending it twice leaves one vote. Retries and double taps can't inflate a score.",
    hint: "Try PUT /posts/:id/vote with { direction: string }, answering 204.",
    check: (e) => {
      const p: string[] = [];
      if (e.method === "GET") p.push("Voting changes state, so it can't be a GET.");
      if (e.method === "POST") p.push("With POST, a retry after a timeout counts twice and a patient bot can vote forever. A vote is 'set my vote to X': that's a PUT.");
      if (e.method === "DELETE" || e.method === "PATCH") p.push(`${e.method} doesn't describe 'set my vote'. PUT is the idempotent choice.`);
      if (!params(e.path).length) p.push("Name the post in the path, like /posts/:id/vote.");
      if (!has(e.body, /direction|value|vote|up|dir/i)) p.push("Say which way: add direction (up or down) to the body.");
      if (e.status === 201) p.push("A vote isn't a new addressable thing the client needs back. Answer 204 No Content (or 200).");
      else if (e.status !== 204 && e.status !== 200) p.push(`${e.status} doesn't fit. Answer 204.`);
      return p;
    },
  },
  {
    id: "front",
    title: "Read the front page",
    story: "Thousands of people open the app and ask for 'what's hot right now'.",
    praise: "A GET with a sort and a cursor. The server can answer from a precomputed list, because it's the same for everybody.",
    hint: "Try GET /posts with { sort: string, cursor, limit: integer }, answering 200 with { posts: string, next_cursor: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push(`Reading is a GET, not a ${e.method}.`);
      if (!has(e.body, /sort|rank|order|hot|view/i)) p.push("Add a sort (hot, new, top). The front page is just one ordering of the same posts.");
      if (has(e.body, /^(page|offset)$/i)) p.push("Rankings change under the reader's feet; page numbers would repeat or skip posts. Use a cursor.");
      else if (!has(e.body, /cursor|after|token/i)) p.push("Add a cursor for the next page.");
      if (e.status !== 200) p.push(`Answer 200 OK; ${e.status} doesn't describe a successful read.`);
      if (!has(e.response, /post|items|data/i)) p.push("Return the posts.");
      return p;
    },
  },
];
