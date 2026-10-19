import type { ApiRequirement, Endpoint } from "../../../lib/drill/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const shape = (path: string) => `/${segments(path).map((s) => (s.startsWith(":") ? ":p" : s.toLowerCase())).join("/")}`;
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());

export const STATUS_FIELD = /status|state|presence|online/i;
export const ONLINE_FIELD = /online|status|state|presence|active/i;
export const SEEN_FIELD = /seen|active|last|since/i;
export const LIST_FIELD = /friend|online|user|ids|presence|members/i;

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "set",
    title: "Set my status",
    story: "A fan opens the app, or picks “away”, and their friends should see it.",
    praise: "PUT on the user's own presence address: it replaces the current status, so sending it twice leaves the same result. 204 because there's nothing to hand back.",
    hint: "Try PUT /users/:user_id/presence with { status: string } answering 204 with no response fields.",
    check: (e) => {
      const p: string[] = [];
      if (e.method === "POST") p.push("POST would add a new thing every time. A user has exactly one presence, so replace it: PUT. It also makes retries harmless.");
      else if (e.method !== "PUT" && e.method !== "PATCH") p.push(`Changing a user's own status is a PUT or PATCH, not a ${e.method}.`);
      if (!params(e.path).length) p.push("Whose status? Put the user in the path, like /users/:user_id/presence.");
      if (!named(e.body).some((f) => STATUS_FIELD.test(f.name))) p.push("What is the new status? Add a body field like status (online, away …).");
      if (e.status !== 204 && e.status !== 200) p.push(`Answer 204 No Content (or 200), not ${e.status}.`);
      else if (e.status === 200 && named(e.response).length === 0) p.push("A 200 normally carries a body. With nothing to return, 204 No Content is the precise answer.");
      if (e.status === 204 && named(e.response).length) p.push("A 204 has no body. Remove the response fields.");
      return p;
    },
  },
  {
    id: "get",
    title: "Is this person online?",
    story: "Someone taps a friend's profile and sees a green dot, or “last seen 3 h ago”.",
    praise: "A read-only GET with both pieces of the answer: online now, and when they were last seen. The second is what you show when the first is false.",
    hint: "Try GET /users/:user_id/presence answering 200 with { online: boolean, last_seen: timestamp }.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Reading someone's status changes nothing, so it's a GET.");
      if (!params(e.path).length) p.push("Which user? Put the id in the path, like /users/:user_id/presence.");
      if (named(e.body).length) p.push("GET requests don't carry a body.");
      if (e.status !== 200) p.push(`Answer 200 OK, not ${e.status}.`);
      const r = named(e.response);
      const online = r.find((f) => ONLINE_FIELD.test(f.name));
      if (!online) p.push("Return whether they're online: a field like online (boolean).");
      else if (/online|active/i.test(online.name) && online.type !== "boolean") p.push(`${online.name} is a yes/no, so make it a boolean.`);
      const seen = r.find((f) => SEEN_FIELD.test(f.name));
      if (!seen) p.push("For offline users, show when they were last around: add last_seen (timestamp).");
      else if (seen.type !== "timestamp") p.push(`${seen.name} is a moment in time: make it a timestamp.`);
      if (all.set && e.method === all.set.method && shape(e.path) === shape(all.set.path)) p.push("Same method and path as setting status.");
      return p;
    },
  },
  {
    id: "friends",
    title: "Who's online among my friends?",
    story: "Opening the app shows a list of 200 friends. Asking for each one would be 200 requests.",
    praise: "One request for the whole friend list, answered from one place. 200 round trips become one.",
    hint: "Try GET /users/:user_id/friends/presence answering 200 with { friends: string }.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Fetching a list is a GET.");
      if (!params(e.path).length) p.push("Whose friends? Put the user in the path, like /users/:user_id/friends/presence.");
      if (!segments(e.path).some((s) => /friend/i.test(s))) p.push("The path should say it's about friends, so it doesn't collide with a single user's presence.");
      if (named(e.body).length) p.push("GET requests don't carry a body.");
      if (e.status !== 200) p.push(`Answer 200 OK, not ${e.status}.`);
      if (!named(e.response).some((f) => LIST_FIELD.test(f.name))) p.push("Return the list: a field like friends holding who is online.");
      if (all.get && shape(e.path) === shape(all.get.path)) p.push("That's the same address as a single user's presence; the server couldn't tell them apart.");
      return p;
    },
  },
];
