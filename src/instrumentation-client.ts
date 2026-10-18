import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key) {
  posthog.init(key, {
    // Proxied through next.config rewrites so ad blockers don't drop events.
    api_host: "/ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST ?? "https://us.posthog.com",
    defaults: "2026-08-30",
    person_profiles: "identified_only",
    autocapture: true,
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_exceptions: true,
    enable_heatmaps: true,
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: { password: true, email: true },
    },
    debug: process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "1",
  });
}
