"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Search } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { bloomFpr, bloomHas, bloomPositions, buildBloom } from "./bloom-core";
import { Range, Segmented, SimButton, Stat, VisualFrame, pct } from "./algo-kit";

/**
 * A working Bloom filter for "is this Gatepass username taken?". Changing m
 * or k rebuilds the filter from the inserted names (a real filter would need
 * the original keys to do that). The measured false-positive rate comes from
 * probing 2,000 names that were never inserted.
 */

const VISUAL = "bloom-filter-drill";
const START = ["asha", "rohan", "meera", "kabir", "zoya", "dev"];
const PROBES = Array.from({ length: 2000 }, (_, i) => `probe-${i}`);

export function BloomFilterDrill() {
  const [m, setM] = useState(64);
  const [k, setK] = useState(3);
  const [words, setWords] = useState<string[]>(START);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("nikhil");
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const bits = useMemo(() => buildBloom(words, m, k), [words, m, k]);
  const set = useMemo(() => new Set(words), [words]);
  const n = words.length;
  const ones = useMemo(() => bits.reduce((s, b) => s + b, 0), [bits]);
  const measured = useMemo(() => PROBES.filter((p) => bloomHas(bits, p, k)).length / PROBES.length, [bits, k]);
  const expected = bloomFpr(m, k, n);
  const bestK = n > 0 ? Math.max(1, Math.round((m / n) * Math.LN2)) : null;

  const q = query.trim().toLowerCase();
  const qPos = q ? bloomPositions(q, m, k) : [];
  const qHit = q ? bloomHas(bits, q, k) : false;
  const qReal = set.has(q);
  const addedPos = lastAdded ? bloomPositions(lastAdded, m, k) : [];

  function add(list: string[], control: string) {
    const fresh = [...new Set(list.map((w) => w.trim().toLowerCase()))].filter((w) => w && !set.has(w));
    if (!fresh.length) return;
    setWords((ws) => [...ws, ...fresh.filter((w) => !ws.includes(w))]);
    setLastAdded(fresh[fresh.length - 1]);
    track("visual_interacted", { visual: VISUAL, control, value: n + fresh.length });
  }

  function addBatch() {
    let i = 0;
    const batch: string[] = [];
    while (batch.length < 10) {
      const w = `user-${n + i++}`;
      if (!set.has(w)) batch.push(w);
    }
    add(batch, "add_10");
  }

  // Plot: expected FPR against n, for the current m and k.
  const W = 300;
  const H = 130;
  const maxN = m;
  const px = (x: number) => 30 + (x / maxN) * (W - 40);
  const py = (y: number) => 10 + (1 - y) * (H - 32);
  const curve = Array.from({ length: 61 }, (_, i) => {
    const x = (i / 60) * maxN;
    return `${i ? "L" : "M"}${px(x).toFixed(1)} ${py(bloomFpr(m, k, x)).toFixed(1)}`;
  }).join(" ");

  return (
    <VisualFrame
      eyebrow="Simulation · Bloom filter"
      title="Is this username taken?"
      caption="Every name sets k bits. To check a name, look at its k bits: any 0 means definitely not taken; all 1s means probably taken. Fill the filter up and watch the false positives arrive."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          label="m · bits"
          value={m}
          options={[32, 64, 128, 256].map((v) => ({ value: v, label: String(v) }))}
          onChange={(v) => {
            setM(v);
            track("visual_interacted", { visual: VISUAL, control: "m", value: v });
          }}
        />
        <Range
          label="k · hash functions"
          min={1}
          max={8}
          value={k}
          onChange={setK}
          onCommit={(v) => track("visual_interacted", { visual: VISUAL, control: "k", value: v })}
        />
      </div>

      <div
        className="mt-4 grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${m <= 64 ? 16 : 32}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`${ones} of ${m} bits set`}
      >
        {Array.from(bits).map((b, i) => {
          const probed = qPos.includes(i);
          const added = addedPos.includes(i);
          return (
            <div
              key={i}
              title={`bit ${i}`}
              className={cn(
                "aspect-square rounded-[3px] border transition-colors",
                b ? "border-transparent bg-accent/70" : "border-line bg-bg",
                added && b && "bg-accent",
                probed && (b ? "ring-2 ring-fg ring-offset-1 ring-offset-surface" : "border-err ring-2 ring-err ring-offset-1 ring-offset-surface"),
              )}
            />
          );
        })}
      </div>
      <p className="mt-2 text-[11.5px] text-subtle">
        Green: bit set. Outlined: the {k} bits for <span className="font-mono text-muted">{q || "…"}</span>
        {lastAdded && (
          <>
            . Brightest: bits set by <span className="font-mono text-muted">{lastAdded}</span>
          </>
        )}
        .
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add([draft], "insert");
              setDraft("");
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Register a name"
              aria-label="Name to insert"
              className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
            />
            <SimButton primary type="submit" title="Insert">
              <Plus className="size-3.5" /> Add
            </SimButton>
          </form>
          <div className="flex flex-wrap gap-2">
            <SimButton onClick={addBatch}>+10 users</SimButton>
            <SimButton
              onClick={() => {
                setWords(START);
                setLastAdded(null);
                track("visual_interacted", { visual: VISUAL, control: "reset", value: true });
              }}
            >
              <RotateCcw className="size-3.5" /> Reset
            </SimButton>
          </div>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 font-mono text-[10.5px] tracking-wider text-subtle uppercase">
              <Search className="size-3" /> Check a name
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => track("visual_interacted", { visual: VISUAL, control: "check", value: qHit })}
              aria-label="Name to check"
              className="h-8 w-full rounded-lg border border-line bg-bg px-3 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
            />
          </label>
          {q && (
            <div
              className={cn(
                "rounded-xl border px-3 py-2 text-[13px]",
                !qHit ? "border-ok/30 bg-ok/10" : qReal ? "border-info/30 bg-info/10" : "border-err/30 bg-err/10",
              )}
              aria-live="polite"
            >
              <p className={cn("font-semibold", !qHit ? "text-ok" : qReal ? "text-info" : "text-err")}>
                {!qHit ? "Definitely not taken" : qReal ? "Probably taken (and it is)" : "Probably taken: false positive!"}
              </p>
              <p className="mt-0.5 font-mono text-[11.5px] text-muted">
                bits {qPos.join(", ")} → {qPos.map((p) => bits[p]).join("")}
              </p>
            </div>
          )}
          <p className="text-[12px] leading-relaxed text-subtle">
            Inserted: <span className="font-mono text-muted">{words.slice(-8).join(", ")}{n > 8 ? ", …" : ""}</span>
          </p>
        </div>

        <div className="min-w-0">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Expected false-positive rate as names are added">
            {[0, 0.5, 1].map((y) => (
              <g key={y}>
                <line x1={30} x2={W - 10} y1={py(y)} y2={py(y)} stroke="var(--border)" />
                <text x={26} y={py(y) + 3.5} fontSize={9} textAnchor="end" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
                  {y * 100}%
                </text>
              </g>
            ))}
            <path d={curve} fill="none" stroke="var(--info)" strokeWidth={1.8} />
            {n <= maxN && (
              <>
                <line x1={px(n)} x2={px(n)} y1={py(0)} y2={py(1)} stroke="var(--fg-subtle)" strokeDasharray="3 3" />
                <circle cx={px(n)} cy={py(measured)} r={4} fill="var(--accent)" />
              </>
            )}
            <text x={px(0)} y={H - 6} fontSize={9} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
              n = 0
            </text>
            <text x={W - 10} y={H - 6} fontSize={9} textAnchor="end" fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
              n = {maxN}
            </text>
          </svg>
          <p className="mt-1 text-[11.5px] text-subtle">
            <span className="text-info">Line</span>: formula (1 − e<sup>−kn/m</sup>)<sup>k</sup>. <span className="text-accent">Dot</span>: measured on 2,000 names never inserted.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Names (n)" value={n} sub={`${(m / Math.max(n, 1)).toFixed(1)} bits per name`} />
            <Stat label="Bits set" value={pct(ones / m, 0)} tone={ones / m > 0.7 ? "warn" : "default"} />
            <Stat label="Expected FP" value={pct(expected)} tone={expected > 0.1 ? "err" : "ok"} />
            <Stat label="Measured FP" value={pct(measured)} tone={measured > 0.1 ? "err" : "ok"} sub={bestK ? `best k here ≈ ${bestK}` : undefined} />
          </div>
        </div>
      </div>
    </VisualFrame>
  );
}
