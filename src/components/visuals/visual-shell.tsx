"use client";

import type { ReactNode } from "react";
import { useCallback } from "react";
import { trackVisual } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Small shared building blocks for the interactive visuals in the messaging,
 * transactions, streams and availability modules. Every visual sits in the
 * same framed card with an eyebrow, a title and one line of instructions.
 */

export function VisualShell({
  title,
  hint,
  children,
  footer,
  className,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("not-prose my-8 rounded-2xl border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="mb-4">
        <p className="font-mono text-[10.5px] tracking-[0.12em] text-accent uppercase">Try it</p>
        <p className="mt-0.5 text-[15.5px] font-semibold text-fg">{title}</p>
        {hint && <p className="mt-1 text-[13.5px] leading-relaxed text-subtle">{hint}</p>}
      </div>
      {children}
      {footer && <figcaption className="mt-4 text-[13px] leading-relaxed text-subtle">{footer}</figcaption>}
    </figure>
  );
}

/** Returns a tracker bound to one visual: `t("control", value)`. */
export function useVisualTracker(visual: string) {
  return useCallback(
    () => trackVisual(visual),
    [visual],
  );
}

/** A compact segmented control (radio group). */
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
    <div role="radiogroup" aria-label={label} className={cn("inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[12.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              on ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const MARKER_TONES: [string, string][] = [
  ["default", "var(--fg-muted)"],
  ["req", "var(--req)"],
  ["res", "var(--res)"],
  ["err", "var(--err)"],
  ["info", "var(--info)"],
  ["warn", "var(--warn)"],
  ["ok", "var(--ok)"],
  ["accent", "var(--accent)"],
  ["muted", "var(--fg-subtle)"],
];

/**
 * An SVG canvas for client visuals that use the diagram kit's Box/Wire/Tag.
 * It defines the same arrow markers as <Diagram>, so Wire arrows render.
 */
export function VisualCanvas({
  w,
  h,
  label,
  children,
  className,
}: {
  w: number;
  h: number;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-dots overflow-hidden rounded-xl border border-line bg-bg p-2 sm:p-3", className)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full overflow-visible" role="img" aria-label={label} fontFamily="var(--font-geist-sans)">
        <defs>
          {MARKER_TONES.map(([t, c]) => (
            <marker key={t} id={`arrow-${t}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={c} />
            </marker>
          ))}
        </defs>
        {children}
      </svg>
    </div>
  );
}

/** A small action button used in visual toolbars. */
export function VisualButton({
  children,
  onClick,
  disabled,
  tone = "neutral",
  pressed,
  className,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "accent" | "err" | "ok";
  pressed?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-40",
        tone === "accent" && "border-accent bg-accent text-accent-fg hover:bg-accent-strong",
        tone === "neutral" && "border-line bg-surface-2 text-fg hover:bg-surface-3",
        tone === "err" && "border-err/40 bg-err/10 text-err hover:bg-err/15",
        tone === "ok" && "border-ok/40 bg-ok/10 text-ok hover:bg-ok/15",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A labelled number, for the stats row under a simulation. */
export function Stat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: "ok" | "warn" | "err" | "info" | "accent";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-line bg-surface-2 px-3 py-2", className)}>
      <p className="truncate font-mono text-[10px] tracking-wider text-subtle uppercase">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-fg",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "err" && "text-err",
          tone === "info" && "text-info",
          tone === "accent" && "text-accent",
        )}
      >
        {value}
      </p>
    </div>
  );
}
