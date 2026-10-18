"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * SVG <animate> ignores CSS `prefers-reduced-motion`, so this pauses every
 * SMIL animation inside it (frozen on a frame where packets are visible).
 */
export function MotionGate({
  children,
  className,
  freezeAt = 1.4,
}: {
  children: ReactNode;
  className?: string;
  freezeAt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      el.querySelectorAll("svg").forEach((svg) => {
        if (mq.matches) {
          svg.setCurrentTime(freezeAt);
          svg.pauseAnimations();
        } else {
          svg.unpauseAnimations();
        }
      });
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [freezeAt]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
