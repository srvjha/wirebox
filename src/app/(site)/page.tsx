import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, CreditCard, HeartHandshake, UserRoundX } from "lucide-react";
import { CourseMap } from "@/components/home/course-map";
import { Faq } from "@/components/home/faq";
import { HeroDiagram } from "@/components/home/hero-diagram";
import { HowItWorks } from "@/components/home/how-it-works";
import { Eyebrow, Section } from "@/components/home/section";
import { LabCard } from "@/components/site/lab-card";
import { TrackedLink } from "@/components/site/tracked-link";
import { allLessons, courseStats } from "@/content/course";
import { labCatalog } from "@/content/labs/catalog";
import { SITE } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} · Learn system design by building it` },
  description: SITE.description,
};

const liveLabs = labCatalog.filter((l) => l.status === "live");
const previewLabs = [...liveLabs, ...labCatalog.filter((l) => l.status === "soon")].slice(0, 6);
const firstLab = liveLabs[0]?.slug ?? "url-shortener";

const stats = [
  {
    value: courseStats.modules,
    label: "modules",
    note: `in ${courseStats.parts} parts`,
  },
  {
    value: courseStats.lessons,
    label: "lessons",
    note: "short, visual, hands-on",
  },
  {
    value: labCatalog.length,
    label: "product labs",
    note: `${liveLabs.length} live, more shipping`,
  },
  {
    value: `${Math.round(courseStats.minutes / 60)}h`,
    label: "of material",
    note: "at your own pace",
  },
];

const principles = [
  {
    icon: CreditCard,
    title: "No paywall, no trial",
    body: "Every lesson and lab is open. Nothing gets locked behind a plan later.",
  },
  {
    icon: UserRoundX,
    title: "No account needed",
    body: "Progress lives in your browser. Sign in only if you want it on every device.",
  },
  {
    icon: BadgeCheck,
    title: "No upsell",
    body: "No ads, no premium tier, no “unlock the full solution”. The full solution is the course.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden
          className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[44rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-24 sm:pb-20">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 font-mono text-[11px] tracking-wide text-muted uppercase">
              <span className="size-1.5 rounded-full bg-ok" />
              Free forever · no paywall · no trial
            </p>
            <h1 className="mt-6 text-[40px] leading-[1.04] font-semibold tracking-[-0.035em] text-balance text-fg sm:text-[64px]">
              Learn system design <span className="text-accent">by building it.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[16.5px] leading-relaxed text-pretty text-muted sm:text-[18px]">
              Watch requests flow through living diagrams, turn the knobs yourself, then design real products and
              load-test them until they break. Every lesson and every lab is free, for everyone, for good.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <TrackedLink href="/learn" location="home_hero" size="lg">
                Start learning <ArrowRight className="size-4" aria-hidden />
              </TrackedLink>
              <TrackedLink href={`/labs/${firstLab}`} location="home_hero" variant="secondary" size="lg">
                Try the URL shortener lab
              </TrackedLink>
            </div>
            <p className="mt-4 text-[13px] text-subtle">No sign-up needed. Your progress saves in this browser.</p>
          </div>

          <div className="mt-12 sm:mt-16">
            <div className="rounded-[22px] border border-line bg-sunken/70 p-1.5 shadow-card sm:p-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 font-mono text-[11px] text-subtle">
                <span className="inline-flex items-center gap-2 text-muted">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:hidden" />
                    <span className="relative inline-flex size-2 rounded-full bg-ok" />
                  </span>
                  gatepass / prod
                </span>
                <span className="ml-auto inline-flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-req" /> request
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-res" /> response
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-err" /> failure
                  </span>
                </span>
              </div>
              <HeroDiagram />
            </div>
            <p className="mt-3 text-center text-[13px] text-subtle">
              Gatepass on sale day. Watch API 2 fail its health check and the load balancer route around it.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section aria-label="Course at a glance" className="border-b border-line bg-sunken/50">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-4">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`px-4 py-7 sm:px-6 ${i % 2 === 1 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}
            >
              <dt className="sr-only">{s.label}</dt>
              <dd>
                <span className="block text-[32px] font-semibold tracking-tight text-fg tabular-nums sm:text-[40px]">
                  {s.value}
                </span>
                <span className="mt-0.5 block text-[14px] text-muted">{s.label}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-subtle">{s.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <Section
        id="how-it-works"
        eyebrow="How it works"
        title="See it, try it, build it, break it."
        intro="Reading about consistent hashing is easy to forget. Watching a node vanish and half your cache go cold is not. Every module moves through the same four steps."
      >
        <HowItWorks />
      </Section>

      <Section
        id="labs"
        className="border-t border-line"
        eyebrow="Product labs"
        title="Design the products you use every day."
        intro="Each lab is a product brief, a blank canvas and a simulator. Design the API, the schema and the architecture, then watch it hold up, or not, as the traffic climbs."
        action={
          <TrackedLink href="/labs" location="home_labs" variant="outline" size="sm">
            All {labCatalog.length} labs <ArrowRight className="size-3.5" aria-hidden />
          </TrackedLink>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {previewLabs.map((lab) => (
            <LabCard key={lab.slug} lab={lab} location="home_labs" />
          ))}
        </div>
      </Section>

      <Section
        id="course"
        className="border-t border-line"
        eyebrow="The course"
        title="From one server to many cities."
        intro="Follow Gatepass, a ticketing app for gigs and college fests, from its first two hundred users to sell-outs across the country. Each module starts with a problem it actually hits."
        action={
          <TrackedLink href="/learn" location="home_course" variant="outline" size="sm">
            See every lesson <ArrowRight className="size-3.5" aria-hidden />
          </TrackedLink>
        }
      >
        <CourseMap />
      </Section>

      {/* Why free */}
      <section aria-labelledby="why-free-title" className="border-y border-line bg-sunken/50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <Eyebrow>Why it&apos;s free</Eyebrow>
            <h2
              id="why-free-title"
              className="mt-3 text-[28px] leading-[1.15] font-semibold tracking-tight text-balance text-fg sm:text-[36px]"
            >
              Good system design education shouldn&apos;t depend on your salary.
            </h2>
            <div className="mt-5 space-y-4 text-[15.5px] leading-relaxed text-pretty text-muted">
              <p>
                The engineers who most need this material are often the ones least able to pay for it: students, people
                switching careers, developers in places where a course subscription costs a week&apos;s pay.
              </p>
              <p>
                So Wirebox is free. Not free for a week, not free for the first module. All of it, for anyone with a
                browser. If it helps you land the job or ship the system, that&apos;s the whole point.
              </p>
            </div>
            <p className="mt-6 inline-flex items-center gap-2 text-[13.5px] text-subtle">
              <HeartHandshake className="size-4 text-accent" aria-hidden /> Tell a friend who&apos;s prepping.
              That&apos;s the only payment we want.
            </p>
          </div>
          <ul className="grid content-start gap-3">
            {principles.map((p) => (
              <li key={p.title} className="flex gap-4 rounded-2xl border border-line bg-surface p-5">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-accent">
                  <p.icon className="size-[18px]" aria-hidden />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-fg">{p.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Section id="faq" eyebrow="FAQ" title="Questions, answered." innerClassName="max-w-3xl">
        <Faq />
      </Section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-14 text-center shadow-card sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="bg-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_70%_at_50%_100%,black,transparent)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-[30px] leading-[1.1] font-semibold tracking-tight text-balance text-fg sm:text-[44px]">
              Start with one server. Finish with a system that survives sale day.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15.5px] text-muted">
              The first lesson takes {allLessons[0].minutes} minutes. No sign-up, no card, no catch.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <TrackedLink href="/learn" location="home_final" size="lg">
                Start learning <ArrowRight className="size-4" aria-hidden />
              </TrackedLink>
              <TrackedLink href={`/labs/${firstLab}`} location="home_final" variant="secondary" size="lg">
                Jump into a lab
              </TrackedLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
