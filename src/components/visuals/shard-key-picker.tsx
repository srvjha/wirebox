"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Segmented, Stat, VisualFrame } from "./scale-visual-parts";

const VISUAL = "shard-key-picker";
const SHARDS = 4;

type Key = "user" | "city" | "event";

// Share of booking traffic (percent) during the evening of a big on-sale.
// Each entry lists its shard under each strategy, as a hash would assign it.
// City weights (percent of all traffic) and their shard when hashed on city.
const CITIES: [string, number, number][] = [
  ["Mumbai", 26, 0],
  ["Delhi", 18, 2],
  ["Bengaluru", 14, 1],
  ["Pune", 9, 3],
  ["Chennai", 8, 1],
  ["Hyderabad", 8, 3],
  ["Kolkata", 6, 2],
  ["Others (30 cities)", 11, 0],
];

// Event weights (percent) and their shard when hashed on event id. One viral on-sale.
const EVENTS: [string, number, number][] = [
  ["Fest night", 34, 1],
  ["Comedy tour", 9, 3],
  ["Indie gig A", 8, 0],
  ["Indie gig B", 7, 2],
  ["Others (900 events)", 42, -1], // spread evenly
];

function loads(key: Key): { load: number[]; labels: string[][] } {
  const load = Array<number>(SHARDS).fill(0);
  const labels: string[][] = Array.from({ length: SHARDS }, () => []);
  if (key === "user") {
    // Millions of users hash almost uniformly.
    [25.6, 24.7, 25.3, 24.4].forEach((v, i) => {
      load[i] = v;
      labels[i] = ["~25% of all users"];
    });
  } else if (key === "city") {
    for (const [name, w, s] of CITIES) {
      load[s] += w;
      labels[s].push(name);
    }
  } else {
    for (const [name, w, s] of EVENTS) {
      if (s < 0) {
        for (let i = 0; i < SHARDS; i++) load[i] += w / SHARDS;
        for (let i = 0; i < SHARDS; i++) labels[i].push("share of the rest");
      } else {
        load[s] += w;
        labels[s].push(name);
      }
    }
  }
  return { load, labels };
}

const QUERIES: { id: string; label: string; shards: Record<Key, number> }[] = [
  { id: "mine", label: "A fan's own tickets", shards: { user: 1, city: SHARDS, event: SHARDS } },
  { id: "seats", label: "Seat map for one event", shards: { user: SHARDS, city: 1, event: 1 } },
  { id: "city", label: "All gigs in Pune", shards: { user: SHARDS, city: 1, event: SHARDS } },
];

export function ShardKeyPicker() {
  const [key, setKey] = useState<Key>("user");
  const { load, labels } = useMemo(() => loads(key), [key]);
  const hottest = Math.max(...load);
  const avg = 100 / SHARDS;
  const skew = hottest / avg;
  const tone = skew < 1.2 ? "ok" : skew < 1.7 ? "warn" : "err";

  return (
    <VisualFrame
      title="Pick a shard key, then look at the damage"
      hint="Four databases share Gatepass's bookings. The shard key decides which database owns each row. Bars show the share of evening traffic each shard takes while a big fest goes on sale."
    >
      <Segmented
        visual={VISUAL}
        label="Shard key"
        value={key}
        onChange={setKey}
        options={[
          { value: "user", label: "hash(user_id)" },
          { value: "city", label: "city" },
          { value: "event", label: "hash(event_id)" },
        ]}
      />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {load.map((v, i) => {
          const hot = v === hottest && skew >= 1.2;
          return (
            <div
              key={i}
              className={cn("rounded-xl border bg-surface-2 p-3", hot ? "border-err" : "border-line")}
            >
              <p className="font-mono text-[10.5px] tracking-wider text-subtle uppercase">Shard {i + 1}</p>
              <div className="mt-2 flex h-28 items-end rounded-md bg-sunken p-1" role="img" aria-label={`Shard ${i + 1} takes ${Math.round(v)} percent`}>
                <div
                  className={cn("w-full rounded-sm transition-[height] duration-300 motion-reduce:transition-none", hot ? "bg-err" : "bg-accent")}
                  style={{ height: `${Math.min(100, (v / 60) * 100)}%` }}
                />
              </div>
              <p className={cn("mt-2 text-[17px] font-semibold tabular-nums", hot ? "text-err" : "text-fg")}>{Math.round(v)}%</p>
              <p className="min-h-8 text-[11px] leading-snug text-subtle">{labels[i].join(", ")}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Hottest shard" value={`${skew.toFixed(1)}× average`} tone={tone} sub={skew >= 1.7 ? "one database melts first" : skew >= 1.2 ? "uneven, watch it" : "balanced"} />
        <Stat label="Even share" value={`${avg}% each`} sub="the goal" />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface-2">
        <table className="w-full min-w-[420px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-line font-mono text-[10.5px] tracking-wider text-subtle uppercase">
              <th className="px-3 py-2 font-normal">Query</th>
              <th className="px-3 py-2 font-normal">Shards it must ask</th>
            </tr>
          </thead>
          <tbody>
            {QUERIES.map((q) => {
              const n = q.shards[key];
              return (
                <tr key={q.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-muted">{q.label}</td>
                  <td className="px-3 py-2">
                    <span className={cn("font-semibold tabular-nums", n === 1 ? "text-ok" : "text-warn")}>
                      {n === 1 ? "1 (direct)" : `all ${n} (scatter-gather)`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </VisualFrame>
  );
}
