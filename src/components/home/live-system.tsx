"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { CYCLE, HeroDiagram } from "./hero-diagram";

// Where the diagram's loop shows API 2 failing (see DOWN in hero-diagram).
const FAIL_AT = CYCLE * 0.405;
const DOWN_FOR = CYCLE * 0.29 * 1000;

/**
 * The landing page's one live thing: Gatepass running on sale day, with a
 * button that kills API 2 so the visitor sees the balancer route around it.
 * With reduced motion the diagram is a still, and the button shows the
 * failed frame instead of playing it.
 */
export function LiveSystem() {
  const ref = useRef<HTMLDivElement>(null);
  const [down, setDown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function pullThePlug() {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.querySelectorAll("svg").forEach((svg) => {
      if (svg.ownerSVGElement) return;
      svg.setCurrentTime(still ? FAIL_AT + 0.6 : FAIL_AT);
      if (still) svg.pauseAnimations();
    });
    track("cta_clicked", { location: "home_live_system", target: "fail_api_2" });
    setDown(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDown(false), DOWN_FOR);
  }

  return (
    <div>
      <div ref={ref} data-ui className="rounded-xl bg-surface p-2 sm:p-4">
        <HeroDiagram />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={pullThePlug}
          className="press h-11 rounded-lg bg-err/15 px-4 text-[15px] font-medium text-err outline-none hover:bg-err/25 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Pull the plug on API 2
        </button>
        <p aria-live="polite" className="max-w-[46ch] text-[15px] text-muted">
          {down
            ? "API 2 failed its health check. The load balancer stops sending it requests, and fans keep buying tickets."
            : "Three servers share the load. Fail one and watch where its requests go."}
        </p>
      </div>
    </div>
  );
}
