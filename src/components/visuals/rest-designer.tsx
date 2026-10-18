"use client";

import { useState } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLesson } from "@/components/lesson";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { VisualFrame } from "./foundations-kit";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

type Rule = { method: Method; path: RegExp; verdict: "right" | "close"; note: string };
type Task = { id: string; action: string; answer: string; rules: Rule[]; methodHint: string };

const ID = "\\{id\\}";
const re = (s: string) => new RegExp(`^${s.replaceAll("{id}", ID)}$`);

export const restTasks: Task[] = [
  {
    id: "list-events",
    action: "List upcoming events",
    answer: "GET /events",
    methodHint: "Reading data is GET.",
    rules: [
      { method: "GET", path: re("/events"), verdict: "right", note: "A collection is a plural noun. Filters like ?city=pune go in the query string." },
      { method: "GET", path: re("/event"), verdict: "close", note: "Use the plural for collections: /events. It reads as “the events”." },
    ],
  },
  {
    id: "get-event",
    action: "Show one event's details",
    answer: "GET /events/{id}",
    methodHint: "Reading data is GET.",
    rules: [
      { method: "GET", path: re("/events/{id}"), verdict: "right", note: "One item lives under its collection, identified by its id." },
      { method: "GET", path: re("/event/{id}"), verdict: "close", note: "Keep the plural collection name: /events/{id}." },
    ],
  },
  {
    id: "book",
    action: "Book a ticket for an event",
    answer: "POST /events/{id}/bookings",
    methodHint: "Creating something new, where the server picks its id, is POST.",
    rules: [
      { method: "POST", path: re("/events/{id}/(bookings|tickets)"), verdict: "right", note: "Nesting under the event says the booking belongs to it. Return 201 Created with the new booking." },
      { method: "POST", path: re("/(bookings|tickets)"), verdict: "right", note: "Also fine: put the event id in the body. Return 201 Created." },
      { method: "PUT", path: re("/events/{id}/(bookings|tickets)(/{id})?"), verdict: "close", note: "PUT replaces something at a URL you already know. The server assigns booking ids, so creating is POST." },
    ],
  },
  {
    id: "cancel",
    action: "Cancel a booking",
    answer: "DELETE /bookings/{id}",
    methodHint: "Removing is DELETE; changing a status is PATCH.",
    rules: [
      { method: "DELETE", path: re("(/events/{id})?/(bookings|tickets)/{id}"), verdict: "right", note: "DELETE removes the booking from the client's point of view. The server can still keep the row with status = cancelled." },
      { method: "PATCH", path: re("(/events/{id})?/(bookings|tickets)/{id}"), verdict: "right", note: "Also good: PATCH with { \"status\": \"cancelled\" } makes the state change explicit." },
      { method: "POST", path: re("(/events/{id})?/(bookings|tickets)/{id}/cancel(lation)?"), verdict: "right", note: "An action sub-resource is a common, pragmatic choice when cancelling triggers a refund." },
    ],
  },
  {
    id: "my-bookings",
    action: "List my bookings",
    answer: "GET /me/bookings",
    methodHint: "Reading data is GET.",
    rules: [
      { method: "GET", path: re("/(me|users/me)/(bookings|tickets)"), verdict: "right", note: "/me makes it clear the server uses the signed-in user, not an id the client chose." },
      { method: "GET", path: re("/(bookings|tickets)"), verdict: "right", note: "Works if the server filters by the signed-in user. Never trust a ?userId= from the client." },
      { method: "GET", path: re("/users/{id}/(bookings|tickets)"), verdict: "close", note: "Fine for admins, but the server must check that {id} is the signed-in user, or anyone can read anyone's bookings." },
    ],
  },
  {
    id: "change-venue",
    action: "Organiser changes an event's venue",
    answer: "PATCH /events/{id}",
    methodHint: "Changing some fields of an existing thing is PATCH.",
    rules: [
      { method: "PATCH", path: re("/events/{id}"), verdict: "right", note: "PATCH sends only the fields that change: { \"venueId\": 7 }." },
      { method: "PUT", path: re("/events/{id}"), verdict: "close", note: "PUT means “here is the whole event”. Forget a field and you wipe it. PATCH changes only what you send." },
      { method: "PATCH", path: re("/events/{id}/venue"), verdict: "close", note: "Works, but the venue is a field of the event. PATCH /events/{id} keeps the API smaller." },
    ],
  },
];

const VERB = /(^|\/)(?!bookings?(\/|$))(get|list|fetch|create|add|make|book|update|edit|change|delete|remove|cancel)[a-z]*(\/|$)/;

/** "/Events/42/" -> "/events/{id}" */
export function normalizePath(raw: string) {
  let p = raw.trim().toLowerCase().split("?")[0].replace(/\s+/g, "");
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/+$/, "") || "/";
  return p
    .split("/")
    .map((seg) => (/^(\{.*\}|:.+|<.*>|\[.*\]|\d+|id|(event|booking|ticket|user|venue)_?id)$/.test(seg) ? "{id}" : seg))
    .join("/");
}

type Result = { verdict: "right" | "close" | "wrong"; note: string };

export function grade(task: Task, method: Method, raw: string): Result {
  const path = normalizePath(raw);
  const hit = task.rules.find((r) => r.method === method && r.path.test(path));
  if (hit) return { verdict: hit.verdict, note: hit.note };
  const pathOk = task.rules.find((r) => r.verdict === "right" && r.path.test(path));
  if (pathOk) return { verdict: "close", note: `Good path, wrong method. ${task.methodHint}` };
  if (VERB.test(path))
    return { verdict: "wrong", note: `Paths name things, not actions; the method is the verb. ${task.methodHint}` };
  if (/\/(event|booking|ticket)(\/|$)/.test(path))
    return { verdict: "wrong", note: "Use plural collection names like /events and /bookings." };
  return { verdict: "wrong", note: `${task.methodHint} Think about which collection this lives in.` };
}

/** Type method + path for six Gatepass actions; graded with specific notes. */
export function RestDesigner() {
  const { slug } = useLesson();
  const [answers, setAnswers] = useState(() => restTasks.map(() => ({ method: "GET" as Method, path: "" })));
  const [results, setResults] = useState<Result[] | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const filled = answers.filter((a) => a.path.trim().length > 1).length;

  const check = () => {
    const r = restTasks.map((t, i) => grade(t, answers[i].method, answers[i].path));
    setResults(r);
    track("exercise_submitted", {
      lesson: slug,
      exercise: "gatepass-rest",
      correct: r.filter((x) => x.verdict === "right").length,
      total: restTasks.length,
    });
  };
  const score = results?.filter((r) => r.verdict === "right").length ?? 0;

  return (
    <VisualFrame
      eyebrow="Exercise"
      title="Design the Gatepass API"
      caption="Pick a method and type a path for each action. Use {id} (or a number) for ids. There's often more than one good answer; the notes explain each."
    >
      <ol className="space-y-3">
        {restTasks.map((t, i) => {
          const r = results?.[i];
          return (
            <li key={t.id} className="rounded-xl border border-line bg-bg p-3">
              <p className="text-[13.5px] font-medium text-fg">
                <span className="mr-2 font-mono text-[11px] text-subtle">{i + 1}</span>
                {t.action}
              </p>
              <div className="mt-2 flex gap-2">
                <select
                  aria-label={`Method for: ${t.action}`}
                  value={answers[i].method}
                  onChange={(e) => {
                    const method = e.target.value as Method;
                    setAnswers((a) => a.map((x, j) => (j === i ? { ...x, method } : x)));
                  }}
                  className="h-9 shrink-0 rounded-lg border border-line bg-surface-2 px-2 font-mono text-[12.5px] text-fg outline-none focus:border-accent/60"
                >
                  {METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <input
                  aria-label={`Path for: ${t.action}`}
                  value={answers[i].path}
                  onChange={(e) => {
                    const path = e.target.value;
                    setAnswers((a) => a.map((x, j) => (j === i ? { ...x, path } : x)));
                  }}
                  onKeyDown={(e) => e.key === "Enter" && filled > 0 && check()}
                  placeholder="/…"
                  spellCheck={false}
                  autoCapitalize="none"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 font-mono text-[13px] text-fg outline-none placeholder:text-subtle focus:border-accent/60"
                />
              </div>
              {r && (
                <p
                  className={cn(
                    "mt-2 flex items-start gap-2 text-[12.5px] leading-relaxed",
                    r.verdict === "right" && "text-ok",
                    r.verdict === "close" && "text-warn",
                    r.verdict === "wrong" && "text-err",
                  )}
                >
                  {r.verdict === "right" ? (
                    <Check className="mt-0.5 size-3.5 shrink-0" />
                  ) : r.verdict === "close" ? (
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  ) : (
                    <X className="mt-0.5 size-3.5 shrink-0" />
                  )}
                  <span className="text-muted">
                    <span className="font-semibold text-current">
                      {r.verdict === "right" ? "Good. " : r.verdict === "close" ? "Close. " : "Not yet. "}
                    </span>
                    {r.note}
                  </span>
                </p>
              )}
              {showAnswers && (
                <p className="mt-1.5 font-mono text-[12px] text-subtle">
                  One good answer: <span className="text-fg">{t.answer}</span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={check} disabled={filled === 0}>
          Check my API
        </Button>
        {results && (
          <>
            <span className="text-[13px] text-muted" aria-live="polite">
              {score} of {restTasks.length} good
            </span>
            <Button size="sm" variant="ghost" onClick={() => setShowAnswers((s) => !s)}>
              {showAnswers ? "Hide answers" : "Show answers"}
            </Button>
          </>
        )}
      </div>
    </VisualFrame>
  );
}
