"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { track } from "@/lib/analytics";
import { hash32, hex32 } from "./algo-hash";
import { SERIES, SimButton, Segmented, Stat, VisualFrame, pct } from "./algo-kit";

/**
 * A real consistent-hashing ring. Node tokens and keys are placed on a 2^32
 * ring with hash32 (FNV-1a + avalanche mix). A key belongs to the first token
 * clockwise from it. Every add/remove is replayed against `hash % N` too, so
 * the learner sees how many keys each scheme moves.
 */

const VISUAL = "consistent-hash-ring";
const RING = 4294967296; // 2^32
const NAMES = ["A", "B", "C", "D", "E", "F"];
const KEY_COUNT = 300;
const KEYS = Array.from({ length: KEY_COUNT }, (_, i) => {
  const key = `booking:${10000 + i * 37}`;
  return { key, pos: hash32(key) };
});

type Token = { pos: number; node: string };

function buildTokens(nodes: string[], vnodes: number): Token[] {
  const tokens: Token[] = [];
  for (const node of nodes) {
    for (let i = 0; i < vnodes; i++) tokens.push({ pos: hash32(`node-${node}#${i}`), node });
  }
  return tokens.sort((a, b) => a.pos - b.pos);
}

/** Index of the token that owns `pos`: first token at or after it, wrapping. */
function ownerIndex(tokens: Token[], pos: number): number {
  let lo = 0;
  let hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid].pos < pos) lo = mid + 1;
    else hi = mid;
  }
  return lo === tokens.length ? 0 : lo;
}

function owners(nodes: string[], vnodes: number): string[] {
  const tokens = buildTokens(nodes, vnodes);
  return KEYS.map((k) => tokens[ownerIndex(tokens, k.pos)].node);
}

function modOwners(nodes: string[]): string[] {
  return KEYS.map((k) => nodes[k.pos % nodes.length]);
}

function moved(a: string[], b: string[]) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n / a.length;
}

const colorOf = (node: string) => SERIES[NAMES.indexOf(node) % SERIES.length];

// Geometry
const S = 320;
const C = S / 2;
const R = 118;
const angle = (pos: number) => (pos / RING) * Math.PI * 2 - Math.PI / 2;
const pt = (pos: number, r: number): [number, number] => [C + r * Math.cos(angle(pos)), C + r * Math.sin(angle(pos))];
const f = (n: number) => n.toFixed(2);

function arcPath(from: number, to: number, r: number) {
  const span = (to - from + RING) % RING;
  const [x1, y1] = pt(from, r);
  const [x2, y2] = pt(to, r);
  const large = span > RING / 2 ? 1 : 0;
  return `M${f(x1)} ${f(y1)} A${r} ${r} 0 ${large} 1 ${f(x2)} ${f(y2)}`;
}

type Change = { label: string; ring: number; mod: number; ideal: number };

export function ConsistentHashRing() {
  const [nodes, setNodes] = useState<string[]>(["A", "B", "C"]);
  const [vnodes, setVnodes] = useState(1);
  const [change, setChange] = useState<Change | null>(null);
  const [lookup, setLookup] = useState("booking:gatepass-4821");

  const tokens = useMemo(() => buildTokens(nodes, vnodes), [nodes, vnodes]);
  const keyOwners = useMemo(() => KEYS.map((k) => tokens[ownerIndex(tokens, k.pos)].node), [tokens]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of nodes) c[n] = 0;
    for (const o of keyOwners) c[o]++;
    return c;
  }, [nodes, keyOwners]);

  const fair = KEY_COUNT / nodes.length;
  const busiest = Math.max(...nodes.map((n) => counts[n]));
  const maxCount = Math.max(busiest, 1);

  const lookupPos = hash32(lookup);
  const lookupToken = tokens[ownerIndex(tokens, lookupPos)];

  function apply(next: string[], label: string) {
    const ring = moved(owners(nodes, vnodes), owners(next, vnodes));
    const mod = moved(modOwners(nodes), modOwners(next));
    // Ideal: only the keys that must change owner move. Adding a node: 1/N_new of keys. Removing: the removed node's share.
    const ideal = next.length > nodes.length ? 1 / next.length : 1 / nodes.length;
    setChange({ label, ring, mod, ideal });
    setNodes(next);
  }

  function addNode() {
    const name = NAMES.find((n) => !nodes.includes(n));
    if (!name) return;
    apply([...nodes, name], `Added node ${name}`);
    track("visual_interacted", { visual: VISUAL, control: "add_node", value: nodes.length + 1 });
  }

  function removeNode(name: string) {
    if (nodes.length <= 1) return;
    apply(
      nodes.filter((n) => n !== name),
      `Removed node ${name}`,
    );
    track("visual_interacted", { visual: VISUAL, control: "remove_node", value: name });
  }

  return (
    <VisualFrame
      eyebrow="Simulation · consistent hashing"
      title="300 bookings on a hash ring"
      caption="Each dot is a booking key, coloured by the node that owns it: the first node token clockwise from it. Add or remove nodes and watch how few dots change colour. Then turn on virtual nodes."
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_230px]">
        <div className="min-w-0">
          <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto block h-auto w-full max-w-[380px]" role="img" aria-label={`Hash ring with ${nodes.length} nodes and ${tokens.length} tokens`}>
            <circle cx={C} cy={C} r={R} fill="none" stroke="var(--border)" strokeWidth={12} />
            {tokens.length === 1 ? (
              <circle cx={C} cy={C} r={R} fill="none" stroke={colorOf(tokens[0].node)} strokeOpacity={0.55} strokeWidth={12} />
            ) : (
              tokens.map((t, i) => {
                const prev = tokens[(i - 1 + tokens.length) % tokens.length];
                return (
                  <path
                    key={`${t.node}-${t.pos}`}
                    d={arcPath(prev.pos, t.pos, R)}
                    fill="none"
                    stroke={colorOf(t.node)}
                    strokeOpacity={0.55}
                    strokeWidth={12}
                  />
                );
              })
            )}
            {/* lookup walk */}
            <path d={arcPath(lookupPos, lookupToken.pos, R + 16)} fill="none" stroke="var(--fg)" strokeWidth={1.5} strokeDasharray="3 3" />
            {KEYS.map((k, i) => {
              const [x, y] = pt(k.pos, R - 20 - (i % 3) * 7);
              return <circle key={k.key} cx={f(x)} cy={f(y)} r={2.6} fill={colorOf(keyOwners[i])} />;
            })}
            {tokens.map((t) => {
              const [x1, y1] = pt(t.pos, R - 7);
              const [x2, y2] = pt(t.pos, R + 9);
              return <line key={`tk-${t.node}-${t.pos}`} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke={colorOf(t.node)} strokeWidth={vnodes > 16 ? 1 : 2} />;
            })}
            {vnodes === 1 &&
              tokens.map((t) => {
                const [x, y] = pt(t.pos, R + 24);
                return (
                  <g key={`lbl-${t.node}`}>
                    <circle cx={f(x)} cy={f(y)} r={10} fill="var(--surface)" stroke={colorOf(t.node)} strokeWidth={1.5} />
                    <text x={f(x)} y={f(y + 4)} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--fg)">
                      {t.node}
                    </text>
                  </g>
                );
              })}
            {(() => {
              const [x, y] = pt(lookupPos, R + 16);
              return <circle cx={f(x)} cy={f(y)} r={4.5} fill="var(--fg)" stroke="var(--surface)" strokeWidth={1.5} />;
            })()}
            <text x={C} y={C - 6} textAnchor="middle" fontSize={11} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
              0 … 2³²
            </text>
            <text x={C} y={C + 12} textAnchor="middle" fontSize={11} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
              {tokens.length} token{tokens.length === 1 ? "" : "s"}
            </text>
          </svg>
          <label className="mt-3 block">
            <span className="mb-1 block font-mono text-[10.5px] tracking-wider text-subtle uppercase">Look up a key</span>
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onBlur={() => track("visual_interacted", { visual: VISUAL, control: "lookup", value: lookup.length })}
              spellCheck={false}
              className="h-9 w-full rounded-lg border border-line bg-bg px-3 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
            />
          </label>
          <p className="mt-2 font-mono text-[12px] leading-relaxed text-muted">
            hash = 0x{hex32(lookupPos)} → walk clockwise → node{" "}
            <span className="font-semibold" style={{ color: colorOf(lookupToken.node) }}>
              {lookupToken.node}
            </span>
          </p>
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <p className="mb-1.5 font-mono text-[10.5px] tracking-wider text-subtle uppercase">Nodes</p>
            <div className="flex flex-wrap gap-1.5">
              {nodes.map((n) => (
                <span key={n} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface-2 pr-1 pl-2.5 text-[13px] text-fg">
                  <span className="size-2.5 rounded-full" style={{ background: colorOf(n) }} />
                  {n}
                  <button
                    type="button"
                    onClick={() => removeNode(n)}
                    disabled={nodes.length <= 1}
                    aria-label={`Remove node ${n}`}
                    className="grid size-6 place-items-center rounded-md text-subtle outline-none hover:bg-surface-3 hover:text-err focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              <SimButton onClick={addNode} disabled={nodes.length >= NAMES.length} primary>
                <Plus className="size-3.5" /> Add node
              </SimButton>
            </div>
          </div>

          <Segmented
            label="Virtual nodes per server"
            value={vnodes}
            options={[1, 8, 32, 128].map((v) => ({ value: v, label: String(v) }))}
            onChange={(v) => {
              setVnodes(v);
              setChange(null);
              track("visual_interacted", { visual: VISUAL, control: "vnodes", value: v });
            }}
          />

          <div>
            <p className="mb-1.5 font-mono text-[10.5px] tracking-wider text-subtle uppercase">Keys per node</p>
            <ul className="space-y-1.5">
              {nodes.map((n) => (
                <li key={n} className="flex items-center gap-2 text-[12px]">
                  <span className="w-3 font-mono text-muted">{n}</span>
                  <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
                      style={{ width: `${(counts[n] / maxCount) * 100}%`, background: colorOf(n) }}
                    />
                    <span className="absolute inset-y-0 w-px bg-fg/70" style={{ left: `${(fair / maxCount) * 100}%` }} aria-hidden />
                  </span>
                  <span className="w-8 text-right font-mono text-fg tabular-nums">{counts[n]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11.5px] text-subtle">Thin line: a fair share ({Math.round(fair)} keys).</p>
          </div>

          <Stat
            label="Busiest node"
            value={`${(busiest / fair).toFixed(2)}× fair share`}
            tone={busiest / fair > 1.5 ? "warn" : "ok"}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <Stat
          label={change ? change.label : "Last change"}
          value={change ? `ideal ${pct(change.ideal, 0)}` : "–"}
          sub="the share of keys that has to move"
        />
        <Stat label="Moved on the ring" value={change ? pct(change.ring) : "–"} tone="ok" sub="consistent hashing" />
        <Stat label="Moved with hash % N" value={change ? pct(change.mod) : "–"} tone={change && change.mod > 0.4 ? "err" : "default"} sub="same keys, same change" />
      </div>
    </VisualFrame>
  );
}
