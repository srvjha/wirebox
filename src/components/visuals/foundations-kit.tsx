"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small controls shared by the Module 1–2 visuals: a frame, a slider that
 * reports on commit, a toggle and a segmented picker. Theme-aware via tokens.
 */

export function VisualFrame({
  eyebrow = "Interactive",
  title,
  caption,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("not-prose my-8 rounded-2xl border border-line bg-surface p-4 sm:p-5", className)}>
      <p className="font-mono text-[10.5px] tracking-wider text-info uppercase">{eyebrow}</p>
      <p className="mt-0.5 text-[15px] font-semibold text-fg">{title}</p>
      <div className="mt-4">{children}</div>
      {caption && <figcaption className="mt-4 text-[13px] leading-relaxed text-subtle">{caption}</figcaption>}
    </figure>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  onChange: (v: number) => void;
  /** Called when the reader lets go (pointer up, key up). Use for analytics. */
  onCommit?: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-fg tabular-nums">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit?.(Number(e.currentTarget.value))}
        onKeyUp={(e) => onCommit?.(Number(e.currentTarget.value))}
        className="mt-1.5 h-5 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-accent [&::-moz-range-thumb]:bg-surface [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:bg-surface focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-accent/30"
        style={{
          background: `linear-gradient(to right, var(--accent) 0 ${pct}%, var(--surface-3) ${pct}% 100%) center / 100% 6px no-repeat`,
        }}
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-bg px-3 py-2 text-left transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
    >
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-fg">{label}</span>
        {hint && <span className="block text-[11.5px] text-subtle">{hint}</span>}
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-bg p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[12.5px] transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
            value === o.value ? "bg-surface-3 font-medium text-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 1234 -> "1.2K", 3_400_000 -> "3.4M" */
export function compact(n: number, digits = 1) {
  if (!Number.isFinite(n)) return "∞";
  const abs = Math.abs(n);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [v, s] of units) if (abs >= v) return `${trim((n / v).toFixed(digits))}${s}`;
  if (abs >= 10 || abs === 0) return String(Math.round(n));
  return trim(n.toFixed(abs < 1 ? 2 : 1));
}

function trim(s: string) {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Bytes to a human string (decimal units, like disks and networks). */
export function bytes(n: number) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return `${trim(n.toFixed(n < 10 ? 1 : 0))} ${units[i]}`;
}

/** Milliseconds, nanoseconds etc. from a value in nanoseconds. */
export function duration(ns: number) {
  if (ns < 1e3) return `${trim(ns.toFixed(ns < 10 ? 1 : 0))} ns`;
  if (ns < 1e6) return `${trim((ns / 1e3).toFixed(ns < 1e4 ? 1 : 0))} µs`;
  if (ns < 1e9) return `${trim((ns / 1e6).toFixed(ns < 1e7 ? 1 : 0))} ms`;
  return `${trim((ns / 1e9).toFixed(ns < 1e10 ? 1 : 0))} s`;
}
