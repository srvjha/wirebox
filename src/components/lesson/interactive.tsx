"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useLesson } from "./context";

/**
 * "Your turn": the learner writes their own answers first, then compares with
 * an expert's (children). Answers stay in the browser.
 */
export function YourTurn({
  id,
  prompt,
  fields = 3,
  examples,
  minAnswers = 2,
  hint,
  children,
}: {
  id: string;
  prompt: string;
  fields?: number;
  examples?: string[];
  minAnswers?: number;
  hint?: string;
  children: ReactNode;
}) {
  const { slug } = useLesson();
  const [values, setValues] = useState<string[]>(() => Array(fields).fill(""));
  const [picked, setPicked] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const filled = values.filter((v) => v.trim().length > 3).length;

  return (
    <section className="not-prose my-8 rounded-2xl border border-line bg-surface p-5">
      <p className="mb-1 flex items-center gap-2 text-[13px] text-accent">
        <PenLine className="size-3.5" /> Your turn
      </p>
      <p className="text-[15.5px] font-medium text-fg">{prompt}</p>
      {examples && (
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setPicked(e)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12.5px] transition-colors",
                picked === e ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg",
              )}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="mt-2.5 font-mono text-[11px] text-subtle">{String(i + 1).padStart(2, "0")}</span>
            <textarea
              value={v}
              rows={1}
              onChange={(e) => setValues((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="Write your answer…"
              className="min-h-10 w-full resize-y rounded-xl border border-line bg-bg px-3 py-2 text-[14px] text-fg outline-none placeholder:text-subtle focus:border-accent/60"
            />
          </div>
        ))}
      </div>
      {hint && <p className="mt-3 text-[13px] text-subtle">Stuck? {hint}</p>}
      <div className="mt-4 flex items-center gap-3">
        <Button
          size="sm"
          variant={shown ? "secondary" : "primary"}
          disabled={filled < minAnswers && !shown}
          onClick={() => {
            if (!shown) track("your_turn_submitted", { lesson: slug, prompt: id, answers: filled });
            setShown((s) => !s);
          }}
        >
          {shown ? "Hide the expert answer" : "Compare with an expert"}
        </Button>
        {!shown && filled < minAnswers && (
          <span className="text-[12.5px] text-subtle">Write at least {minAnswers} first.</span>
        )}
      </div>
      {shown && (
        <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4 text-[14.5px] leading-relaxed text-muted [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:text-fg [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      )}
    </section>
  );
}

/** Single-answer multiple choice with an explanation. */
export function Quiz({
  id,
  question,
  options,
  answer,
  explain,
}: {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explain: ReactNode;
}) {
  const { slug } = useLesson();
  const [choice, setChoice] = useState<number | null>(null);
  const done = choice !== null;
  return (
    <section className="not-prose my-8 rounded-2xl border border-line bg-surface p-5">
      <p className="mb-1 text-[13px] text-info">Check yourself</p>
      <p className="text-[15.5px] font-medium text-fg">{question}</p>
      <div className="mt-4 grid gap-2">
        {options.map((o, i) => {
          const correct = i === answer;
          const chosen = i === choice;
          return (
            <button
              key={o}
              type="button"
              disabled={done}
              onClick={() => {
                setChoice(i);
                track("quiz_answered", { lesson: slug, quiz: id, correct: i === answer });
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-[14px] transition-colors",
                !done && "border-line text-muted hover:border-line-strong hover:text-fg",
                done && correct && "border-ok/40 bg-ok/10 text-fg",
                done && chosen && !correct && "border-err/40 bg-err/10 text-fg",
                done && !correct && !chosen && "border-line text-subtle",
              )}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full border border-current font-mono text-[10px]">
                {done && correct ? <Check className="size-3" /> : done && chosen ? <X className="size-3" /> : String.fromCharCode(65 + i)}
              </span>
              {o}
            </button>
          );
        })}
      </div>
      {done && (
        <div className="mt-4 text-[14.5px] leading-relaxed text-muted [&_strong]:text-fg">
          <span className={cn("font-semibold", choice === answer ? "text-ok" : "text-err")}>
            {choice === answer ? "Right. " : "Not quite. "}
          </span>
          {explain}
        </div>
      )}
    </section>
  );
}

/** A collapsible aside for detail most readers can skip. */
export function Reveal({ title, children }: { id?: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="not-prose my-6 rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-[14.5px] font-medium text-fg"
      >
        {title}
        <ChevronDown className={cn("size-4 text-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-line px-5 py-4 text-[14.5px] leading-relaxed text-muted [&_li]:mt-1 [&_p+p]:mt-3 [&_strong]:text-fg [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      )}
    </div>
  );
}
