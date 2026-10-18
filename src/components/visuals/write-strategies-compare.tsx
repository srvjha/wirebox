"use client";

import { useState } from "react";
import { BookOpen, PenLine, RotateCcw, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VisualFrame, fmtMs, trackVisual } from "./caching-scaling-ui";

const VISUAL = "write-strategies-compare";
const CACHE_MS = 0.5;
const DB_MS = 8;

type Kind = "through" | "back" | "around";
type Col = {
  cache: number | null;
  db: number;
  dirty: number; // writes sitting only in the cache
  lost: number;
  lastMs: number | null;
  note: string;
  tone: "ok" | "warn" | "err" | "muted";
};

const META: Record<Kind, { title: string; rule: string }> = {
  through: { title: "Write-through", rule: "Write the cache and the database together, then reply." },
  back: { title: "Write-back", rule: "Write the cache, reply, copy to the database later." },
  around: { title: "Write-around", rule: "Write only the database. The cache fills on the next read." },
};

const START = 2499;
const initial = (): Record<Kind, Col> => ({
  through: { cache: START, db: START, dirty: 0, lost: 0, lastMs: null, note: "Cache and database agree.", tone: "muted" },
  back: { cache: START, db: START, dirty: 0, lost: 0, lastMs: null, note: "Cache and database agree.", tone: "muted" },
  around: { cache: START, db: START, dirty: 0, lost: 0, lastMs: null, note: "Cache and database agree.", tone: "muted" },
});

const price = (v: number | null) => (v === null ? "empty" : `₹${v.toLocaleString("en-IN")}`);

export function WriteStrategiesCompare() {
  const [cols, setCols] = useState(initial);
  const [next, setNext] = useState(START + 500);

  function write() {
    const v = next;
    setNext(v + 500);
    setCols((c) => ({
      through: { ...c.through, cache: v, db: v, lastMs: CACHE_MS + DB_MS, note: "Both updated before replying. Slower write, nothing to lose.", tone: "ok" },
      back: {
        ...c.back,
        cache: v,
        dirty: c.back.dirty + 1,
        lastMs: CACHE_MS,
        note: `Fast reply. The database is ${c.back.dirty + 1} write${c.back.dirty ? "s" : ""} behind until the next flush.`,
        tone: "warn",
      },
      around: { ...c.around, cache: null, db: v, lastMs: DB_MS, note: "Database updated, old cached copy deleted. Next read is a miss.", tone: "ok" },
    }));
    trackVisual(VISUAL, "write", v);
  }

  function read() {
    setCols((c) => {
      const out = { ...c };
      for (const k of Object.keys(c) as Kind[]) {
        const col = c[k];
        if (col.cache !== null) {
          out[k] = { ...col, lastMs: CACHE_MS, note: `Read hit: ${price(col.cache)} from memory.`, tone: "ok" };
        } else {
          out[k] = {
            ...col,
            cache: col.db,
            lastMs: CACHE_MS * 2 + DB_MS,
            note: `Read missed, loaded ${price(col.db)} from the database and cached it.`,
            tone: "warn",
          };
        }
      }
      return out;
    });
    trackVisual(VISUAL, "read", true);
  }

  function flush() {
    setCols((c) => ({
      ...c,
      back: {
        ...c.back,
        db: c.back.cache ?? c.back.db,
        dirty: 0,
        lastMs: null,
        note: c.back.dirty ? `Flushed ${c.back.dirty} pending write${c.back.dirty > 1 ? "s" : ""} to the database in one batch.` : "Nothing to flush.",
        tone: c.back.dirty ? "ok" : "muted",
      },
    }));
    trackVisual(VISUAL, "flush", true);
  }

  function crash() {
    setCols((c) => {
      const out = { ...c };
      for (const k of Object.keys(c) as Kind[]) {
        const col = c[k];
        const lost = k === "back" ? col.dirty : 0;
        out[k] = {
          ...col,
          cache: null,
          dirty: 0,
          lost: col.lost + lost,
          lastMs: null,
          note: lost
            ? `Cache died holding ${lost} unflushed write${lost > 1 ? "s" : ""}. The database still says ${price(col.db)}. Those writes are gone.`
            : "Cache died and came back empty. The database has everything, so the next read just misses.",
          tone: lost ? "err" : "muted",
        };
      }
      return out;
    });
    trackVisual(VISUAL, "crash_cache", true);
  }

  return (
    <VisualFrame
      title="Three write strategies, side by side"
      hint="The organiser changes the Gold tier price. Send writes and reads, flush the write-back buffer, then crash the cache and see what each strategy loses."
      caption="Write latencies assume 0.5 ms to the cache and 8 ms for a database commit. Write-back's speed comes from replying before the database has the data."
    >
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={write}>
          <PenLine className="size-3.5" /> Change price to {price(next)}
        </Button>
        <Button size="sm" variant="secondary" onClick={read}>
          <BookOpen className="size-3.5" /> Read price
        </Button>
        <Button size="sm" variant="secondary" onClick={flush}>
          <Upload className="size-3.5" /> Flush write-back
        </Button>
        <Button size="sm" variant="secondary" onClick={crash} className="text-err">
          <Zap className="size-3.5" /> Crash the cache
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setCols(initial());
            setNext(START + 500);
            trackVisual(VISUAL, "reset", true);
          }}
        >
          <RotateCcw className="size-3.5" /> Reset
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-live="polite">
        {(Object.keys(META) as Kind[]).map((k) => {
          const col = cols[k];
          const stale = col.cache !== null && col.cache !== col.db;
          return (
            <div key={k} className="flex min-w-0 flex-col rounded-xl border border-line bg-bg p-3">
              <p className="text-[14px] font-semibold text-fg">{META[k].title}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-subtle">{META[k].rule}</p>
              <dl className="mt-3 space-y-1.5 font-mono text-[12px]">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5">
                  <dt className="text-subtle">cache</dt>
                  <dd className={cn("tabular-nums", col.cache === null ? "text-subtle" : stale ? "text-warn" : "text-fg")}>{price(col.cache)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5">
                  <dt className="text-subtle">database</dt>
                  <dd className={cn("tabular-nums", stale ? "text-warn" : "text-fg")}>{price(col.db)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2 px-1 pt-1">
                  <dt className="text-subtle">last op</dt>
                  <dd className="text-muted tabular-nums">{col.lastMs === null ? "–" : fmtMs(col.lastMs)}</dd>
                </div>
                {k === "back" && (
                  <div className="flex items-center justify-between gap-2 px-1">
                    <dt className="text-subtle">unflushed</dt>
                    <dd className={cn("tabular-nums", col.dirty ? "text-warn" : "text-muted")}>{col.dirty}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 px-1">
                  <dt className="text-subtle">writes lost</dt>
                  <dd className={cn("tabular-nums", col.lost ? "font-semibold text-err" : "text-muted")}>{col.lost}</dd>
                </div>
              </dl>
              <p
                className={cn(
                  "mt-3 text-[12.5px] leading-snug",
                  col.tone === "ok" && "text-ok",
                  col.tone === "warn" && "text-warn",
                  col.tone === "err" && "text-err",
                  col.tone === "muted" && "text-muted",
                )}
              >
                {col.note}
              </p>
            </div>
          );
        })}
      </div>
    </VisualFrame>
  );
}
