"use client";

import { Lock, Trash, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { IP_PROFILE, MAX_SHARDS, SERVER_SIZES, SPECS, WS_CONN_CAP, nodeCap, nodeCost, nodeMachine, type CustomKnob, type LimiterBy } from "@/sim";
import { track } from "@/lib/analytics";
import type { LabStore } from "@/lib/lab/store";
import { stepKnobs } from "@/lib/lab/run";
import type { DesignStep, Knob, Lab } from "@/lib/lab/types";
import { cn } from "@/lib/utils";
import { KIND_META, SIZE_LABEL, compact, nodeTitle } from "./meta";

type Props = {
  lab: Lab;
  store: LabStore;
  knobs: Knob[];
  /** The design step, for lab-defined knobs and per-kind engine numbers. */
  step?: DesignStep;
  nodeId: string;
  dbLabel: string;
  onClose: () => void;
};

export function Inspector({ lab, store, knobs, step, nodeId, dbLabel, onClose }: Props) {
  const node = useStore(store, (s) => s.graph.nodes.find((n) => n.id === nodeId));
  const configs = useStore(store, (s) => s.configs);
  const { updateNode, setConfigs, removeNodes } = store.getState();
  if (!node) return null;
  const has = (k: Knob) => knobs.includes(k);
  const knob = (name: string, value: string | number | boolean) => track("lab_knob_changed", { lab: lab.slug, knob: name, value });
  const meta = KIND_META[node.kind];
  const Icon = meta.icon;
  const lockedNote = <LockedNote />;
  const flowStep = !!step?.flows;
  const cap = step?.nodeDefaults?.[node.kind]?.cap ?? nodeCap(node);
  const here = (step?.customKnobs ?? []).filter((k) => k.appliesTo === node.kind);
  const chosen = step ? stepKnobs(step, configs).choices : {};

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <span className="grid size-8 place-items-center rounded-lg border border-line bg-surface-2 text-accent">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-fg">{nodeTitle(node, dbLabel)}</p>
          <p className="truncate font-mono text-[11px] text-subtle">{node.kind === "db" ? SPECS.db.machine.replace("Postgres", dbLabel) : nodeMachine(node)}</p>
        </div>
        <button type="button" onClick={onClose} className="grid size-7 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Close inspector">
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-4 px-4 py-4 text-[13px]">
        {node.kind !== "client" && (
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Capacity" value={node.kind === "ws" ? `${compact(WS_CONN_CAP)} conns` : node.kind === "worker" ? `${compact(cap)} jobs/s` : `${compact(cap)}/s`} />
            <Stat label="Cost" value={node.kind === "external" ? "pay per use" : `$${nodeCost(node)}/mo`} />
          </div>
        )}
        <p className="leading-relaxed text-muted">{node.kind === "client" ? meta.blurb : SPECS[node.kind].note}</p>

        {node.kind === "server" && (
          <Field label="Machine size">
            {has("size") ? (
              <div className="grid gap-1.5">
                {SERVER_SIZES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      updateNode(node.id, { size: s.id });
                      knob("server_size", s.id);
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
                      (node.size ?? "s") === s.id ? "border-accent/60 bg-accent-soft" : "border-line hover:bg-surface-2",
                    )}
                  >
                    <span>
                      <span className="font-medium text-fg">{SIZE_LABEL[s.id]}</span>
                      <span className="ml-2 font-mono text-[11px] text-subtle">
                        {s.vcpu} vCPU · {s.ramGb} GB
                      </span>
                    </span>
                    <span className="text-right font-mono text-[11px] text-muted">
                      {compact(s.cap)}/s · ${s.monthlyUsd}
                    </span>
                  </button>
                ))}
                <p className="text-[11.5px] text-subtle">Each doubling of cores buys less: locks, garbage collection and the network stack get in the way.</p>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-muted">
                {SIZE_LABEL[node.size ?? "s"]} · fixed for this step {lockedNote}
              </p>
            )}
          </Field>
        )}

        {node.kind === "lb" && (
          <Field label="Health checks">
            {has("healthChecks") ? (
              <Toggle
                checked={configs.resilience.healthChecks}
                onChange={(v) => {
                  setConfigs({ resilience: { healthChecks: v } });
                  knob("health_checks", v);
                }}
                label="Ping each server every second; stop routing to one that fails 3 in a row."
              />
            ) : (
              <p className="flex items-center gap-1.5 text-muted">Off {lockedNote}</p>
            )}
          </Field>
        )}

        {(node.kind === "cache" || node.kind === "cdn") && has("hitRate") && (
          <Field label="Hit rate" hint="Share of cacheable requests answered here. Hot, popular content caches well; one-off content doesn't.">
            <HitRate value={node.hitRate ?? step?.nodeDefaults?.[node.kind]?.hitRate ?? 0.9} onChange={(v) => updateNode(node.id, { hitRate: v })} onCommit={(v) => knob("hit_rate", v)} />
          </Field>
        )}

        {node.kind === "cache" && !flowStep && (
          <>
            {has("cache") ? (
              <>
                <Field label="Key template" hint={`Use {${lab.cacheParam}} for the value from the URL.`}>
                  <input
                    value={configs.cache.key}
                    onChange={(e) => setConfigs({ cache: { key: e.target.value } })}
                    onBlur={(e) => knob("cache_key", e.target.value)}
                    placeholder={`link:{${lab.cacheParam}}`}
                    spellCheck={false}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {[`{${lab.cacheParam}}`, "{client_ip}", "link:"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setConfigs({ cache: { key: configs.cache.key + t } })}
                        className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted hover:text-fg"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Value stored">
                  <select
                    value={configs.cache.value ?? ""}
                    onChange={(e) => {
                      setConfigs({ cache: { value: e.target.value || null } });
                      knob("cache_value", e.target.value);
                    }}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-fg outline-none focus:border-accent/60"
                  >
                    <option value="">Choose a value…</option>
                    {lab.cacheValues.map((v) => (
                      <option key={v.v} value={v.v}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <p className="flex items-center gap-1.5 text-muted">Configuration {lockedNote}</p>
            )}
            {has("coalesce") && (
              <Field label="On a miss">
                <Segmented
                  value={configs.cache.onMiss}
                  options={[
                    { v: "each", label: "Every request queries" },
                    { v: "coalesce", label: "Coalesce" },
                  ]}
                  onChange={(v) => {
                    setConfigs({ cache: { onMiss: v as "each" | "coalesce" } });
                    knob("cache_on_miss", v);
                  }}
                />
                <p className="mt-1.5 text-[11.5px] text-subtle">
                  Coalesce: when many requests miss the same key at once, one fetches from the database and the rest wait for it.
                </p>
              </Field>
            )}
            {has("writeThrough") && (
              <Field label="On create">
                <Toggle
                  checked={configs.cache.writeThrough}
                  onChange={(v) => {
                    setConfigs({ cache: { writeThrough: v } });
                    knob("cache_write_through", v);
                  }}
                  label="Write-through: put each new link in Redis as soon as it's saved."
                />
              </Field>
            )}
          </>
        )}

        {node.kind === "limiter" && (
          <>
            {has("limiter") ? (
              <LimiterKnobs
                by={configs.limiter.by}
                rate={configs.limiter.rate}
                onBy={(by) => {
                  setConfigs({ limiter: { by } });
                  knob("limiter_by", by);
                }}
                onRate={(rate) => setConfigs({ limiter: { rate } })}
                onRateCommit={(rate) => knob("limiter_rate", rate)}
              />
            ) : flowStep ? (
              <p className="text-[12.5px] text-muted">Drops most abusive traffic at the edge so it never reaches your servers.</p>
            ) : (
              <p className="flex items-center gap-1.5 text-muted">Rules {lockedNote}</p>
            )}
          </>
        )}

        {node.kind === "db" && (
          <>
            {has("replica") && (
              <Field label="Role">
                <Segmented
                  value={node.role ?? "primary"}
                  options={[
                    { v: "primary", label: "Primary" },
                    { v: "replica", label: "Replica" },
                  ]}
                  onChange={(v) => {
                    updateNode(node.id, { role: v as "primary" | "replica" });
                    knob("db_role", v);
                  }}
                />
                <p className="mt-1.5 text-[11.5px] text-subtle">
                  The primary takes every write. A replica copies them a moment later and can serve reads.
                </p>
              </Field>
            )}
            {has("failover") && (
              <Field label="Failover">
                <Toggle
                  checked={configs.resilience.failover}
                  onChange={(v) => {
                    setConfigs({ resilience: { failover: v } });
                    knob("failover", v);
                  }}
                  label="Automatically promote a replica if the primary stops answering."
                />
              </Field>
            )}
            {has("readFrom") && (
              <Field label="Servers read from">
                <Segmented
                  value={configs.resilience.readFrom}
                  options={[
                    { v: "any", label: "Any copy" },
                    { v: "primary", label: "Primary only" },
                  ]}
                  onChange={(v) => {
                    setConfigs({ resilience: { readFrom: v as "any" | "primary" } });
                    knob("read_from", v);
                  }}
                />
              </Field>
            )}
            {has("shards") && (
              <Field label="Shards" hint="Split the data over several machines. Capacity and cost multiply, but a hot key still lands on one shard.">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={MAX_SHARDS}
                    step={1}
                    value={node.shards ?? 1}
                    onChange={(e) => updateNode(node.id, { shards: Number(e.target.value) })}
                    onPointerUp={() => knob("db_shards", node.shards ?? 1)}
                    onKeyUp={() => knob("db_shards", node.shards ?? 1)}
                    className="flex-1 accent-[var(--accent)]"
                    aria-label="Number of shards"
                  />
                  <span className="w-16 text-right font-mono text-[13px] text-fg">
                    {node.shards ?? 1} shard{(node.shards ?? 1) === 1 ? "" : "s"}
                  </span>
                </div>
              </Field>
            )}
            {!flowStep && !has("replica") && !has("failover") && <p className="flex items-center gap-1.5 text-muted">Replication {lockedNote}</p>}
          </>
        )}

        {here.map((k) => (
          <KnobSelect
            key={k.id}
            knob={k}
            value={chosen[k.id] ?? k.default}
            onChange={(v) => {
              setConfigs({ custom: { [k.id]: v } });
              knob(`custom_${k.id}`, v);
            }}
          />
        ))}

        {node.kind !== "client" && (
          <button
            type="button"
            onClick={() => {
              removeNodes([node.id]);
              track("lab_component_removed", { lab: lab.slug, kind: node.kind });
              onClose();
            }}
            className="flex items-center gap-1.5 text-[12.5px] text-subtle hover:text-err"
          >
            <Trash className="size-3.5" /> Remove <kbd className="rounded border border-line px-1 font-mono text-[10px]">⌫</kbd>
          </button>
        )}
      </div>
    </div>
  );
}

/** A lab-defined design choice: a select, the lab's help text, and the picked option's description. */
export function KnobSelect({ knob, value, onChange }: { knob: CustomKnob; value: string; onChange: (v: string) => void }) {
  const picked = knob.options.find((o) => o.v === value) ?? knob.options[0];
  const id = `knob-${knob.id}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-mono text-[10.5px] tracking-wider text-subtle uppercase">
        {knob.label}
      </label>
      <select
        id={id}
        value={picked?.v}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-fg outline-none focus:border-accent/60"
      >
        {knob.options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
      {picked && <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{picked.desc}</p>}
      <p className="mt-1 text-[11.5px] leading-snug text-subtle">{knob.help}</p>
    </div>
  );
}

function HitRate({ value, onChange, onCommit }: { value: number; onChange: (v: number) => void; onCommit: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={() => onCommit(value)}
        onKeyUp={() => onCommit(value)}
        className="flex-1 accent-[var(--accent)]"
        aria-label="Hit rate"
      />
      <span className="w-12 text-right font-mono text-[13px] text-fg">{Math.round(value * 100)}%</span>
    </div>
  );
}

function LimiterKnobs({
  by,
  rate,
  onBy,
  onRate,
  onRateCommit,
}: {
  by: LimiterBy;
  rate: number;
  onBy: (b: LimiterBy) => void;
  onRate: (r: number) => void;
  onRateCommit: (r: number) => void;
}) {
  const [draft, setDraft] = useState(String(rate));
  return (
    <>
      <Field label="Count requests per">
        <Segmented
          value={by}
          options={[
            { v: "ip", label: "IP address" },
            { v: "path", label: "Link" },
            { v: "global", label: "Everyone" },
          ]}
          onChange={(v) => onBy(v as LimiterBy)}
        />
      </Field>
      <Field label={by === "global" ? "Allowed requests / second in total" : `Allowed requests / second per ${by === "ip" ? "IP" : "link"}`}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={by === "global" ? 1000 : 1}
            max={by === "global" ? 200000 : 500}
            step={by === "global" ? 1000 : 1}
            value={rate}
            onChange={(e) => {
              onRate(Number(e.target.value));
              setDraft(e.target.value);
            }}
            onPointerUp={() => onRateCommit(rate)}
            onKeyUp={() => onRateCommit(rate)}
            className="flex-1 accent-[var(--accent)]"
            aria-label="Rate limit"
          />
          <input
            value={draft}
            inputMode="numeric"
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) onRate(n);
            }}
            onBlur={() => onRateCommit(rate)}
            className="w-20 rounded-lg border border-line bg-bg px-2 py-1.5 text-right font-mono text-[13px] text-fg outline-none focus:border-accent/60"
          />
        </div>
      </Field>
      <div className="rounded-lg border border-line bg-surface-2 p-2.5">
        <p className="mb-1.5 font-mono text-[10px] tracking-wider text-subtle uppercase">Real traffic per source IP</p>
        <ul className="space-y-1 text-[12px]">
          {IP_PROFILE.map((p) => (
            <li key={p.label} className="flex justify-between gap-2">
              <span className="text-muted">{p.label}</span>
              <span className={cn("font-mono", by === "ip" && rate < p.perIp ? "text-err" : "text-fg")}>{p.perIp}/s</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function LockedNote() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-subtle">
      <Lock className="size-3" /> unlocks in a later step
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
      <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">{label}</p>
      <p className="font-mono text-[13px] text-fg">{value}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10.5px] tracking-wider text-subtle uppercase">{label}</p>
      {children}
      {hint && <p className="mt-1 text-[11.5px] text-subtle">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors", checked ? "border-accent bg-accent" : "border-line-strong bg-surface-3")}
      >
        <span className={cn("absolute top-0.5 size-3.5 rounded-full bg-white transition-[left]", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <span className="text-[12.5px] leading-snug text-muted">{label}</span>
    </label>
  );
}

export function Segmented({ value, options, onChange }: { value: string; options: { v: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg border border-line bg-bg p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors",
            value === o.v ? "bg-surface-3 text-fg shadow-card" : "text-subtle hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
