"use client";

import { useReducer, useState } from "react";
import { Clock, RotateCcw, Rewind, StepForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { Segmented, Stat, VisualButton, VisualShell, useVisualTracker } from "./visual-shell";

type Msg = { key: string; offset: number; hour: number; seq: number };
type Group = "email" | "analytics";

const KEYS = ["show-17", "show-42", "show-25", "show-12", "show-91"];
const KEY_TONE: Record<string, string> = {
  "show-17": "border-req/50 bg-req/10 text-req",
  "show-42": "border-info/50 bg-info/10 text-info",
  "show-25": "border-res/50 bg-res/10 text-res",
  "show-12": "border-warn/50 bg-warn/10 text-warn",
  "show-91": "border-err/50 bg-err/10 text-err",
};

/** A tiny, deterministic string hash, so the same key always lands in the same partition. */
function hashKey(key: string) {
  let h = 7;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 10007;
  return h;
}

type State = {
  partitions: number;
  logs: Msg[][];
  /** First offset still on disk, per partition. */
  start: number[];
  next: number[];
  hour: number;
  seq: number;
  /** Next offset each consumer group will read, per partition. */
  offsets: Record<Group, number[]>;
  note: string;
};

const fresh = (p: number, note = "Produce a few events. Each key always goes to the same partition."): State => ({
  partitions: p,
  logs: Array.from({ length: p }, () => []),
  start: Array(p).fill(0),
  next: Array(p).fill(0),
  hour: 0,
  seq: 1,
  offsets: { email: Array(p).fill(0), analytics: Array(p).fill(0) },
  note,
});

type Action =
  | { type: "produce"; key: string }
  | { type: "consume"; group: Group }
  | { type: "rewind"; group: Group }
  | { type: "tick"; retention: number }
  | { type: "reset"; partitions: number; note?: string };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "produce": {
      const p = hashKey(a.key) % s.partitions;
      const off = s.next[p];
      return {
        ...s,
        logs: s.logs.map((l, i) => (i === p ? [...l, { key: a.key, offset: off, hour: s.hour, seq: s.seq }] : l)),
        next: s.next.map((n, i) => (i === p ? n + 1 : n)),
        seq: s.seq + 1,
        note: `hash("${a.key}") % ${s.partitions} = ${p}, so it was appended to partition ${p} at offset ${off}.`,
      };
    }
    case "consume": {
      const g = a.group;
      const read = s.offsets[g].filter((o, i) => o < s.next[i]).length;
      return {
        ...s,
        offsets: { ...s.offsets, [g]: s.offsets[g].map((o, i) => (o < s.next[i] ? o + 1 : o)) },
        note: read
          ? `${g} read ${read} message${read > 1 ? "s" : ""} (one per partition) and committed its new offsets. Nothing was deleted from the log.`
          : `${g} is caught up. It waits for new messages.`,
      };
    }
    case "rewind":
      return {
        ...s,
        offsets: { ...s.offsets, [a.group]: [...s.start] },
        note: `${a.group} moved its offsets back to the oldest retained message. It will re-read everything still on disk.`,
      };
    case "tick": {
      const hour = s.hour + 1;
      const cutoff = hour - a.retention; // messages from hours <= cutoff expire
      const logs = s.logs.map((l) => l.filter((m) => m.hour > cutoff));
      const start = logs.map((l, i) => (l.length ? l[0].offset : s.next[i]));
      const removed = s.logs.reduce((n, l, i) => n + l.length - logs[i].length, 0);
      let lost = 0;
      const offsets = {} as Record<Group, number[]>;
      (Object.keys(s.offsets) as Group[]).forEach((g) => {
        offsets[g] = s.offsets[g].map((o, i) => {
          if (o < start[i]) {
            lost += start[i] - o;
            return start[i];
          }
          return o;
        });
      });
      const note = lost
        ? `Hour ${hour}: ${removed} old message${removed === 1 ? "" : "s"} expired. A consumer hadn't read ${lost} of them yet, so it skipped ahead and those events are gone for it.`
        : removed
          ? `Hour ${hour}: ${removed} message${removed === 1 ? "" : "s"} older than ${a.retention} h expired. Retention is about time, not about who has read them.`
          : `Hour ${hour}. Nothing is older than ${a.retention} h yet.`;
      return { ...s, hour, logs, start, offsets, note };
    }
    case "reset":
      return fresh(a.partitions, a.note);
  }
}

export function KafkaLogExplorer() {
  const t = useVisualTracker("kafka-log-explorer");
  const [s, dispatch] = useReducer(reducer, 3, (p: number) => fresh(p));
  const [retention, setRetention] = useState(3);
  const note = s.note;

  function produce(key: string) {
    t();
    dispatch({ type: "produce", key });
  }

  function consume(g: Group) {
    t();
    dispatch({ type: "consume", group: g });
  }

  function rewind(g: Group) {
    t();
    dispatch({ type: "rewind", group: g });
  }

  function tick() {
    t();
    dispatch({ type: "tick", retention });
  }

  const lag = (g: Group) => s.offsets[g].reduce((n, o, i) => n + (s.next[i] - o), 0);
  const total = s.logs.reduce((n, l) => n + l.length, 0);

  return (
    <VisualShell
      title="A topic is a set of append-only logs"
      hint="Produce events by key, read them with two independent consumer groups, then let time pass and watch retention trim the logs."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10.5px] tracking-wider text-subtle uppercase">Produce</span>
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => produce(k)}
            className={cn(
              "rounded-lg border px-2 py-1 font-mono text-[11.5px] transition-transform outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-accent/60",
              KEY_TONE[k],
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {s.logs.map((log, p) => (
          <div key={p} className="rounded-xl border border-line bg-surface-2 p-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[10.5px] text-subtle">
              <span className="tracking-wider uppercase">
                bookings · partition {p}
              </span>
              <span>{s.next[p] === s.start[p] ? "empty" : `offsets ${s.start[p]}–${s.next[p] - 1}`}</span>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {log.length === 0 && <span className="py-2 text-[12px] text-subtle">no messages on disk</span>}
              {log.map((m) => {
                const emailHere = s.offsets.email[p] === m.offset;
                const anaHere = s.offsets.analytics[p] === m.offset;
                const readByBoth = m.offset < s.offsets.email[p] && m.offset < s.offsets.analytics[p];
                return (
                  <div key={m.offset} className="flex shrink-0 flex-col items-center">
                    <div
                      className={cn(
                        "flex h-11 w-16 flex-col items-center justify-center rounded-md border text-center",
                        KEY_TONE[m.key],
                        readByBoth && "opacity-55",
                      )}
                      title={`offset ${m.offset}, key ${m.key}, produced at hour ${m.hour}`}
                    >
                      <span className="font-mono text-[11px] font-semibold">#{m.offset}</span>
                      <span className="font-mono text-[9.5px]">{m.key}</span>
                    </div>
                    <div className="mt-1 flex h-3 gap-0.5" aria-hidden>
                      {emailHere && <span className="h-1.5 w-5 rounded-full bg-res" />}
                      {anaHere && <span className="h-1.5 w-5 rounded-full bg-info" />}
                    </div>
                  </div>
                );
              })}
              <div className="flex shrink-0 flex-col items-center">
                <div className="flex h-11 w-12 items-center justify-center rounded-md border border-dashed border-line-strong font-mono text-[10px] text-subtle">
                  next {s.next[p]}
                </div>
                <div className="mt-1 flex h-3 gap-0.5" aria-hidden>
                  {s.offsets.email[p] === s.next[p] && <span className="h-1.5 w-5 rounded-full bg-res" />}
                  {s.offsets.analytics[p] === s.next[p] && <span className="h-1.5 w-5 rounded-full bg-info" />}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(["email", "analytics"] as Group[]).map((g) => (
          <div key={g} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
            <span className={cn("h-1.5 w-5 rounded-full", g === "email" ? "bg-res" : "bg-info")} aria-hidden />
            <span className="text-[13px] font-medium text-fg">{g} group</span>
            <span className="font-mono text-[11px] text-subtle">lag {lag(g)}</span>
            <div className="ml-auto flex gap-1.5">
              <VisualButton onClick={() => consume(g)} title={`${g}: read next`}>
                <StepForward className="size-3.5" /> Read
              </VisualButton>
              <VisualButton onClick={() => rewind(g)} title={`${g}: rewind to oldest`}>
                <Rewind className="size-3.5" />
                <span className="sr-only">Rewind {g}</span>
              </VisualButton>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <VisualButton onClick={tick}>
          <Clock className="size-3.5" /> +1 hour
        </VisualButton>
        <span className="font-mono text-[11px] text-subtle">retention</span>
        <Segmented
          label="Retention"
          value={String(retention)}
          onChange={(v) => {
            t();
            setRetention(Number(v));
          }}
          options={[2, 3, 5].map((h) => ({ value: String(h), label: `${h} h` }))}
        />
        <span className="font-mono text-[11px] text-subtle">partitions</span>
        <Segmented
          label="Partitions"
          value={String(s.partitions)}
          onChange={(v) => {
            t();
            dispatch({
              type: "reset",
              partitions: Number(v),
              note: `New topic with ${v} partition${v === "1" ? "" : "s"}. Keys may now land in different partitions than before.`,
            });
          }}
          options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
        />
        <VisualButton
          onClick={() => {
            t();
            dispatch({ type: "reset", partitions: s.partitions, note: "Empty topic. Produce a few events." });
          }}
          title="Reset"
        >
          <RotateCcw className="size-3.5" />
          <span className="sr-only">Reset</span>
        </VisualButton>
      </div>

      <p className="mt-3 min-h-10 rounded-xl border border-line bg-bg px-3 py-2 text-[13px] text-muted" aria-live="polite">
        {note}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Clock" value={`hour ${s.hour}`} />
        <Stat label="On disk" value={total} />
        <Stat label="Max lag" value={Math.max(lag("email"), lag("analytics"))} tone={Math.max(lag("email"), lag("analytics")) > 6 ? "warn" : undefined} />
      </div>
    </VisualShell>
  );
}
