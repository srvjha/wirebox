"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, User } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth-client";
import { track } from "@/lib/analytics";
import { isGuestEmail } from "@/lib/guest";

export function UserMenu() {
  const { data, isPending } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (isPending) return <div className="h-8 w-16 animate-pulse rounded-lg bg-surface-2" />;
  if (!data) {
    return (
      <Link href="/sign-in" className={buttonClass("secondary", "sm")}>
        Sign in
      </Link>
    );
  }
  const initial = (data.user.name || data.user.email).charAt(0).toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-full border border-line bg-surface-2 text-[13px] font-semibold text-fg"
        aria-label="Account menu"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-card">
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] font-medium text-fg">{data.user.name}</p>
            <p className="truncate text-[12px] text-subtle">
              {isGuestEmail(data.user.email) ? "Guest session · progress saved here" : data.user.email}
            </p>
          </div>
          <Link
            href="/me"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
          >
            <User className="size-4" /> Your progress
          </Link>
          <button
            type="button"
            onClick={async () => {
              track("signed_out", {});
              await signOut();
              setOpen(false);
              router.refresh();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
