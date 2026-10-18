"use client";

import { Fragment, useState } from "react";
import { ArrowLeft, ArrowRight, KeyRound, Link2 } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { VisualFrame } from "./foundations-kit";

type Col = { name: string; type: string; pk?: boolean; fk?: string };
type Table = { name: string; note: string; cols: Col[] };

const tables: Table[] = [
  {
    name: "venues",
    note: "one row per place",
    cols: [
      { name: "id", type: "bigint", pk: true },
      { name: "name", type: "text" },
      { name: "city", type: "text" },
      { name: "capacity", type: "int" },
    ],
  },
  {
    name: "events",
    note: "a show at a venue",
    cols: [
      { name: "id", type: "bigint", pk: true },
      { name: "venue_id", type: "bigint", fk: "venues.id" },
      { name: "title", type: "text" },
      { name: "starts_at", type: "timestamptz" },
      { name: "price_paise", type: "int" },
      { name: "passes_left", type: "int" },
    ],
  },
  {
    name: "tickets",
    note: "one per booking",
    cols: [
      { name: "id", type: "bigint", pk: true },
      { name: "event_id", type: "bigint", fk: "events.id" },
      { name: "user_id", type: "bigint", fk: "users.id" },
      { name: "status", type: "text" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    name: "users",
    note: "students and fans",
    cols: [
      { name: "id", type: "bigint", pk: true },
      { name: "email", type: "text" },
      { name: "name", type: "text" },
    ],
  },
];

type Query = { id: string; label: string; sql: string; touches: string[]; note: string };

const queries: Query[] = [
  {
    id: "event-page",
    label: "Event page",
    sql: "SELECT e.title, e.starts_at, e.passes_left, v.name\nFROM events e JOIN venues v ON v.id = e.venue_id\nWHERE e.id = 42;",
    touches: ["events.id", "events.title", "events.starts_at", "events.passes_left", "events.venue_id", "venues.id", "venues.name"],
    note: "Two primary-key lookups joined on a foreign key. Fast at any size.",
  },
  {
    id: "book",
    label: "Book a ticket",
    sql: "BEGIN;\nUPDATE events SET passes_left = passes_left - 1\n  WHERE id = 42 AND passes_left > 0;\nINSERT INTO tickets (event_id, user_id, status)\n  VALUES (42, 7, 'paid');\nCOMMIT;",
    touches: ["events.id", "events.passes_left", "tickets.event_id", "tickets.user_id", "tickets.status", "tickets.id", "tickets.created_at"],
    note: "One transaction: the count and the ticket change together or not at all, so nothing is oversold.",
  },
  {
    id: "my-tickets",
    label: "My tickets",
    sql: "SELECT t.id, t.status, e.title, e.starts_at, v.name\nFROM tickets t\nJOIN events e ON e.id = t.event_id\nJOIN venues v ON v.id = e.venue_id\nWHERE t.user_id = 7;",
    touches: ["tickets.id", "tickets.status", "tickets.user_id", "tickets.event_id", "events.id", "events.title", "events.starts_at", "events.venue_id", "venues.id", "venues.name"],
    note: "Filters tickets by user_id, so it needs an index on tickets(user_id) once the table is big.",
  },
  {
    id: "city",
    label: "This week in Pune",
    sql: "SELECT e.id, e.title, e.starts_at, v.name\nFROM events e JOIN venues v ON v.id = e.venue_id\nWHERE v.city = 'Pune'\n  AND e.starts_at BETWEEN now() AND now() + interval '7 days';",
    touches: ["events.id", "events.title", "events.starts_at", "events.venue_id", "venues.id", "venues.name", "venues.city"],
    note: "Filters on venues.city and events.starts_at: both are candidates for an index.",
  },
  {
    id: "sales",
    label: "Sales per event",
    sql: "SELECT event_id, count(*) AS sold\nFROM tickets\nWHERE status = 'paid'\nGROUP BY event_id;",
    touches: ["tickets.event_id", "tickets.status"],
    note: "Reads every paid ticket. Fine for a dashboard once a minute, too slow for every page view at scale.",
  },
];

/** The Gatepass schema; pick a query to see which tables and columns it touches. */
export function GatepassSchema() {
  const [selected, setSelected] = useState<string>("event-page");
  const q = queries.find((x) => x.id === selected)!;
  const touched = new Set(q.touches);
  const tableTouched = (t: string) => q.touches.some((c) => c.startsWith(`${t}.`));

  return (
    <VisualFrame
      title="The Gatepass schema"
      caption="Pick a query. Tables it reads or writes light up, and so do the exact columns. Arrows point from a foreign key to the row it refers to."
    >
      <div role="radiogroup" aria-label="Queries" className="flex flex-wrap gap-1.5">
        {queries.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={selected === x.id}
            onClick={() => {
              setSelected(x.id);
              track("visual_interacted", { visual: "gatepass-schema", control: "query", value: x.id });
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-[12.5px] transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
              selected === x.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg",
            )}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:items-stretch sm:gap-0">
        {tables.map((t, i) => (
          <Fragment key={t.name}>
            {i > 0 && (
              <div aria-hidden className="hidden w-5 shrink-0 items-center justify-center text-subtle sm:flex">
                {i === 3 ? <ArrowRight className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
              </div>
            )}
            <div
              className={cn(
                "min-w-0 flex-1 rounded-xl border bg-bg transition-all duration-300",
                tableTouched(t.name) ? "border-accent/60 shadow-[0_0_0_3px_var(--accent-soft)]" : "border-line opacity-55",
              )}
            >
              <div className="border-b border-line px-2.5 py-1.5">
                <p className="font-mono text-[12.5px] font-semibold text-fg">{t.name}</p>
                <p className="truncate text-[10.5px] text-subtle">{t.note}</p>
              </div>
              <ul className="p-1">
                {t.cols.map((c) => {
                  const on = touched.has(`${t.name}.${c.name}`);
                  return (
                    <li
                      key={c.name}
                      className={cn(
                        "flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] transition-colors",
                        on ? "bg-accent-soft text-fg" : "text-muted",
                      )}
                      title={c.fk ? `${t.name}.${c.name} → ${c.fk}` : undefined}
                    >
                      {c.pk ? (
                        <KeyRound className="size-3 shrink-0 text-warn" aria-label="primary key" />
                      ) : c.fk ? (
                        <Link2 className="size-3 shrink-0 text-info" aria-label={`references ${c.fk}`} />
                      ) : (
                        <span className="size-3 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">{c.name}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Fragment>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <pre className="overflow-x-auto rounded-xl border border-line bg-sunken p-3 font-mono text-[11.5px] leading-relaxed text-fg">
          {q.sql}
        </pre>
        <p className="rounded-xl border border-line bg-surface-2 p-3 text-[13px] leading-relaxed text-muted" aria-live="polite">
          {q.note}
        </p>
      </div>
    </VisualFrame>
  );
}
