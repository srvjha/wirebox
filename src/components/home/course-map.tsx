import { course } from "@/content/course";
import { formatMinutes } from "@/lib/utils";

export function CourseMap() {
  return (
    <ol className="grid gap-4 lg:grid-cols-3">
      {course.map((part) => {
        const minutes = part.modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.minutes, 0), 0);
        return (
          <li key={part.n} className="flex flex-col rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-[11px] tracking-[0.12em] text-subtle uppercase">Part {part.n}</p>
              <p className="font-mono text-[11px] text-subtle">
                {part.modules.length} {part.modules.length === 1 ? "module" : "modules"} · {formatMinutes(minutes)}
              </p>
            </div>
            <h3 className="mt-2 text-[19px] font-semibold tracking-tight text-fg">{part.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{part.summary}</p>
            <ol className="mt-5 space-y-px border-t border-line pt-3">
              {part.modules.map((m) => (
                <li key={m.slug} className="flex items-baseline gap-3 py-1.5 text-[13.5px]">
                  <span className="w-6 shrink-0 font-mono text-[11.5px] text-subtle tabular-nums">
                    {String(m.n).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-fg">{m.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-subtle">{m.lessons.length}</span>
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
