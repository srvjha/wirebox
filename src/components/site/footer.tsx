import Link from "next/link";
import { LogoMark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-2 text-muted">
          <LogoMark className="size-5" />
          <span className="text-[13px]">Wirebox · free system design for everyone</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-subtle sm:ml-auto">
          <Link href="/learn" className="hover:text-fg">Learn</Link>
          <Link href="/drills" className="hover:text-fg">Drills</Link>
          <Link href="/me" className="hover:text-fg">Your progress</Link>
          <Link href="/sign-in" className="hover:text-fg">Sign in</Link>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-[12px] text-subtle sm:px-6">
        Drills are modeled on well-known products for teaching. Wirebox isn&apos;t affiliated with any of them.
      </p>
    </footer>
  );
}
