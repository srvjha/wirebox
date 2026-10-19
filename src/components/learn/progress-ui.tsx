import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavModule } from "./types";

export function moduleProgress(module: NavModule, completed: ReadonlySet<string>) {
  const total = module.lessons.length;
  const done = module.lessons.filter((l) => completed.has(l.slug)).length;
  return { done, total, pct: total ? done / total : 0 };
}

/**
 * A module is finished when every lesson the reader *can* do is done. Drills are
 * tracked by the drill itself, and unwritten lessons can't be done yet.
 */
export function isModuleFinished(module: NavModule, completed: ReadonlySet<string>) {
  const doable = module.lessons.filter((l) => l.live && l.kind !== "drill");
  return doable.length > 0 && doable.every((l) => completed.has(l.slug));
}

export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label ?? "Progress"}
      className={cn("h-1 overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", pct === 100 ? "bg-ok" : "bg-accent")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Round completion tick. */
export function Tick({ done, className }: { done: boolean; className?: string }) {
  return (
    <span
      aria-label={done ? "Completed" : "Not completed"}
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
        done ? "border-ok bg-ok text-bg" : "border-line-strong text-transparent",
        className,
      )}
    >
      <Check className="size-2.5" strokeWidth={3.5} />
    </span>
  );
}
