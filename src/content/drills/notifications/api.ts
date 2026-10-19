import type { ApiRequirement, Endpoint } from "../../../lib/drill/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const shape = (path: string) => `/${segments(path).map((s) => (s.startsWith(":") ? ":p" : s.toLowerCase())).join("/")}`;
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());

export const WHO_FIELD = /user|recipient|to|customer|account/i;
export const WHAT_FIELD = /template|message|body|text|content|event|type_id/i;
export const CHANNEL_FIELD = /channel|medium|via|kind/i;
export const KEY_FIELD = /idempot|dedup|request_id|message_id|client_id|nonce|key/i;
export const STATUS_FIELD = /status|state/i;

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "send",
    title: "Send a notification",
    story: "The ticketing service asks for “doors open at 7” to go to one fan by SMS, or to a million fans by push.",
    praise: "POST to a collection, 202 Accepted, and an idempotency key in the body. The caller gets an id immediately and the work happens later, safely repeatable.",
    hint: "Try POST /notifications with { user_id: string, channel: string, template: string, idempotency_key: string } answering 202 with { id: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method === "GET") p.push("GET must never trigger a send: link previews and crawlers fire GETs freely. Use POST.");
      else if (e.method !== "POST") p.push(`${e.method} is for changing an existing resource. A new notification is a POST.`);
      if (!e.path.startsWith("/") || segments(e.path).length === 0) p.push("Give it a path that names the collection, like /notifications.");
      else if (params(e.path).length) p.push("The id doesn't exist until the server makes it, so it can't be in the path. Post to the collection.");
      const body = named(e.body);
      if (!body.some((f) => WHO_FIELD.test(f.name))) p.push("Who gets it? Add a body field for the recipient, like user_id.");
      if (!body.some((f) => CHANNEL_FIELD.test(f.name))) p.push("Email, SMS or push? Add a channel field.");
      if (!body.some((f) => WHAT_FIELD.test(f.name))) p.push("What should it say? Add a template (or message) field.");
      if (!body.some((f) => KEY_FIELD.test(f.name)))
        p.push("Networks drop replies, so callers retry, and a retry must not text a fan twice. Add an idempotency_key the caller chooses and the server remembers.");
      if (e.status === 200 || e.status === 201) {
        p.push(`${e.status} claims the message was already delivered or created. Sending takes seconds and can fail, so you've only accepted it: answer 202 Accepted.`);
      } else if (e.status !== 202) p.push(`${e.status} doesn't fit. Answer 202 Accepted: “got it, I'll deliver it”.`);
      if (!named(e.response).some((f) => /id/i.test(f.name))) p.push("Return an id so the caller can ask what happened to it later.");
      return p;
    },
  },
  {
    id: "status",
    title: "Check what happened",
    story: "Support needs to know whether a fan's ticket email left the building.",
    praise: "A read-only GET on one notification, 200 OK, with its status. Because sending is asynchronous, this is how callers find the outcome.",
    hint: "Try GET /notifications/:id answering 200 with { status: string, sent_at: timestamp }.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Looking something up doesn't change it, so it's a GET.");
      if (!params(e.path).length) p.push("Which notification? Put the id in the path, like /notifications/:id.");
      if (named(e.body).length) p.push("GET requests don't carry a body; the id in the path is enough.");
      if (e.status !== 200) p.push(`Answer 200 OK with the details${e.status === 404 ? " (404 is for ids that don't exist)" : ""}.`);
      if (!named(e.response).some((f) => STATUS_FIELD.test(f.name))) p.push("Return where it got to: a status field (queued, sent, failed …).");
      if (all.send && e.method === all.send.method && shape(e.path) === shape(all.send.path)) p.push("Same method and path as sending: the server couldn't tell them apart.");
      return p;
    },
  },
  {
    id: "prefs",
    title: "Respect opt-outs",
    story: "A fan turns off SMS but keeps email and push. Nobody should text them again.",
    praise: "PUT replaces a user's whole preference set at a stable address. Sending it twice leaves the same result, which is what you want from a settings call.",
    hint: "Try PUT /users/:user_id/preferences with { email: boolean, sms: boolean, push: boolean } answering 200.",
    check: (e) => {
      const p: string[] = [];
      if (e.method === "POST") p.push("POST would create a new thing each time. Preferences are one set per user at a fixed address, so PUT (replace) fits and is safe to retry.");
      else if (e.method !== "PUT" && e.method !== "PATCH") p.push(`Updating settings is a PUT or PATCH, not a ${e.method}.`);
      if (!params(e.path).length) p.push("Whose preferences? Put the user in the path, like /users/:user_id/preferences.");
      const flags = named(e.body).filter((f) => f.type === "boolean");
      if (flags.length < 2) p.push("Preferences are per-channel yes/no switches. Add boolean fields for at least two channels, like email and sms.");
      if (e.status !== 200 && e.status !== 204) p.push(`Answer 200 OK (or 204 No Content), not ${e.status}.`);
      return p;
    },
  },
];
