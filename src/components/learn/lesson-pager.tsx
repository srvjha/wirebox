import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NeighbourLink } from "./nav";

function Card({ link, dir }: { link: NeighbourLink; dir: "prev" | "next" }) {
  const isLab = link.kind === "lab";
  return (
    <Link
      href={link.href}
      className={cn(
        "group flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-2",
        dir === "next" && "sm:items-end sm:text-right",
      )}
    >
      <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-subtle uppercase">
        {dir === "prev" && <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />}
        {dir === "prev" ? "Previous" : isLab ? "Next · Drill" : "Next"}
        {dir === "next" && <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />}
      </span>
      <span className="text-[15px] font-medium text-fg">
        <span className="mr-1.5 font-mono text-[12px] text-subtle">{link.n}</span>
        {link.title}
      </span>
      <span className="text-[12.5px] text-subtle">{link.moduleTitle}</span>
    </Link>
  );
}

/** Previous/next live lessons. Unwritten lessons in between are listed as coming soon. */
export function LessonPager({
  prev,
  next,
  skipped,
}: {
  prev: NeighbourLink | null;
  next: NeighbourLink | null;
  skipped: NeighbourLink[];
}) {
  const soon = skipped.slice(0, 3);
  return (
    <div className="mt-8">
      <div className="grid gap-3 sm:grid-cols-2">
        {prev ? <Card link={prev} dir="prev" /> : <div className="hidden sm:block" />}
        {next ? (
          <Card link={next} dir="next" />
        ) : (
          skipped[0] && (
            <div
              aria-disabled="true"
              className="flex flex-col gap-1 rounded-2xl border border-dashed border-line p-4 sm:items-end sm:text-right"
            >
              <span className="font-mono text-[11px] tracking-wider text-subtle uppercase">Next · coming soon</span>
              <span className="text-[15px] font-medium text-muted">{skipped[0].title}</span>
              <span className="text-[12.5px] text-subtle">Being written. Check back soon.</span>
            </div>
          )
        )}
      </div>
      {next && soon.length > 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-line px-4 py-3">
          <p className="flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-subtle uppercase">
            <Clock className="size-3.5" /> Coming soon, skipped for now
          </p>
          <ul className="mt-1.5 space-y-0.5 text-[13.5px] text-subtle">
            {soon.map((s) => (
              <li key={s.slug}>
                <span className="mr-1.5 font-mono text-[12px]">{s.n}</span>
                {s.title}
              </li>
            ))}
            {skipped.length > soon.length && <li>and {skipped.length - soon.length} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
