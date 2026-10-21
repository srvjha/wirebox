"use client";

import posthog from "posthog-js";

/**
 * Every product event Wirebox sends to PostHog. Autocapture covers clicks and
 * pageviews; these named events describe learning progress.
 */
export type AnalyticsEvents = {
  cta_clicked: { location: string; target: string };
  course_search_used: { query_length: number; results: number };

  lesson_viewed: { lesson: string; module: string; kind: string };
  lesson_completed: { lesson: string; module: string };
  exercise_submitted: { lesson: string; exercise: string; correct: number; total: number };
  your_turn_submitted: { lesson: string; prompt: string; answers: number };
  quiz_answered: { lesson: string; quiz: string; correct: boolean };
  visual_interacted: { visual: string };

  drill_viewed: { drill: string };
  drill_reset: { drill: string };
  drill_step_viewed: { drill: string; step: number; type: string };
  drill_step_completed: { drill: string; step: number; type: string };
  drill_completed: { drill: string; seconds: number };
  drill_step_checked: { drill: string; step: number; type: "api" | "schema"; ok: boolean; problems: number };
  drill_wire_invalid: { drill: string; from: string; to: string };
  drill_hint_opened: { drill: string; step: number; hint: number };
  drill_choice_made: { drill: string; step: number; option: string };
  load_test_run: {
    drill: string;
    step: number;
    pass: boolean;
    success_rate: number;
    p99_ms: number;
    cost_usd: number;
    nodes: number;
  };
  postmortem_requested: { drill: string; step: number };

  sign_in_started: { method: "google" | "github" | "email"; mode: "sign-in" | "sign-up" };
};

export type AnalyticsEvent = keyof AnalyticsEvents;

export function track<E extends AnalyticsEvent>(event: E, props: AnalyticsEvents[E]) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture(event, props);
}

const seenVisuals = new Set<string>();

/** Records the first interaction with a visual on each page; later ones are dropped. */
export function trackVisual(visual: string) {
  if (typeof window === "undefined") return;
  const key = `${window.location.pathname}:${visual}`;
  if (seenVisuals.has(key)) return;
  seenVisuals.add(key);
  track("visual_interacted", { visual });
}

export function identify(user: { id: string; email: string; name?: string | null }) {
  if (!posthog.__loaded) return;
  posthog.identify(user.id, { email: user.email, name: user.name ?? undefined });
}

export function resetIdentity() {
  if (!posthog.__loaded) return;
  posthog.reset();
}
