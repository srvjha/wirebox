"use client";

import { BookOpen, Check, CodeXml, Database, Flag, GitFork, Lock, Network, Sparkles } from "lucide-react";
import type { Step, StepType } from "@/lib/drill/types";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<StepType, typeof BookOpen> = {
  intro: Sparkles,
  read: BookOpen,
  api: CodeXml,
  schema: Database,
  design: Network,
  choose: GitFork,
  finish: Flag,
};

type Props = {
  steps: Step[];
  current: number;
  passed: string[];
  frontier: number;
  onGo: (i: number) => void;
};

export function StepList({ steps, current, passed, frontier, onGo }: Props) {
  let designN = 0;
  return (
    <ol className="space-y-0.5 p-2">
      {steps.map((s, i) => {
        const done = passed.includes(s.id);
        const locked = i > frontier;
        const active = i === current;
        const Icon = TYPE_ICON[s.type];
        if (s.type === "design") designN++;
        return (
          <li key={s.id}>
            <button
              type="button"
              disabled={locked}
              onClick={() => onGo(i)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg",
                locked && "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-muted",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border",
                  done ? "border-ok/40 bg-ok/15 text-ok" : active ? "border-accent/60 text-accent" : "border-line text-subtle",
                )}
              >
                {done ? <Check className="size-3.5" /> : locked ? <Lock className="size-3" /> : <Icon className="size-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-tight font-medium">{s.short ?? s.title}</span>
                <span className="block font-mono text-[10px] tracking-wide text-subtle uppercase">
                  {s.type === "design" ? `Load test ${designN}` : s.type === "read" ? "Concept" : s.type === "choose" ? "Deep dive" : s.type}
                  {" · "}
                  {s.minutes}m
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
