"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { HeroDiagram, type Phase } from "./hero-diagram";

const DOWN_MS = 4000;
const RECOVERING_MS = 2000;

const message: Record<Phase, string> = {
  healthy: "Three servers share the load. Fail one and watch where its requests go.",
  down: "API 2 failed its health check. The load balancer stops sending it requests, and fans keep buying tickets.",
  recovering: "API 2 passed three health checks in a row, so the balancer puts it back in rotation.",
};

/**
 * The landing page's one live thing: Gatepass running on sale day, with a
 * button that kills API 2. One failure plays at a time: down, recovering,
 * then healthy again before the button works a second time.
 */
export function LiveSystem() {
  const [phase, setPhase] = useState<Phase>("healthy");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function pullThePlug() {
    if (phase !== "healthy") return;
    track("cta_clicked", { location: "home_live_system", target: "fail_api_2" });
    setPhase("down");
    timers.current = [
      setTimeout(() => setPhase("recovering"), DOWN_MS),
      setTimeout(() => setPhase("healthy"), DOWN_MS + RECOVERING_MS),
    ];
  }

  return (
    <div>
      <div data-ui className="rounded-xl bg-surface p-2 sm:p-4">
        <HeroDiagram phase={phase} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={pullThePlug}
          disabled={phase !== "healthy"}
          className="press h-11 rounded-lg bg-err/15 px-4 text-[15px] font-medium text-err outline-none hover:bg-err/25 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted"
        >
          {phase === "healthy" ? "Pull the plug on API 2" : phase === "down" ? "API 2 is down" : "Recovering…"}
        </button>
        <p aria-live="polite" className="max-w-[46ch] text-[15px] text-muted">
          {message[phase]}
        </p>
      </div>
    </div>
  );
}
