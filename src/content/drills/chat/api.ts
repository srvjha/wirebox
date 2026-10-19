import type { ApiRequirement, Endpoint } from "../../../lib/drill/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());
const has = (fields: Endpoint["body"], re: RegExp) => named(fields).some((f) => re.test(f.name));

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "send",
    title: "Send a message",
    story: "Asha types 'running 10 mins late' in the group chat on a train. The connection drops right as she hits send, and her phone tries again.",
    praise: "POST to the conversation's messages. The client-generated id makes a retry harmless, and the server's sequence number gives the message its place in line.",
    hint: "Try POST /conversations/:id/messages with { client_msg_id, text }, answering 201 with { message_id, seq: integer }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push(`Sending creates a new message: use POST, not ${e.method}.`);
      if (!params(e.path).length) p.push("Say which conversation this goes to: put it in the path, like /conversations/:id/messages.");
      if (!/message/i.test(e.path)) p.push("The path should name what's created: …/messages.");
      if (!has(e.body, /text|body|content|message/i)) p.push("Take the message text in the body.");
      if (!has(e.body, /client|request|idempot|nonce|uuid|dedup/i))
        p.push("When the phone retries after a dropped connection, how does the server know it's the same message? Send a client-generated id (client_msg_id) with it.");
      if (e.status !== 201) p.push(`${e.status} isn't quite right: a message now exists, so answer 201 Created.`);
      if (!has(e.response, /seq|order|position|index/i)) p.push("Return the message's sequence number in the conversation. Ordering depends on it.");
      return p;
    },
  },
  {
    id: "sync",
    title: "Catch up after being offline",
    story: "Ravi's phone was in a tunnel for forty minutes. When it reconnects, it should fetch exactly what it missed, no more.",
    praise: "A GET with 'everything after seq N' makes sync cheap and exact: the phone remembers one number per conversation.",
    hint: "Try GET /conversations/:id/messages with an after_seq field, answering 200 with { messages: string }.",
    check: (e, all) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push(`Fetching is a GET, not a ${e.method}.`);
      if (!params(e.path).length) p.push("Name the conversation in the path.");
      if (!has(e.body, /after|since|seq|cursor|from/i))
        p.push("Without a cursor the phone would re-download the whole history every time. Add after_seq so it can ask for only what's new.");
      if (e.status !== 200) p.push(`Answer 200 OK; ${e.status} doesn't describe a successful read.`);
      if (!has(e.response, /message|items|data/i)) p.push("Return the messages.");
      if (all.send && e.method === all.send.method && e.path === all.send.path) p.push("Reading and sending can't be the same method on the same path.");
      return p;
    },
  },
  {
    id: "receipt",
    title: "Delivery and read receipts",
    story: "Meera's phone shows two grey ticks once Asha's message arrives and blue when it's opened. Millions of these a minute.",
    praise: "Small, idempotent, and no body coming back: 204. Receipts are the highest-volume call in a chat app, so keep them light.",
    hint: "Try POST /messages/:id/receipt with { state: string } answering 204.",
    check: (e) => {
      const p: string[] = [];
      if (e.method === "GET" || e.method === "DELETE") p.push(`Recording a receipt changes state, so it isn't a ${e.method}.`);
      if (!params(e.path).length) p.push("Name the message in the path, like /messages/:id/receipt.");
      if (!has(e.body, /state|status|type|kind/i)) p.push("Say which receipt it is (delivered or read) with a state field.");
      if (e.status === 201) p.push("Nothing new needs to be handed back to the client. 204 No Content is lighter.");
      else if (e.status !== 204 && e.status !== 200) p.push(`${e.status} doesn't fit. A receipt has nothing to return: 204.`);
      if (e.status === 204 && named(e.response).length) p.push("A 204 has no body. Clear the response fields, or use 200.");
      return p;
    },
  },
];
