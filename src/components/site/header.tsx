import Link from "next/link";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const nav = [
  { href: "/learn", label: "Learn" },
  { href: "/drills", label: "Drills" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-bg">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-8 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-3">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="px-2 py-1.5 text-[17px] text-fg underline-offset-4 transition-colors hover:text-accent hover:underline"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
