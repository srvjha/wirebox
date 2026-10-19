import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { courseStats } from "@/content/course";

const hours = Math.round(courseStats.minutes / 60);

const faqs: { q: string; a: ReactNode }[] = [
  {
    q: "Do I need an account?",
    a: (
      <>
        No. Your progress saves in this browser as you go. Sign in only if you want it synced across devices. Accounts
        also help us count how many people are learning, which keeps the project going.
      </>
    ),
  },
  {
    q: "What do I need to know before starting?",
    a: (
      <>
        You should be able to read a little code and know roughly what an HTTP request is. We start from a single server
        and one database, and build every idea on top of the last one. No prior distributed systems experience needed.
      </>
    ),
  },
  {
    q: "How do the drills work?",
    a: (
      <>
        Each drill gives you a product brief, say a chat app. You write its API, model its data and wire up an
        architecture on a canvas. Then a simulator load-tests your design, step by step, from a handful of users to tens
        of thousands of requests a second. When something breaks, you get a debrief explaining why, and you fix it.
      </>
    ),
  },
  {
    q: "Will this help with system design interviews?",
    a: (
      <>
        It should. The drills follow the same loop interviewers look for: requirements, estimates, a high-level design,
        then deep dives into the parts that hurt. We just teach it for real systems first, so the interview is the easy
        part.
      </>
    ),
  },
  {
    q: "How long does the course take?",
    a: (
      <>
        About {hours} hours across {courseStats.lessons} lessons in {courseStats.modules} modules, plus the drills. Most
        lessons take ten minutes or so. Go at whatever pace suits you; your place is saved.
      </>
    ),
  },
  {
    q: "What is Gatepass?",
    a: (
      <>
        The story that runs through the course: a ticketing app for gigs, comedy nights and college fests. It starts on
        one server for one fest and grows city by city. Every module begins with a problem Gatepass actually hits.{" "}
        <Link href="/learn" className="text-accent underline underline-offset-3">
          Start with module 1
        </Link>
        .
      </>
    ),
  },
];

export function Faq() {
  return (
    <div className="space-y-4">
      {faqs.map((f) => (
        <details
          key={f.q}
          className="group -mx-5 px-5 py-3 open:bg-surface-2 open:pb-6 sm:-mx-6 sm:px-6 [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center gap-6 py-2 text-[clamp(1.25rem,1.1rem+0.7vw,1.625rem)] text-fg outline-none hover:text-accent focus-visible:text-accent">
            <span className="flex-1">{f.q}</span>
            <ChevronDown
              className="size-6 shrink-0 stroke-[1.5] text-fg transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden
            />
          </summary>
          <div className="mt-3 max-w-[48ch] text-[17px] leading-[1.55] text-fg">{f.a}</div>
        </details>
      ))}
    </div>
  );
}
