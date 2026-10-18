"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClass } from "@/components/ui/button";
import { track } from "@/lib/analytics";

type Props = ComponentProps<typeof Link> & {
  /** Where on the site the link lives, e.g. "home_hero". */
  location: string;
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  /** Keep the given className as-is instead of styling it as a button. */
  plain?: boolean;
};

/** A link that records `cta_clicked` before navigating. */
export function TrackedLink({ location, variant, size, plain, className, onClick, href, ...props }: Props) {
  return (
    <Link
      href={href}
      className={plain ? className : buttonClass(variant, size, className)}
      onClick={(e) => {
        track("cta_clicked", {
          location,
          target: typeof href === "string" ? href : (href.pathname ?? ""),
        });
        onClick?.(e);
      }}
      {...props}
    />
  );
}
