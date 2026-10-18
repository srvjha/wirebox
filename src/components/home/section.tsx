import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("font-mono text-[11px] tracking-[0.14em] text-accent uppercase", className)}>{children}</p>;
}

export function Section({
  id,
  eyebrow,
  title,
  intro,
  action,
  children,
  className,
  innerClassName,
}: {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={className}>
      <div className={cn("mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24", innerClassName)}>
        <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h2
              id={id ? `${id}-title` : undefined}
              className="mt-3 text-[28px] leading-[1.15] font-semibold tracking-tight text-balance text-fg sm:text-[36px]"
            >
              {title}
            </h2>
            {intro && <p className="mt-4 text-[15.5px] leading-relaxed text-pretty text-muted">{intro}</p>}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}
