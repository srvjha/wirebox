import Link from "next/link";
import { AUTH_ENABLED } from "@/lib/features";
import { LogoMark } from "./logo";

const links = [
  { href: "/learn", label: "Course" },
  { href: "/drills", label: "Drills" },
  { href: "/me", label: "Your progress" },
  ...(AUTH_ENABLED ? [{ href: "/sign-in", label: "Sign in" }] : []),
];

export function SiteFooter() {
  return (
    <footer className="bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-2 text-fg">
          <LogoMark className="size-5" />
          <span className="text-[15px]">Wirebox, free system design for everyone</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-muted sm:ml-auto">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-fg">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-[14px] text-muted sm:px-6">
        Drills are modeled on well-known products for teaching. Wirebox isn&apos;t affiliated with any of them.
      </p>
    </footer>
  );
}
