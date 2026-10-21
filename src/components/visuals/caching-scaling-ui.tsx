"use client";

/**
 * Small shared building blocks for the caching, server-scaling and
 * database-scaling visuals (modules 3–5): the frame, segmented toggles,
 * sliders that report on commit, stat tiles and a ticking clock.
 */

import { useEffect, useEffectEvent, useId, useSyncExternalStore, type ReactNode } from "react";
import { trackVisual as trackFirstUse } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function VisualFrame({
  title,
  hint,
  children,
  caption,
  className,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  caption?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("not-prose my-8 rounded-2xl border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="mb-4">
        <p className="font-mono text-[10.5px] tracking-wider text-accent uppercase">Interactive</p>
        <p className="mt-0.5 text-[15.5px] font-semibold text-fg">{title}</p>
        {hint && <p className="mt-1 text-[13.5px] leading-snug text-muted">{hint}</p>}
      </div>
      {children}
      {caption && <figcaption className="mt-4 text-[13px] leading-snug text-subtle">{caption}</figcaption>}
    </figure>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="mb-1.5 font-mono text-[10.5px] tracking-wider text-subtle uppercase">{label}</p>
      <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-line bg-bg p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[12.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              o.value === value ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-w-0 items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        checked ? "border-accent/40 bg-accent-soft" : "border-line bg-bg hover:border-line-strong",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full border p-0.5 transition-colors",
          checked ? "border-accent bg-accent" : "border-line-strong bg-surface-2",
        )}
      >
        <span className={cn("size-2.5 rounded-full transition-transform", checked ? "translate-x-3 bg-accent-fg" : "bg-subtle")} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-fg">{label}</span>
        {description && <span className="block text-[12px] leading-snug text-subtle">{description}</span>}
      </span>
    </button>
  );
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  format,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Called when the learner lets go (pointer up / key up). Use it for analytics. */
  onCommit?: (v: number) => void;
  format?: (v: number) => string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-mono text-[10.5px] tracking-wider text-subtle uppercase">
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
        onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        className="w-full cursor-pointer accent-accent"
      />
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
  res: "text-res",
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
    <div className="min-w-0 rounded-xl border border-line bg-bg px-3 py-2">
      <p className="truncate font-mono text-[10px] tracking-wider text-subtle uppercase">{label}</p>
      <p className={cn("mt-0.5 text-[17px] leading-tight font-semibold tabular-nums", statTone[tone])}>{value}</p>
      {sub && <p className="mt-0.5 text-[11.5px] leading-snug text-subtle">{sub}</p>}
    </div>
  );
}

/** A horizontal meter, 0..1+ (values above 1 render full and red). */
export function Meter({ value, label, className }: { value: number; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const tone = value >= 1 ? "bg-err" : value >= 0.8 ? "bg-warn" : "bg-ok";
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <div className="mb-1 flex justify-between font-mono text-[10.5px] text-subtle">
          <span className="truncate">{label}</span>
          <span className={cn("tabular-nums", value >= 1 ? "text-err" : "text-muted")}>{Math.round(value * 100)}%</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className={cn("h-full rounded-full transition-[width] duration-300", tone)} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

/** Track the first interaction with a visual on this page. */
export function trackVisual(visual: string) {
  trackFirstUse(visual);
}

/** Calls `fn` every `ms` while `running`. */
export function useInterval(fn: () => void, ms: number, running: boolean) {
  const tick = useEffectEvent(fn);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => tick(), ms);
    return () => window.clearInterval(t);
  }, [ms, running]);
}

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True when the learner asked the OS for less motion. False on the server. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

export function fmt(n: number, digits = 0) {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtMs(ms: number) {
  if (ms >= 10_000) return `${fmt(ms / 1000, 0)} s`;
  if (ms >= 1000) return `${fmt(ms / 1000, 1)} s`;
  if (ms < 10) return `${fmt(ms, 1)} ms`;
  return `${fmt(ms, 0)} ms`;
}

/** Deterministic PRNG so server and client render the same "random" numbers. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
