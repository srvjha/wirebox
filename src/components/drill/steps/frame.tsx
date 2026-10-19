import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The reading column every non-canvas step uses. */
export function StepFrame({
  eyebrow,
  title,
  children,
  footer,
  wide,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-10 sm:px-6 sm:py-14", wide ? "max-w-[880px]" : "max-w-[720px]")}>
      <p className="font-mono text-[11px] tracking-wider text-accent uppercase">{eyebrow}</p>
      <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight text-fg sm:text-[32px]">{title}</h1>
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-6">{footer}</div>}
    </div>
  );
}

export function ContinueButton({ onClick, children = "Continue", disabled }: { onClick: () => void; children?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong disabled:pointer-events-none disabled:opacity-40"
    >
      {children} <ArrowRight className="size-4" />
    </button>
  );
}
