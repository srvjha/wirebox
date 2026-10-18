import Link from "next/link";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const nav = [
  { href: "/learn", label: "Learn" },
  { href: "/labs", label: "Labs" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-6 sm:px-6">
        <Logo />
        <nav className="flex items-center sm:gap-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-2.5 py-1.5 text-[13.5px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <span className="hidden rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 font-mono text-[10.5px] tracking-wide text-ok uppercase sm:inline">
            Free forever
          </span>
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
