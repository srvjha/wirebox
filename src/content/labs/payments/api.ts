import type { ApiRequirement, Endpoint } from "../../../lib/lab/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());

export const KEY_FIELD = /idem|key|request_id|nonce/i;
export const AMOUNT_FIELD = /amount|cents|total|price/i;

function amountProblems(fields: Endpoint["body"]) {
  const p: string[] = [];
  const a = named(fields).find((f) => AMOUNT_FIELD.test(f.name));
  if (!a) p.push("Say how much. Add an amount field.");
  else if (a.type !== "integer") p.push(`${a.name} is typed ${a.type}. Money is an integer count of the smallest unit (paise, cents): floats turn 0.1 + 0.2 into 0.30000000000000004.`);
  if (!named(fields).some((f) => /currency|ccy/i.test(f.name))) p.push("An amount means nothing without a currency. Add currency.");
  return p;
}

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "create",
    title: "Take a payment",
    story: "A fan pays ₹4,500 for two tickets. The phone may retry if the response never arrives.",
    praise: "A POST with an integer amount, a currency, a token and an idempotency key, answered 202 because the provider is slow. A retry cannot double-charge.",
    hint: "Try POST /payments with { amount: integer, currency: string, payment_token: string, idempotency_key: string }, answering 202 with { payment_id: string, status: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push(e.method === "GET" ? "Charging a card changes the world. GET must be safe to repeat, so use POST." : "Creating a payment is a POST.");
      if (params(e.path).length) p.push("The payment does not exist yet, so its id cannot be in the path. POST to the collection, like /payments.");
      p.push(...amountProblems(e.body));
      if (!named(e.body).some((f) => /token|card|method|source/i.test(f.name))) p.push("Send a payment_token from the provider's form, never a raw card number. That keeps your servers out of PCI scope.");
      if (!named(e.body).some((f) => KEY_FIELD.test(f.name))) p.push("Add an idempotency_key. When a request times out the client cannot tell if it worked, and retrying without a key can charge twice.");
      if (e.status === 200) p.push("200 says the charge is done, but money moves in the background. Use 202 Accepted (201 if you create the payment record synchronously).");
      else if (e.status !== 202 && e.status !== 201) p.push(`${e.status} does not describe a payment that was accepted. Use 202.`);
      if (!named(e.response).some((f) => /id/i.test(f.name))) p.push("Return a payment_id so the client can look it up.");
      if (!named(e.response).some((f) => /status|state/i.test(f.name))) p.push("Return a status (pending, succeeded, failed).");
      return p;
    },
  },
  {
    id: "status",
    title: "Check a payment",
    story: "The app polls after a tap. Support also looks up a payment by id when a fan writes in.",
    praise: "A GET by id. Safe to repeat as often as the app likes, and the source of truth when a webhook is late.",
    hint: "Try GET /payments/:payment_id answering 200 with { payment_id: string, status: string, amount: integer }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Reading a payment changes nothing: use GET.");
      if (!params(e.path).length) p.push("Name the payment in the path, like /payments/:payment_id.");
      if (e.status !== 200) p.push(`${e.status} is not the answer to a successful read. Use 200.`);
      if (!named(e.response).some((f) => /status|state/i.test(f.name))) p.push("Return the status. It is the one thing callers want.");
      return p;
    },
  },
  {
    id: "refund",
    title: "Refund",
    story: "The show is cancelled. Every ticket must be refunded once, no matter how many times someone clicks.",
    praise: "A refund is its own resource under the payment, with its own key. Two clicks make one refund.",
    hint: "Try POST /payments/:payment_id/refunds with { amount: integer, idempotency_key: string }, answering 202 with { refund_id: string, status: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push("Creating a refund is a POST. DELETE would suggest the payment never happened; a refund is a new event.");
      if (!params(e.path).length) p.push("A refund belongs to a payment: /payments/:payment_id/refunds.");
      if (!/refund/i.test(e.path)) p.push("Make the refund a resource in the path: …/refunds.");
      if (!named(e.body).some((f) => AMOUNT_FIELD.test(f.name))) p.push("Allow partial refunds: take an amount (an integer in the smallest unit).");
      if (!named(e.body).some((f) => KEY_FIELD.test(f.name))) p.push("Refunds need an idempotency_key too. A double click must not refund twice.");
      if (e.status !== 202 && e.status !== 201) p.push(`${e.status} does not fit: answer 202 Accepted (or 201 Created).`);
      return p;
    },
  },
];
