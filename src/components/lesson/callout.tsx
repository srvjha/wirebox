import type { ReactNode } from "react";
import { AlertTriangle, Info, Lightbulb, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  note: { icon: Info, cls: "border-line bg-surface", color: "text-muted", title: "Note" },
  tip: { icon: Lightbulb, cls: "border-ok/25 bg-ok/5", color: "text-ok", title: "Tip" },
  warn: { icon: AlertTriangle, cls: "border-warn/25 bg-warn/5", color: "text-warn", title: "Watch out" },
  key: { icon: Sparkles, cls: "border-accent/30 bg-accent-soft", color: "text-accent", title: "Key idea" },
} as const;

export function Callout({
  tone = "note",
  title,
  children,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children: ReactNode;
}) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <aside className={cn("not-prose my-6 rounded-2xl border px-5 py-4", t.cls)}>
      <p className={cn("mb-1.5 flex items-center gap-2 text-[13px] font-semibold", t.color)}>
        <Icon className="size-4" />
        {title ?? t.title}
      </p>
      <div className="text-[15px] leading-relaxed text-muted [&_strong]:text-fg [&>p+p]:mt-2">{children}</div>
    </aside>
  );
}

/** One sentence the reader should leave with. */
export function KeyIdea({ children }: { children: ReactNode }) {
  return (
    <div className="not-prose my-8 border-l-2 border-accent py-1 pl-5">
      <p className="text-[19px] leading-snug font-medium tracking-tight text-fg">{children}</p>
    </div>
  );
}
