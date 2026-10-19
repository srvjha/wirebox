import type { ApiRequirement, Endpoint } from "../../../lib/drill/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());

export const SEAT_FIELD = /seat/i;
export const KEY_FIELD = /idem|key|request_id|nonce/i;
export const EXPIRY_FIELD = /expire|until|ttl|deadline/i;

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "seats",
    title: "See the seat map",
    story: "A fan opens the Arijit Singh show and wants to see which seats are free, held or sold.",
    praise: "A GET under the event, safe to cache, returning each seat with its state. The map is the most-read thing you will build.",
    hint: "Try GET /events/:event_id/seats answering 200 with { seat_id: string, status: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Looking at seats changes nothing, so it is a GET. A GET can be cached by a CDN or Redis, a POST cannot.");
      if (!params(e.path).length) p.push("Seats belong to an event. Put the event in the path, like /events/:event_id/seats.");
      if (!/seat/i.test(e.path)) p.push("Name the thing you are listing: …/seats.");
      if (e.status !== 200) p.push(`${e.status} is not the answer to a successful read. Use 200 OK.`);
      const r = named(e.response);
      if (!r.some((f) => SEAT_FIELD.test(f.name))) p.push("Return each seat's id, like seat_id, so the client can ask to hold it.");
      if (!r.some((f) => /status|state|available/i.test(f.name))) p.push("Return each seat's state (free, held or sold) as status.");
      return p;
    },
  },
  {
    id: "hold",
    title: "Hold a seat",
    story: "She taps seat F12. You promise it to her for a few minutes while she finds her card.",
    praise: "A POST that creates a hold, with its expiry in the response. The client can show a countdown, and the server can honour it.",
    hint: "Try POST /events/:event_id/holds with { seat_id: string }, answering 201 with { hold_id: string, expires_at: timestamp }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push(e.method === "GET" ? "Holding a seat changes state. A GET must never do that: prefetchers and crawlers would hold every seat." : "A new hold is created, so POST is the honest verb.");
      if (!params(e.path).length) p.push("Say which event this hold is for with a path parameter, like /events/:event_id/holds.");
      if (!named(e.body).some((f) => SEAT_FIELD.test(f.name))) p.push("The server must know which seat to hold. Add seat_id to the body.");
      if (e.status === 200) p.push("A hold now exists, so 201 Created says it better than 200.");
      else if (e.status !== 201) p.push(`${e.status} does not describe a successful create. Answer 201 Created.`);
      const r = named(e.response);
      if (!r.some((f) => /hold|id/i.test(f.name))) p.push("Return a hold_id, so the payment can say which hold it settles.");
      const ex = r.find((f) => EXPIRY_FIELD.test(f.name));
      if (!ex) p.push("Return when the hold runs out, like expires_at. The buyer's countdown needs it.");
      else if (ex.type !== "timestamp") p.push(`${ex.name} is a point in time: type it as a timestamp.`);
      return p;
    },
  },
  {
    id: "pay",
    title: "Pay for the hold",
    story: "She pays. The card network can take seconds, and the phone might retry if the tunnel eats the response.",
    praise: "A payment hangs off the hold, carries a key so a retry is safe, and answers 202 because the money moves in the background.",
    hint: "Try POST /holds/:hold_id/payment with { payment_token: string, idempotency_key: string }, answering 202 with { status: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push("Paying creates a charge. Use POST (never GET, which a retry or a crawler would repeat).");
      if (!params(e.path).length) p.push("A payment settles one hold. Put the hold in the path, like /holds/:hold_id/payment.");
      const b = named(e.body);
      if (!b.some((f) => /token|card|method|payment/i.test(f.name))) p.push("Send a payment_token. Never the raw card number, which would drag your servers into PCI scope.");
      if (!b.some((f) => KEY_FIELD.test(f.name))) p.push("Add an idempotency_key. If the phone retries after a timeout, the server needs to recognise it as the same payment.");
      if (e.status === 201 || e.status === 200) p.push(`${e.status} claims the charge is done. The provider is slow and you answer from a queue, so say 202 Accepted: “got it, working on it”.`);
      else if (e.status !== 202) p.push(`${e.status} does not fit. Use 202 Accepted.`);
      if (!named(e.response).some((f) => /status|state/i.test(f.name))) p.push("Return a status (pending, paid, failed) the client can poll.");
      return p;
    },
  },
];
