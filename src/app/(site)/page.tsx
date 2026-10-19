import type { Metadata } from "next";
import Image from "next/image";
import { Faq } from "@/components/home/faq";
import { LiveSystem } from "@/components/home/live-system";
import { TrackedLink } from "@/components/site/tracked-link";
import { allLessons, course, courseStats } from "@/content/course";
import { drillCatalog, getDrillMeta } from "@/content/drills/catalog";
import { photos, selectorClip, type Photo } from "@/content/photos";
import { cn, formatMinutes, SITE } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} · Learn system design by building it` },
  description: SITE.description,
};

const liveDrills = drillCatalog.filter((d) => d.status === "live");
const firstDrill = liveDrills[0]?.slug ?? "pastebin";
const hours = Math.round(courseStats.minutes / 60);

/** The drills set as a line-up poster, headliners first. */
const lineUp = ["ticket-booking", "chat", "payments", "video-platform", "collab-editor", "pastebin"]
  .map(getDrillMeta)
  .filter((d) => !!d);

const minutesOf = (lessons: { minutes: number }[]) => lessons.reduce((n, l) => n + l.minutes, 0);

/** Each part of the course printed as a stop on the itinerary. */
const itinerary = course.map((part) => {
  const shown = part.modules.slice(0, 3);
  const rest = part.modules.slice(3);
  return {
    n: part.n,
    title: part.title,
    rows: [
      ...shown.map((m) => ({ label: m.title, value: formatMinutes(minutesOf(m.lessons)) })),
      ...(rest.length
        ? [
            {
              label: `and ${rest.length} more ${rest.length === 1 ? "module" : "modules"}`,
              value: formatMinutes(rest.reduce((n, m) => n + minutesOf(m.lessons), 0)),
            },
          ]
        : []),
    ],
  };
});

const frame = "px-5 sm:px-7";
const gap = "py-[clamp(96px,11vw,200px)]";
const head = "display text-[clamp(2.5rem,1.6rem+3.6vw,4.5rem)] text-fg text-balance";
const lead = "text-[clamp(1.25rem,1.1rem+0.7vw,1.625rem)] leading-[1.4] text-fg";
const body = "text-[17px] leading-[1.55] text-fg";

function Figure({ photo, className, sizes, priority }: { photo: Photo; className?: string; sizes: string; priority?: boolean }) {
  return (
    <figure className={className}>
      <div className="overflow-hidden">
        <Image
          src={photo.src}
          width={photo.width}
          height={photo.height}
          alt={photo.alt}
          sizes={sizes}
          priority={priority}
          className="archival drift h-full w-full object-cover"
        />
      </div>
      <figcaption className="mt-3 max-w-[60ch] text-[14px] leading-snug text-muted">{photo.caption}</figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <>
      {/* The name, cropped by the screen */}
      <section className="relative flex min-h-[calc(100svh-3.5rem)] flex-col overflow-hidden">
        <h1 className="display hero-word text-fg">
          <span aria-hidden>Wirebox</span>
          <span className="sr-only top-1/3 right-0 [writing-mode:horizontal-tb]">Wirebox: learn system design by building it</span>
        </h1>
        <div className={cn(frame, "relative z-10 pt-10 max-sm:w-[56%] sm:pt-16")}>
          <p className={cn(lead, "rise max-w-[34ch]")}>
            A free system design course. You build Gatepass, a ticketing app for gigs, then flood it with fans until it
            breaks.
          </p>
          <div className="rise rise-2 mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <TrackedLink
              href="/learn"
              location="home_hero"
              plain
              className="press inline-flex h-12 items-center bg-accent px-6 text-[17px] font-medium text-accent-fg outline-none hover:bg-fg hover:text-bg focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Start learning
            </TrackedLink>
            <TrackedLink
              href={`/drills/${firstDrill}`}
              location="home_hero"
              plain
              className="text-[17px] text-fg underline decoration-1 underline-offset-4 hover:text-accent"
            >
              Or try a drill
            </TrackedLink>
          </div>
        </div>
      </section>

      {/* Two numbers, the same app */}
      <section aria-labelledby="scale-title" className={cn(frame, "pt-[clamp(96px,11vw,200px)]")}>
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-x-7">
          <h2 id="scale-title" className={cn(head, "rise lg:col-span-5")}>
            Same app, louder nights
          </h2>
          <p className={cn(body, "rise rise-2 max-w-[56ch] lg:col-span-5 lg:col-start-7")}>
            In its first year Gatepass served three requests a second, and one server was plenty. Then a big show opens
            its seat map and ten thousand phones refresh it every second. The course is the road between those two
            numbers, one broken assumption at a time.
          </p>
        </div>
        <div className="mt-[12vh] grid gap-y-40 sm:grid-cols-2 sm:gap-7">
          {[
            { value: "3", caption: "Requests a second, Gatepass's first year" },
            { value: "10k", caption: "Requests a second when a big show goes on sale" },
          ].map((s, i) => (
            <figure key={s.value} className={cn("rise", i === 1 && "rise-2")}>
              <div
                className={cn(
                  "h-[46vw] overflow-hidden sm:h-[clamp(120px,21vw,330px)]",
                  i === 1 && "max-sm:bg-fg max-sm:px-3 max-sm:text-bg",
                )}
              >
                <span aria-hidden className="display specimen block">
                  {s.value}
                </span>
                <span className="sr-only">{s.value}</span>
              </div>
              <figcaption className="mt-3 text-[17px] text-muted">{s.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* The live thing */}
      <section aria-labelledby="live-title" className={cn(frame, gap)}>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-x-7">
          <div className="lg:col-span-4">
            <h2 id="live-title" className={cn(head, "rise")}>
              Break it yourself
            </h2>
            <p className={cn(body, "rise rise-2 mt-6 max-w-[40ch]")}>
              This is Gatepass on sale day, the same kind of diagram every lesson is built on. Requests travel, caches
              hit and miss, servers fail. Lessons let you turn the knobs; drills let you draw the whole system and
              load-test it.
            </p>
            <figure className="rise rise-3 mt-12 max-w-md">
              <video
                autoPlay
                muted
                loop
                playsInline
                poster={selectorClip.poster}
                width={selectorClip.width}
                height={selectorClip.height}
                className="aspect-[4/3] w-full object-cover motion-reduce:hidden"
                aria-label="Rows of rotary selector switches turning inside a 1947 telephone exchange."
              >
                <source src={selectorClip.webm} type="video/webm" />
                <source src={selectorClip.mp4} type="video/mp4" />
              </video>
              {/* eslint-disable-next-line @next/next/no-img-element -- the clip's still frame for reduced motion */}
              <img
                src={selectorClip.poster}
                width={selectorClip.width}
                height={selectorClip.height}
                alt="Rotary selector switches inside a 1947 telephone exchange."
                className="hidden aspect-[4/3] w-full object-cover motion-reduce:block"
              />
              <figcaption className="mt-3 text-[14px] leading-snug text-muted">{selectorClip.caption}</figcaption>
            </figure>
          </div>
          <div className="rise rise-3 lg:col-span-8">
            <LiveSystem />
          </div>
        </div>
      </section>

      <Figure
        photo={photos.exchangeHall}
        sizes="100vw"
        className="[&>div]:h-[min(78svh,820px)] [&_figcaption]:px-5 sm:[&_figcaption]:px-7"
      />

      {/* The course as an itinerary */}
      <section aria-labelledby="course-title" className={cn(frame, gap, "mt-[clamp(96px,11vw,200px)] bg-surface-2")}>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-x-7">
          <div className="lg:col-span-5">
            <h2 id="course-title" className={cn(head, "rise")}>
              One server to many cities
            </h2>
            <p className={cn(body, "rise rise-2 mt-6 max-w-[34ch]")}>
              Follow Gatepass from one college fest to sell-outs across the country. Every module opens with a problem it
              actually hits, and ends with you fixing it.
            </p>
            <Figure photo={photos.operator} sizes="(min-width: 1024px) 34vw, 100vw" className="rise rise-3 mt-12 max-w-md [&>div]:aspect-[4/5]" />
          </div>
          <div className="rise lg:col-span-5 lg:col-start-7">
            <div className="slip max-w-[480px] bg-fg px-6 pt-7 pb-12 text-bg sm:px-8">
              <p className="text-[14px]">Itinerary for one learner</p>
              {itinerary.map((part) => (
                <div key={part.n} className="mt-7">
                  <h3 className="text-[17px] font-semibold">
                    Part {part.n}: {part.title}
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-[16px] tabular-nums">
                    {part.rows.map((r) => (
                      <li key={r.label} className="flex flex-wrap">
                        <span>{r.label}</span>
                        <span aria-hidden className="leader" />
                        <span className="ml-auto">{r.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="-mx-6 mt-8 flex h-11 items-center justify-between bg-bg px-6 text-[16px] font-medium text-fg tabular-nums sm:-mx-8 sm:px-8">
                <span>You can design it and defend it</span>
                <span>{hours} h</span>
              </p>
            </div>
            <TrackedLink
              href="/learn"
              location="home_course"
              plain
              className="mt-8 inline-block text-[17px] text-fg underline decoration-1 underline-offset-4 hover:text-accent"
            >
              See all {courseStats.lessons} lessons
            </TrackedLink>
          </div>
        </div>
      </section>

      {/* The drills as a line-up poster */}
      <section aria-labelledby="drills-title" className={cn(frame, gap)}>
        <h2 id="drills-title" className={cn(head, "rise")}>
          {drillCatalog.length} drills on the bill
        </h2>
        <p className={cn(body, "rise rise-2 mt-6 max-w-[52ch]")}>
          Each drill is a real product: you write its API, model its data, wire the architecture and survive the load
          test. Here are six of them.
        </p>
        <ul className="mt-14">
          {lineUp.map((d) => (
            <li key={d.slug} className="rise">
              <TrackedLink
                href={`/drills/${d.slug}`}
                location="home_lineup"
                plain
                className="group flex flex-col py-1 outline-none sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
              >
                <span className="display text-[12vw] text-fg transition-colors group-hover:text-accent group-focus-visible:text-accent sm:text-[clamp(64px,8.5vw,150px)] sm:leading-[0.92]">
                  {d.product}
                </span>
                <span className="mt-1.5 mb-5 shrink-0 text-[17px] text-muted tabular-nums sm:my-0">
                  {d.minutes} min, {d.difficulty}
                </span>
              </TrackedLink>
            </li>
          ))}
        </ul>
        <TrackedLink
          href="/drills"
          location="home_drills"
          plain
          className="mt-12 inline-block text-[17px] text-fg underline decoration-1 underline-offset-4 hover:text-accent"
        >
          See all {drillCatalog.length} drills
        </TrackedLink>
      </section>

      {/* Why it's free */}
      <section aria-labelledby="free-title" className={cn(frame, "pb-[clamp(96px,11vw,200px)]")}>
        <div className="grid gap-10 lg:grid-cols-[34%_1fr] lg:gap-x-0">
          <div className="lg:pr-10">
            <h2 id="free-title" className={cn(head, "rise")}>
              Free, for good
            </h2>
            <dl className="rise rise-2 mt-8 grid grid-cols-3 gap-5 text-[14px] lg:grid-cols-1">
              {[
                ["Price", "Nothing, all of it"],
                ["Account", "Optional"],
                ["Ads and upsells", "None"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="mt-0.5 text-[17px] text-fg">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="space-y-6">
            <p className={cn(lead, "rise max-w-[52ch]")}>
              The engineers who most need this material are often the ones least able to pay for it: students, people
              switching careers, developers in places where a course subscription costs a week&apos;s pay.
            </p>
            <p className={cn(lead, "rise rise-2 max-w-[52ch]")}>
              So Wirebox is free. Not for a week, not for the first module. All of it, for anyone with a browser. Your
              progress saves where you are; sign in only to carry it between devices.
            </p>
          </div>
        </div>
        <div className="mt-[clamp(64px,8vw,120px)] grid gap-7 sm:grid-cols-[3fr_2fr] lg:ml-[34%]">
          <Figure photo={photos.wacOperators} sizes="(min-width: 1024px) 40vw, 100vw" className="rise [&>div]:aspect-[4/3]" />
          <Figure photo={photos.fieldSwitchboard} sizes="(min-width: 1024px) 26vw, 100vw" className="rise rise-2 [&>div]:aspect-[4/5]" />
        </div>
      </section>

      {/* Questions */}
      <section aria-labelledby="faq-title" className={cn(frame, "pb-[clamp(160px,13vw,220px)]")}>
        <h2 id="faq-title" className="display rise text-[clamp(2.75rem,5.5vw,6rem)] text-balance text-fg">
          Questions people ask
        </h2>
        <div className="mt-20 lg:ml-[33.333%]">
          <Faq />
        </div>
      </section>

      {/* One word is the button */}
      <TrackedLink
        href="/learn"
        location="home_final"
        plain
        className="group relative flex min-h-[46svh] flex-col justify-between gap-[clamp(120px,14vw,220px)] bg-accent px-5 pt-5 pb-6 text-accent-fg outline-none hover:bg-fg hover:text-bg focus-visible:bg-fg focus-visible:text-bg sm:min-h-[60svh] sm:px-7 sm:pt-7"
      >
        <span className="flex items-start justify-between gap-6">
          <span className={cn(lead, "max-w-[30ch] text-current")}>
            The first lesson takes {allLessons[0].minutes} minutes. No sign-up, no card.
          </span>
          <svg viewBox="0 0 48 48" className="size-8 shrink-0 sm:size-12" aria-hidden>
            <path d="M12 36 36 12M16 12h20v20" fill="none" stroke="currentColor" strokeWidth="3" />
          </svg>
        </span>
        <span className="display -mb-[0.08em] block text-[52vw] leading-[0.8] tracking-[-0.02em]">Start</span>
      </TrackedLink>
    </>
  );
}
