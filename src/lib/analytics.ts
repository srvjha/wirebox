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

  lab_viewed: { lab: string };
  lab_reset: { lab: string };
  lab_step_viewed: { lab: string; step: number; type: string };
  lab_step_completed: { lab: string; step: number; type: string };
  lab_completed: { lab: string; seconds: number };
  lab_api_checked: { lab: string; step: number; ok: boolean; problems: number };
  lab_schema_checked: { lab: string; step: number; ok: boolean; problems: number };
  lab_component_added: { lab: string; kind: string };
  lab_component_removed: { lab: string; kind: string };
  lab_wire_added: { lab: string; from: string; to: string; ok: boolean };
  lab_knob_changed: { lab: string; knob: string; value: string | number | boolean };
  lab_hint_opened: { lab: string; step: number; hint: number };
  lab_choice_made: { lab: string; step: number; option: string };
  load_test_run: {
    lab: string;
    step: number;
    pass: boolean;
    success_rate: number;
    p99_ms: number;
    cost_usd: number;
    nodes: number;
  };
  postmortem_requested: { lab: string; step: number };

  sign_in_started: { method: "google" | "github" | "email" };
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
