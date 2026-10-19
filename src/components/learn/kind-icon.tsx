import { BookOpen, FlaskConical, MousePointerClick } from "lucide-react";
import type { LessonKind } from "@/content/course";
import { cn } from "@/lib/utils";

export const kindLabel: Record<LessonKind, string> = {
  read: "Read",
  visual: "Interactive",
  drill: "Drill",
};

const icons = { read: BookOpen, visual: MousePointerClick, drill: FlaskConical } as const;
const tones = { read: "text-subtle", visual: "text-info", drill: "text-accent" } as const;

export function KindIcon({ kind, className }: { kind: LessonKind; className?: string }) {
  const Icon = icons[kind];
  return <Icon aria-label={kindLabel[kind]} className={cn("size-3.5 shrink-0", tones[kind], className)} />;
}
