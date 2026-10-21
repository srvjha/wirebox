"use client";

import { useCallback, useId, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { trackVisual } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Small shared pieces for the Part 2 (distributed systems) visuals: a frame,
 * a slider, a segmented control, stat tiles and a typed tracking helper.
 * Every visual stays self-contained; these only keep them consistent.
 */

export function VisualFrame({
  eyebrow,
  title,
  hint,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <figure className={cn("not-prose my-8 rounded-2xl border border-line bg-surface p-4 sm:p-5", className)}>
        <figcaption className="mb-4">
          <p className="font-mono text-[11px] tracking-wider text-accent uppercase">{eyebrow ?? "Try it"}</p>
          <p className="mt-1 text-[15.5px] font-medium text-fg">{title}</p>
          {hint && <p className="mt-1 text-[13.5px] leading-relaxed text-subtle">{hint}</p>}
        </figcaption>
        {children}
      </figure>
    </MotionConfig>
  );
}

/** Returns a tracker bound to one visual: `t("control", value)`. */
export function useVisualTracker(visual: string) {
  return useCallback(
    () => trackVisual(visual),
    [visual],
  );
}

export function Slider({
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
  /** Called when the learner lets go (pointer up or key up). Use it for tracking. */
  onCommit?: (v: number) => void;
  format?: (v: number) => string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
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
        onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        className="mt-1.5 h-5 w-full cursor-pointer accent-[var(--accent)]"
      />
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  label: string;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1 rounded-xl border border-line bg-bg p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-lg font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "px-2 py-1 text-[12px]" : "px-2.5 py-1.5 text-[13px]",
              active ? "bg-surface-3 text-fg shadow-card" : "text-muted hover:text-fg",
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
} as const;

export type StatTone = keyof typeof statTone;

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-line bg-surface-2 px-3 py-2.5", className)}>
      <p className="font-mono text-[10.5px] tracking-wider text-subtle uppercase">{label}</p>
      <p className={cn("mt-0.5 text-[20px] leading-tight font-semibold tabular-nums", statTone[tone])}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] leading-snug text-subtle">{sub}</p>}
    </div>
  );
}

/** A small toggle switch with a visible label. */
export function Toggle({
  label,
  checked,
  onChange,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-1 py-1 text-[13px] text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60",
        className,
      )}
    >
      <span
        className={cn(
          "relative inline-block h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked ? "border-accent bg-accent" : "border-line-strong bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3.5 rounded-full bg-fg transition-[left]",
            checked ? "left-[18px] bg-accent-fg" : "left-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}

/** Deterministic PRNG so server and client renders match. */
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

/** 32-bit FNV-1a with a murmur finaliser: well spread, stable everywhere. */
export function hash32(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
