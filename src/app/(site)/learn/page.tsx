import type { Metadata } from "next";
import { BookOpen, FlaskConical, MousePointerClick } from "lucide-react";
import { getCourseNav } from "@/components/learn/nav";
import { ContinueButton, ModuleCard, OverallProgress } from "@/components/learn/path-overview";
import { courseStats } from "@/content/course";

export const metadata: Metadata = {
  title: "The path",
  description: `${courseStats.modules} modules and ${courseStats.lessons} lessons of visual, hands-on system design. Free, no sign-up needed.`,
};

export default function LearnPage() {
  const parts = getCourseNav();
  const hours = Math.round(courseStats.minutes / 60);
  const live = parts.flatMap((p) => p.modules.flatMap((m) => m.lessons)).filter((l) => l.live).length;
  const stats = [
    { value: courseStats.modules, label: "modules" },
    { value: courseStats.lessons, label: "lessons" },
    { value: `${hours}h`, label: "of learning" },
    { value: "₹0", label: "free forever" },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section className="pt-12 pb-10 sm:pt-20">
        <h1 className="display text-[clamp(2.25rem,1.9rem+1.4vw,3rem)] text-fg">The course</h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-pretty text-fg">
          From one server to many cities, one decision at a time. Follow Gatepass, a ticketing app for gigs, comedy
          nights and college fests, as it grows. Every module starts with a problem it hits and ends with the design
          that fixes it.
        </p>
        <dl className="mt-8 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-surface px-4 py-3.5">
              <dt className="sr-only">{s.label}</dt>
              <dd className="text-2xl font-semibold tracking-tight text-fg tabular-nums">{s.value}</dd>
              <dd className="text-[12.5px] text-subtle">{s.label}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ContinueButton parts={parts} className="max-w-full" />
          <p className="text-[13px] text-subtle">
            {live} of {courseStats.lessons} lessons out now. Progress saves in your browser; sign in to keep it everywhere.
          </p>
        </div>
        <OverallProgress parts={parts} />
        <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-subtle">
          <li className="inline-flex items-center gap-1.5">
            <BookOpen className="size-3.5" /> Read: short, story-led lessons
          </li>
          <li className="inline-flex items-center gap-1.5">
            <MousePointerClick className="size-3.5 text-info" /> Interactive: visuals you can poke
          </li>
          <li className="inline-flex items-center gap-1.5">
            <FlaskConical className="size-3.5 text-accent" /> Drill: design and load-test a product
          </li>
        </ul>
      </section>

      {parts.map((part) => (
        <section key={part.n} id={`part-${part.n}`} className="scroll-mt-20 pt-10">
          <div className="mb-5 flex flex-col gap-1 border-b border-line pb-4">
            <p className="text-[13px] text-subtle">Part {part.n}</p>
            <h2 className="text-2xl font-semibold tracking-tight text-fg">{part.title}</h2>
            <p className="text-[15px] text-muted">{part.summary}</p>
          </div>
          <ol className="space-y-3">
            {part.modules.map((m) => (
              <ModuleCard key={m.slug} module={m} defaultOpen={m.n === 1} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
