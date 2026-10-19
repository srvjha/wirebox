import Link from "next/link";
import { photos, selectorClip } from "@/content/photos";

const columns = [
  {
    title: "Learn",
    links: [
      { href: "/learn", label: "The course" },
      { href: "/learn/what-is-system-design", label: "First lesson" },
    ],
  },
  {
    title: "Drills",
    links: [
      { href: "/drills", label: "All drills" },
      { href: "/drills/pastebin", label: "Pastebin" },
      { href: "/drills/ticket-booking", label: "Ticket booking" },
    ],
  },
  {
    title: "You",
    links: [
      { href: "/me", label: "Your progress" },
      { href: "/sign-in", label: "Sign in" },
    ],
  },
];

/**
 * A designed close: link columns on top, the name across the full width at
 * the bottom. Sits under the page and is uncovered as the last section
 * scrolls away.
 */
export function SiteFooter() {
  return (
    <footer className="sticky bottom-0 z-0 grid min-h-[100svh] grid-rows-[auto_1fr_auto] bg-fg px-5 pt-10 pb-5 text-bg sm:px-7">
      <div className="grid grid-cols-2 gap-x-7 gap-y-8 sm:grid-cols-12">
        {columns.map((c) => (
          <nav key={c.title} aria-label={c.title} className="sm:col-span-2">
            <p className="text-[17px] font-medium">{c.title}</p>
            <ul className="mt-2 space-y-1.5 text-[17px]">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="opacity-70 underline-offset-4 hover:underline hover:opacity-100">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div className="col-span-2 sm:col-span-5 sm:col-start-8">
          <p className="text-[17px] font-medium">Photographs</p>
          <ul className="mt-2 space-y-1.5 text-[14px] leading-snug">
            {[...Object.values(photos), selectorClip].map((p) => (
              <li key={p.page} className="opacity-70">
                <a href={p.page} className="underline-offset-4 hover:underline">
                  {p.caption.split(".")[0]}
                </a>
                , {p.credit}. {p.licence}.
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div />
      <div>
        <svg viewBox="0 0 1000 214" className="footer-word block w-full" role="img" aria-label="Wirebox">
          <text
            x="0"
            y="200"
            textLength="1000"
            lengthAdjust="spacingAndGlyphs"
            className="display"
            fill="currentColor"
            style={{ fontSize: 268 }}
          >
            WIREBOX
          </text>
        </svg>
        <p className="mt-4 text-[14px] opacity-70">
          Free system design for everyone. Drills are modeled on well-known products for teaching; Wirebox isn&apos;t
          affiliated with any of them.
        </p>
      </div>
    </footer>
  );
}
