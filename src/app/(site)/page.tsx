import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Faq } from "@/components/home/faq";
import { LiveSystem } from "@/components/home/live-system";
import { DrillIcon } from "@/components/site/drill-card";
import { TrackedLink } from "@/components/site/tracked-link";
import { CacheHitRateExplorer } from "@/components/visuals/cache-hit-rate-explorer";
import { allLessons, course, courseStats } from "@/content/course";
import { drillCatalog, getDrillMeta } from "@/content/drills/catalog";
import { cn, formatMinutes, SITE } from "@/lib/utils";
import { AUTH_ENABLED } from "@/lib/features";

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} · Learn system design by building it` },
  description: SITE.description,
};

const liveDrills = drillCatalog.filter((d) => d.status === "live");
const firstDrill = liveDrills[0]?.slug ?? "pastebin";
const hours = Math.round(courseStats.minutes / 60);

const featured = ["ticket-booking", "chat", "payments", "video-platform", "collab-editor", "pastebin"]
  .map(getDrillMeta)
  .filter((d) => !!d);

const facts = [
  { value: courseStats.modules, label: "modules" },
  { value: courseStats.lessons, label: "lessons" },
  { value: drillCatalog.length, label: "product drills" },
  { value: `${hours} h`, label: "of material, all free" },
];

const minutesOf = (lessons: { minutes: number }[]) => lessons.reduce((n, l) => n + l.minutes, 0);

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";
const sectionGap = "py-20 sm:py-28";
const h2 = "text-[clamp(2rem,1.5rem+2vw,3rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-fg";
const body = "text-[17px] leading-[1.6] text-fg/80";
const primary =
  "press inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-5 text-[16px] font-medium text-accent-fg outline-none hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
const secondary =
  "press inline-flex h-12 items-center gap-2 rounded-lg bg-surface-2 px-5 text-[16px] font-medium text-fg outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent";

export default function Home() {
  return (
    <>
      {/* Hero: what it is, and the system to break */}
      <section className={cn(container, "pt-12 pb-20 sm:pt-20 sm:pb-28")}>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-12">
          <div>
            <h1 className="rise text-[clamp(2.5rem,1.8rem+2.2vw,3.5rem)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance text-fg">
              Learn system design by breaking it.
            </h1>
            <p className={cn(body, "rise rise-2 mt-6 max-w-[44ch] text-[18px]")}>
              A free course. You build Gatepass, a ticketing app for gigs, then flood it with traffic and fix whatever
              fails first.
            </p>
            <div className="rise rise-2 mt-8 flex flex-wrap gap-3">
              <TrackedLink href="/learn" location="home_hero" plain className={primary}>
                Start learning <ArrowRight className="size-4" aria-hidden />
              </TrackedLink>
              <TrackedLink href={`/drills/${firstDrill}`} location="home_hero" plain className={secondary}>
                Try a drill
              </TrackedLink>
            </div>
            <p className="rise rise-3 mt-4 text-[14px] text-muted">No sign-up needed. Progress saves in your browser.</p>
          </div>
          <div className="rise rise-3">
            <LiveSystem />
          </div>
        </div>

        <dl className="mt-20 grid grid-cols-2 gap-y-8 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="sr-only">{f.label}</dt>
              <dd className="text-[clamp(2rem,1.6rem+1.4vw,2.75rem)] font-semibold tracking-[-0.03em] text-fg tabular-nums">
                {f.value}
              </dd>
              <dd className="text-[15px] text-muted">{f.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* A real lesson visual */}
      <section aria-labelledby="lesson-title" className="bg-surface">
        <div className={cn(container, sectionGap, "grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14")}>
          <div>
            <h2 id="lesson-title" className={cn(h2, "rise")}>
              Lessons you can poke
            </h2>
            <p className={cn(body, "rise rise-2 mt-5 max-w-[42ch]")}>
              This one is from the caching module. Drag the sliders and watch the hit rate and database load move. No
              video to sit through: each idea is a small system you run yourself.
            </p>
            <TrackedLink
              href="/learn/why-cache"
              location="home_lesson"
              plain
              className="rise rise-3 mt-6 inline-flex items-center gap-1.5 text-[16px] font-medium text-accent hover:underline"
            >
              Open the full lesson <ArrowRight className="size-4" aria-hidden />
            </TrackedLink>
          </div>
          <div data-ui className="rise rise-2 rounded-xl bg-bg p-4 sm:p-6">
            <CacheHitRateExplorer />
          </div>
        </div>
      </section>

      {/* Drills */}
      <section aria-labelledby="drills-title" className={cn(container, sectionGap)}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 id="drills-title" className={cn(h2, "rise")}>
              Then design a whole product
            </h2>
            <p className={cn(body, "rise rise-2 mt-5 max-w-[56ch]")}>
              Each drill is a product brief and a blank canvas. You write the API, model the data, wire the architecture,
              and a simulator load-tests it step by step until it holds.
            </p>
          </div>
          <TrackedLink href="/drills" location="home_drills" plain className={secondary}>
            All {drillCatalog.length} drills
          </TrackedLink>
        </div>
        <ul className="mt-12 grid gap-x-10 sm:grid-cols-2">
          {featured.map((d) => (
            <li key={d.slug} className="rise">
              <TrackedLink
                href={`/drills/${d.slug}`}
                location="home_drills"
                plain
                className="group flex items-start gap-4 rounded-lg px-3 py-5 outline-none hover:bg-surface focus-visible:bg-surface"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg group-hover:text-accent">
                  <DrillIcon slug={d.slug} className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-fg">{d.product}</span>
                  <span className="mt-0.5 block text-[15px] leading-snug text-muted">{d.tagline}</span>
                  <span className="mt-2 block text-[14px] text-muted tabular-nums">
                    {d.difficulty[0].toUpperCase() + d.difficulty.slice(1)}, {d.minutes} min
                  </span>
                </span>
                <ArrowRight
                  className="mt-1 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </TrackedLink>
            </li>
          ))}
        </ul>
      </section>

      {/* The course path */}
      <section aria-labelledby="course-title" className="bg-surface">
        <div className={cn(container, sectionGap)}>
          <h2 id="course-title" className={cn(h2, "rise max-w-[22ch]")}>
            One app, from one server to many cities
          </h2>
          <p className={cn(body, "rise rise-2 mt-5 max-w-[60ch]")}>
            Gatepass starts on a single server for one college fest. Every module opens with the next problem it hits
            as it grows, and ends with the design that fixes it.
          </p>
          <ol className="mt-12 grid gap-10 lg:grid-cols-3">
            {course.map((part) => (
              <li key={part.n} className="rise">
                <h3 className="text-[19px] font-semibold text-fg">
                  Part {part.n}: {part.title}
                </h3>
                <p className="mt-1 text-[15px] text-muted">{part.summary}</p>
                <ul className="mt-5 space-y-2.5">
                  {part.modules.map((m) => (
                    <li key={m.slug} className="flex items-baseline justify-between gap-4 text-[15px]">
                      <span className="text-fg">{m.title}</span>
                      <span className="shrink-0 text-muted tabular-nums">{formatMinutes(minutesOf(m.lessons))}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why free + FAQ */}
      <section aria-labelledby="free-title" className={cn(container, sectionGap)}>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <h2 id="free-title" className={cn(h2, "rise")}>
              Free, all of it
            </h2>
            <p className={cn(body, "rise rise-2 mt-5 max-w-[46ch]")}>
              The people who most need this material are often the ones least able to pay for it: students, people
              switching careers, developers where a course subscription costs a week&apos;s pay. So there is no paywall,
              no trial and no upsell.{AUTH_ENABLED && " Sign in only to sync progress between devices."}
            </p>
          </div>
          <div>
            <h3 className="text-[19px] font-semibold text-fg">Questions</h3>
            <div className="mt-4">
              <Faq />
            </div>
          </div>
        </div>
      </section>

      {/* Final call to action */}
      <section className={cn(container, "pb-24")}>
        <div className="flex flex-col items-start justify-between gap-8 rounded-2xl bg-accent px-6 py-12 text-accent-fg sm:flex-row sm:items-center sm:px-12 sm:py-16">
          <div>
            <h2 className="text-[clamp(1.75rem,1.4rem+1.6vw,2.5rem)] leading-[1.1] font-semibold tracking-[-0.03em] text-balance">
              Start with one server.
            </h2>
            <p className="mt-2 text-[17px] opacity-80">
              The first lesson takes {allLessons[0].minutes} minutes. No sign-up, no card.
            </p>
          </div>
          <TrackedLink
            href="/learn"
            location="home_final"
            plain
            className="press inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-accent-fg px-6 text-[16px] font-medium text-accent outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent-fg"
          >
            Start learning <ArrowRight className="size-4" aria-hidden />
          </TrackedLink>
        </div>
      </section>
    </>
  );
}
