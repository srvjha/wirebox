"use client";

import { useId, type ReactNode } from "react";
import { trackVisual } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Small building blocks shared by the interactive visuals in modules 6–10
 * (live updates, background jobs, rate limiting, growing big, putting it
 * together). Kept deliberately plain: a frame, a slider, a segmented control
 * and a stat tile, all theme-aware through the design tokens.
 */

export function VisualFrame({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("not-prose my-8 rounded-2xl border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="mb-4">
        <p className="font-mono text-[11px] tracking-wider text-accent uppercase">Try it</p>
        <p className="mt-0.5 text-[15.5px] font-medium text-fg">{title}</p>
        {hint && <p className="mt-1 text-[13.5px] leading-relaxed text-subtle">{hint}</p>}
      </div>
      {children}
    </figure>
  );
}

export function RangeControl({
  visual,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  visual: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  const commit = () => trackVisual(visual);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12.5px] text-muted">
          {label}
        </label>
        <span className="font-mono text-[12.5px] text-fg tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        className="mt-1.5 h-5 w-full cursor-pointer accent-accent"
      />
    </div>
  );
}

export function Segmented<T extends string>({
  visual,
  label,
  options,
  value,
  onChange,
  className,
}: {
  visual: string;
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              if (active) return;
              onChange(o.value);
              trackVisual(visual);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-[12.5px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const statTone = {
  default: "text-fg",
  ok: "text-ok",
  warn: "text-warn",
  err: "text-err",
  accent: "text-accent",
  info: "text-info",
  muted: "text-muted",
} as const;

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: keyof typeof statTone;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <p className="truncate font-mono text-[10.5px] tracking-wider text-subtle uppercase">{label}</p>
      <p className={cn("mt-0.5 text-[17px] font-semibold tabular-nums", statTone[tone])}>{value}</p>
      {sub && <p className="text-[11.5px] leading-snug text-subtle">{sub}</p>}
    </div>
  );
}

/** Deterministic PRNG so server and client render the same "random" data. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtMs(ms: number) {
  if (ms >= 10_000) return `${(ms / 1000).toFixed(0)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

export function fmtCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}
