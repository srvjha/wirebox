import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { courseStats } from "@/content/course";

const hours = Math.round(courseStats.minutes / 60);

const faqs: { q: string; a: ReactNode }[] = [
  {
    q: "Is it really free?",
    a: (
      <>
        Yes. Every lesson, every drill and every load test. There is no trial, no premium tier and nothing to unlock
        later. We will never ask for a card.
      </>
    ),
  },
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
    <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {faqs.map((f) => (
        <details key={f.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-4 py-4 text-[15px] font-medium text-fg outline-none focus-visible:text-accent">
            <span className="flex-1">{f.q}</span>
            <ChevronDown
              className="size-4 shrink-0 text-subtle transition-transform duration-200 group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="pb-5 text-[14.5px] leading-relaxed text-muted">{f.a}</div>
        </details>
      ))}
    </div>
  );
}
