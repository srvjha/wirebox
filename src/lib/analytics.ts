"use client";

import posthog from "posthog-js";

/**
 * Every product event Wirebox sends to PostHog. Autocapture covers clicks and
 * pageviews; these named events describe learning progress.
 */
export type AnalyticsEvents = {
  theme_changed: { theme: "dark" | "light" };
  cta_clicked: { location: string; target: string };
  course_search_used: { query_length: number; results: number };
  sidebar_toggled: { open: boolean };

  lesson_viewed: { lesson: string; module: string; kind: string };
  lesson_completed: { lesson: string; module: string };
  lesson_uncompleted: { lesson: string; module: string };
  lesson_chapter_clicked: { lesson: string; chapter: string };
  exercise_submitted: { lesson: string; exercise: string; correct: number; total: number };
  your_turn_submitted: { lesson: string; prompt: string; answers: number };
  reveal_opened: { lesson: string; id: string };
  quiz_answered: { lesson: string; quiz: string; correct: boolean };
  visual_interacted: { visual: string; control: string; value: string | number | boolean };

  drill_viewed: { drill: string };
  drill_reset: { drill: string };
  drill_step_viewed: { drill: string; step: number; type: string };
  drill_step_completed: { drill: string; step: number; type: string };
  drill_completed: { drill: string; seconds: number };
  drill_api_checked: { drill: string; step: number; ok: boolean; problems: number };
  drill_schema_checked: { drill: string; step: number; ok: boolean; problems: number };
  drill_component_added: { drill: string; kind: string };
  drill_component_removed: { drill: string; kind: string };
  drill_wire_added: { drill: string; from: string; to: string; ok: boolean };
  drill_knob_changed: { drill: string; knob: string; value: string | number | boolean };
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

  sign_in_started: { method: "google" | "github" | "email" | "guest" };
  sign_up_started: { method: "email" };
  signed_out: Record<string, never>;
  progress_synced: { items: number };
};

export type AnalyticsEvent = keyof AnalyticsEvents;

export function track<E extends AnalyticsEvent>(event: E, props: AnalyticsEvents[E]) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture(event, props);
}

export function identify(user: { id: string; email: string; name?: string | null }) {
  if (!posthog.__loaded) return;
  posthog.identify(user.id, { email: user.email, name: user.name ?? undefined });
}

export function resetIdentity() {
  if (!posthog.__loaded) return;
  posthog.reset();
}
