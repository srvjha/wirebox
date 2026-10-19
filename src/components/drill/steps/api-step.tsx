"use client";

import { CircleCheck, CircleX, Lightbulb, Plus, X } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";
import { track } from "@/lib/analytics";
import type { DrillStore } from "@/lib/drill/store";
import {
  API_FIELD_TYPES,
  HTTP_METHODS,
  STATUS_CODES,
  type ApiField,
  type ApiFieldType,
  type ApiStep,
  type Endpoint,
  type HttpMethod,
  type Drill,
} from "@/lib/drill/types";
import { cn } from "@/lib/utils";
import { Toggle } from "../canvas/inspector";
import { ContinueButton, StepFrame } from "./frame";

export const BLANK_ENDPOINT: Endpoint = { method: "GET", path: "", body: [], status: 200, response: [], location: false };

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  404: "Not Found",
  409: "Conflict",
};

const METHOD_TONE: Record<HttpMethod, string> = {
  GET: "text-res",
  POST: "text-req",
  PUT: "text-info",
  PATCH: "text-info",
  DELETE: "text-err",
};

type Props = { drill: Drill; step: ApiStep; index: number; store: DrillStore; onNext: () => void };

export function ApiStepView({ drill, step, index, store, onNext }: Props) {
  const api = useStore(store, (s) => s.api);
  const passed = useStore(store, (s) => s.passed.includes(step.id));
  const [problems, setProblems] = useState<Record<string, string[]> | null>(null);
  const [attempts, setAttempts] = useState(0);
  const get = (id: string) => api[id] ?? BLANK_ENDPOINT;

  const check = () => {
    const all = Object.fromEntries(step.requirements.map((r) => [r.id, get(r.id)]));
    const found = Object.fromEntries(step.requirements.map((r) => [r.id, r.check(get(r.id), all)]));
    const count = Object.values(found).reduce((n, p) => n + p.length, 0);
    setProblems(found);
    setAttempts((a) => a + 1);
    track("drill_api_checked", { drill: drill.slug, step: index, ok: count === 0, problems: count });
    if (count === 0 && !passed) {
      store.getState().pass(step.id);
      track("drill_step_completed", { drill: drill.slug, step: index, type: step.type });
    }
  };

  const allOk = problems && Object.values(problems).every((p) => p.length === 0);

  return (
    <StepFrame
      eyebrow={`Step ${index + 1} · API design`}
      title={step.title}
      wide
      footer={
        <>
          <button
            type="button"
            onClick={check}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-surface-3"
          >
            <CircleCheck className="size-4" /> Check my API
          </button>
          {passed && <ContinueButton onClick={onNext}>Continue</ContinueButton>}
          {problems && !allOk && (
            <span className="text-[13px] text-muted">
              {Object.values(problems).filter((p) => p.length).length} endpoint
              {Object.values(problems).filter((p) => p.length).length === 1 ? " needs" : "s need"} another look.
            </span>
          )}
        </>
      }
    >
      <div className="max-w-[680px] space-y-3 text-[15.5px] leading-relaxed text-muted [&_code]:font-mono [&_code]:text-[0.88em] [&_code]:text-fg [&_strong]:text-fg">
        {step.body}
      </div>

      <div className="mt-8 space-y-5">
        {step.requirements.map((r, i) => {
          const e = get(r.id);
          const p = problems?.[r.id];
          return (
            <section
              key={r.id}
              className={cn(
                "rounded-2xl border bg-surface",
                p ? (p.length ? "border-err/40" : "border-ok/40") : "border-line",
              )}
            >
              <header className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 font-mono text-[12px] text-muted">{i + 1}</span>
                <div className="flex-1">
                  <h2 className="text-[15px] font-semibold text-fg">{r.title}</h2>
                  <p className="text-[13.5px] text-muted">{r.story}</p>
                </div>
                {p && (p.length ? <CircleX className="size-5 text-err" /> : <CircleCheck className="size-5 text-ok" />)}
              </header>
              <EndpointEditor value={e} onChange={(next) => store.getState().setApi(r.id, next)} />
              {p && (
                <div className="border-t border-line px-4 py-3 sm:px-5">
                  {p.length === 0 ? (
                    <p className="flex gap-2 text-[13.5px] text-fg">
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" />
                      {r.praise}
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {p.map((msg) => (
                        <li key={msg} className="flex gap-2 text-[13.5px] leading-relaxed text-muted">
                          <span className="mt-[8px] size-1.5 shrink-0 rounded-full bg-err" />
                          {msg}
                        </li>
                      ))}
                      {attempts >= 2 && (
                        <li className="mt-2 flex gap-2 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[13px] text-muted">
                          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warn" />
                          {r.hint}
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {passed && step.after && (
        <div className="mt-8 rounded-2xl border border-accent/30 bg-accent-soft/40 p-5 text-[15px] leading-relaxed text-muted [&_strong]:text-fg">
          {step.after}
        </div>
      )}
    </StepFrame>
  );
}

function EndpointEditor({ value, onChange }: { value: Endpoint; onChange: (e: Endpoint) => void }) {
  const set = (patch: Partial<Endpoint>) => onChange({ ...value, ...patch });
  const isRedirect = value.status >= 300 && value.status < 400;
  return (
    <div className="grid gap-5 px-4 py-4 sm:px-5 md:grid-cols-2">
      <div className="space-y-4">
        <Label text="Request">
          <div className="flex gap-2">
            <select
              value={value.method}
              onChange={(e) => set({ method: e.target.value as HttpMethod })}
              aria-label="HTTP method"
              className={cn("rounded-lg border border-line bg-bg px-2 py-2 font-mono text-[13px] font-semibold outline-none focus:border-accent/60", METHOD_TONE[value.method])}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              value={value.path}
              onChange={(e) => set({ path: e.target.value.replace(/\s/g, "") })}
              placeholder="/path/:param"
              spellCheck={false}
              aria-label="Path"
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px] text-fg outline-none placeholder:text-subtle focus:border-accent/60"
            />
          </div>
          <p className="mt-1 text-[11.5px] text-subtle">
            Use <code className="font-mono text-muted">:name</code> for a value in the path.
          </p>
        </Label>
        <Label text="Request body (JSON fields)">
          <Fields fields={value.body} onChange={(body) => set({ body })} empty="No body" />
        </Label>
      </div>
      <div className="space-y-4">
        <Label text="Response status">
          <select
            value={value.status}
            onChange={(e) => set({ status: Number(e.target.value) })}
            aria-label="Response status"
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
          >
            {STATUS_CODES.map((c) => (
              <option key={c} value={c}>
                {c} {STATUS_TEXT[c]}
              </option>
            ))}
          </select>
        </Label>
        <Label text="Headers">
          <Toggle
            checked={value.location}
            onChange={(location) => set({ location })}
            label={isRedirect ? "Location: where the browser should go next" : "Location header"}
          />
        </Label>
        <Label text="Response body (JSON fields)">
          <Fields fields={value.response} onChange={(response) => set({ response })} empty="No body" />
        </Label>
      </div>
    </div>
  );
}

function Fields({ fields, onChange, empty }: { fields: ApiField[]; onChange: (f: ApiField[]) => void; empty: string }) {
  return (
    <div className="space-y-1.5">
      {fields.length === 0 && <p className="text-[12.5px] text-subtle italic">{empty}</p>}
      {fields.map((f, i) => (
        <div key={i} className="flex gap-1.5">
          <input
            value={f.name}
            onChange={(e) => onChange(fields.map((x, j) => (j === i ? { ...x, name: e.target.value.replace(/\s/g, "_") } : x)))}
            placeholder="field_name"
            spellCheck={false}
            aria-label="Field name"
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 font-mono text-[12.5px] text-fg outline-none placeholder:text-subtle focus:border-accent/60"
          />
          <select
            value={f.type}
            onChange={(e) => onChange(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as ApiFieldType } : x)))}
            aria-label="Field type"
            className="rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-[12px] text-muted outline-none focus:border-accent/60"
          >
            {API_FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange(fields.filter((_, j) => j !== i))}
            aria-label="Remove field"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-err"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...fields, { name: "", type: "string" }])}
        className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[12.5px] text-muted hover:bg-surface-2 hover:text-fg"
      >
        <Plus className="size-3.5" /> Add field
      </button>
    </div>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10.5px] tracking-wider text-subtle uppercase">{text}</p>
      {children}
    </div>
  );
}
