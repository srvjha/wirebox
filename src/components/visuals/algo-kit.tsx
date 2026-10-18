"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small shared building blocks for the "Classic algorithms" simulations:
 * a frame, stat tiles, a segmented control and a range slider that reports
 * its value once the learner lets go.
 */

/** Distinct series colours that read on both themes. Index by node/series. */
export const SERIES = [
  "var(--accent)",
  "var(--res)",
  "var(--info)",
  "var(--warn)",
  "#e46fae",
  "#3fb8c4",
] as const;

export function VisualFrame({
  eyebrow,
  title,
  caption,
  children,
  label,
}: {
  eyebrow: string;
  title?: string;
  caption?: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  return (
    <figure className="not-prose my-8 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-label={label ?? title}>
      <div className="mb-4">
        <p className="font-mono text-[11px] tracking-wider text-accent uppercase">{eyebrow}</p>
        {title && <p className="mt-1 text-[15.5px] font-medium text-fg">{title}</p>}
        {caption && <p className="mt-1 text-[13.5px] leading-relaxed text-subtle">{caption}</p>}
      </div>
      {children}
    </figure>
  );
}

const statTone = {
  default: "text-fg",
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  err: "text-err",
  info: "text-info",
  res: "text-res",
} as const;

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
  tone?: keyof typeof statTone;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-line bg-surface-2 px-3 py-2", className)}>
      <p className="truncate font-mono text-[10px] tracking-wider text-subtle uppercase">{label}</p>
      <p className={cn("mt-0.5 font-mono text-[15px] leading-tight font-medium tabular-nums", statTone[tone])}>{value}</p>
      {sub && <p className="mt-0.5 text-[11.5px] leading-snug text-subtle">{sub}</p>}
    </div>
  );
}

export function Segmented<T extends string | number>({
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
    <div className="min-w-0">
      <p className="mb-1.5 font-mono text-[10.5px] tracking-wider text-subtle uppercase">{label}</p>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-bg p-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-7 rounded-lg px-2.5 font-mono text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
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

export function Range({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  onCommit,
  display,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  /** Called once when the learner releases the slider (pointer or key up). */
  onCommit?: (v: number) => void;
  display?: ReactNode;
}) {
  const commit = (el: HTMLInputElement) => onCommit?.(Number(el.value));
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10.5px] tracking-wider text-subtle uppercase">{label}</span>
        <span className="font-mono text-[12.5px] text-fg tabular-nums">{display ?? value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => commit(e.currentTarget)}
        onKeyUp={(e) => commit(e.currentTarget)}
        className="h-5 w-full cursor-pointer accent-accent"
      />
    </label>
  );
}

/** A compact action button used inside simulations. */
export function SimButton({
  children,
  onClick,
  disabled,
  primary,
  className,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  primary?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-45",
        primary
          ? "bg-accent text-accent-fg hover:bg-accent-strong"
          : "border border-line bg-surface-2 text-fg hover:bg-surface-3",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function pct(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return "–";
  return `${(x * 100).toFixed(digits)}%`;
}
