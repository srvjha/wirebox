import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      <rect x="2.5" y="2.5" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="13.5" width="8" height="8" rx="2" fill="var(--accent)" />
      <path d="M10.5 6.5h3.5a3 3 0 0 1 3 3v4" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-fg", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">Wirebox</span>
    </Link>
  );
}
