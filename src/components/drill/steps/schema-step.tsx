"use client";

import { CircleCheck, CircleX, KeyRound, Plus, X } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";
import { track } from "@/lib/analytics";
import type { DrillStore } from "@/lib/drill/store";
import { COLUMN_TYPES, type Column, type ColumnType, type Drill, type SchemaDesign, type SchemaStep, type Table } from "@/lib/drill/types";
import { cn } from "@/lib/utils";
import { ContinueButton, StepFrame } from "./frame";

type Props = { drill: Drill; step: SchemaStep; index: number; store: DrillStore; onNext: () => void };

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${++seq}`;

export function SchemaStepView({ drill, step, index, store, onNext }: Props) {
  const schema = useStore(store, (s) => s.schema);
  const api = useStore(store, (s) => s.api);
  const passed = useStore(store, (s) => s.passed.includes(step.id));
  const [results, setResults] = useState<{ label: string; problem: string | null }[] | null>(null);
  const set = (next: SchemaDesign) => store.getState().setSchema(next);
  const engine = step.engines.find((e) => e.id === schema.engine);
  const sqlish = !engine || engine.family === "SQL";

  const check = () => {
    const r = step.checks.map((c) => ({ label: c.label, problem: c.check(schema, api) }));
    const problems = r.filter((x) => x.problem).length;
    setResults(r);
    track("drill_step_checked", { drill: drill.slug, step: index, type: "schema", ok: problems === 0, problems });
    if (problems === 0 && !passed) store.getState().pass(step.id);
  };

  const updateTable = (id: string, patch: Partial<Table>) =>
    set({ ...schema, tables: schema.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  return (
    <StepFrame
      eyebrow={`Step ${index + 1} · Data model`}
      title={step.title}
      wide
      footer={
        <>
          <button
            type="button"
            onClick={check}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-surface-3"
          >
            <CircleCheck className="size-4" /> Check my schema
          </button>
          {passed && <ContinueButton onClick={onNext}>Continue</ContinueButton>}
        </>
      }
    >
      <div className="max-w-[680px] space-y-3 text-[15.5px] leading-relaxed text-muted [&_code]:font-mono [&_code]:text-[0.88em] [&_code]:text-fg [&_strong]:text-fg">
        {step.body}
      </div>

      <h2 className="mt-8 text-[13px] text-subtle">1 · Pick a database</h2>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup">
        {step.engines.map((e) => (
          <button
            key={e.id}
            type="button"
            role="radio"
            aria-checked={schema.engine === e.id}
            onClick={() => set({ ...schema, engine: e.id })}
            className={cn(
              "rounded-xl border p-3.5 text-left transition-colors",
              schema.engine === e.id ? "border-accent/60 bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[14.5px] font-semibold text-fg">{e.label}</span>
              <span className="rounded-full border border-line px-1.5 py-0.5 text-[13px] text-subtle">{e.family}</span>
            </span>
            <span className="mt-1 block text-[12.5px] leading-snug text-muted">{e.blurb}</span>
          </button>
        ))}
      </div>
      {engine && <p className="mt-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-muted">{engine.fit}</p>}

      <h2 className="mt-8 text-[13px] text-subtle">
        2 · Design the {sqlish ? "tables" : engine?.family === "Document" ? "collections" : "tables"}
      </h2>
      {!sqlish && (
        <p className="mt-1 text-[12.5px] text-subtle">
          In {engine?.label}, the primary key is the partition key: the one value you can look a record up by quickly.
        </p>
      )}
      <div className="mt-3 space-y-4">
        {schema.tables.map((t) => (
          <section key={t.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <header className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
              <input
                value={t.name}
                onChange={(e) => updateTable(t.id, { name: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                placeholder="table_name"
                aria-label="Table name"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent font-mono text-[14px] font-semibold text-fg outline-none placeholder:text-subtle"
              />
              <button
                type="button"
                onClick={() => set({ ...schema, tables: schema.tables.filter((x) => x.id !== t.id) })}
                className="grid size-7 place-items-center rounded-lg text-subtle hover:bg-surface-3 hover:text-err"
                aria-label={`Remove table ${t.name}`}
              >
                <X className="size-3.5" />
              </button>
            </header>
            <div className="divide-y divide-line">
              <div className="hidden grid-cols-[1fr_150px_52px_60px_32px] gap-2 px-3 py-1.5 text-[13px] text-subtle sm:grid">
                <span>Column</span>
                <span>Type</span>
                <span className="text-center">PK</span>
                <span className="text-center">Unique</span>
                <span />
              </div>
              {t.columns.map((c) => (
                <ColumnRow
                  key={c.id}
                  column={c}
                  onChange={(next) => updateTable(t.id, { columns: t.columns.map((x) => (x.id === c.id ? next : x)) })}
                  onRemove={() => updateTable(t.id, { columns: t.columns.filter((x) => x.id !== c.id) })}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateTable(t.id, { columns: [...t.columns, { id: uid("c"), name: "", type: "text", pk: false, unique: false }] })}
              className="m-2 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[12.5px] text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Plus className="size-3.5" /> Add column
            </button>
          </section>
        ))}
        <button
          type="button"
          onClick={() => set({ ...schema, tables: [...schema.tables, { id: uid("t"), name: "", columns: [] }] })}
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-2 text-[13px] text-muted hover:text-fg"
        >
          <Plus className="size-4" /> Add {sqlish ? "table" : "collection"}
        </button>
      </div>

      {results && (
        <ul className="mt-8 space-y-2 rounded-2xl border border-line bg-surface p-4">
          {results.map((r) => (
            <li key={r.label} className="flex gap-2.5 text-[13.5px]">
              {r.problem ? <CircleX className="mt-0.5 size-4 shrink-0 text-err" /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" />}
              <span>
                <span className="font-medium text-fg">{r.label}</span>
                {r.problem && <span className="block leading-relaxed text-muted">{r.problem}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {passed && step.after && (
        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-5 text-[15px] leading-relaxed text-muted [&_strong]:text-fg">
          {step.after}
        </div>
      )}
    </StepFrame>
  );
}

function ColumnRow({ column: c, onChange, onRemove }: { column: Column; onChange: (c: Column) => void; onRemove: () => void }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_150px_52px_60px_32px]">
      <div className="flex min-w-0 items-center gap-1.5">
        {c.pk && <KeyRound className="size-3.5 shrink-0 text-accent" />}
        <input
          value={c.name}
          onChange={(e) => onChange({ ...c, name: e.target.value.replace(/\s/g, "_").toLowerCase() })}
          placeholder="column_name"
          aria-label="Column name"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-mono text-[13px] text-fg outline-none placeholder:text-subtle hover:border-line focus:border-accent/60"
        />
      </div>
      <button type="button" onClick={onRemove} aria-label="Remove column" className="grid size-7 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-err sm:order-last">
        <X className="size-3.5" />
      </button>
      <div className="col-span-2 flex items-center gap-3 sm:contents">
        <select
          value={c.type}
          onChange={(e) => onChange({ ...c, type: e.target.value as ColumnType })}
          aria-label="Column type"
          className="rounded-md border border-line bg-bg px-2 py-1 font-mono text-[12.5px] text-muted outline-none focus:border-accent/60"
        >
          {COLUMN_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center justify-center gap-1.5 text-[12px] text-muted">
          <input type="checkbox" checked={c.pk} onChange={(e) => onChange({ ...c, pk: e.target.checked })} className="accent-[var(--accent)]" />
          <span className="sm:hidden">Primary key</span>
        </label>
        <label className="flex items-center justify-center gap-1.5 text-[12px] text-muted">
          <input type="checkbox" checked={c.unique} onChange={(e) => onChange({ ...c, unique: e.target.checked })} className="accent-[var(--accent)]" />
          <span className="sm:hidden">Unique</span>
        </label>
      </div>
    </div>
  );
}
