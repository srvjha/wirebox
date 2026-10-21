"use client";

import { useSyncExternalStore } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";

export type User = { id: string; email: string; name: string };
type AuthError = { message: string; status?: number } | null;

/** `data` is undefined while loading, null when signed out. */
type SessionState = { data: { user: User } | null | undefined; isPending: boolean };

const PENDING: SessionState = { data: undefined, isPending: true };
let state: SessionState = PENDING;
const listeners = new Set<() => void>();
let started = false;

function toUser(u: SupabaseUser): User {
  const meta = u.user_metadata ?? {};
  const name = typeof meta.name === "string" && meta.name ? meta.name : meta.full_name;
  return { id: u.id, email: u.email ?? "", name: typeof name === "string" && name ? name : (u.email ?? "").split("@")[0] };
}

function start() {
  if (started) return;
  started = true;
  // Fires INITIAL_SESSION straight away, then on every sign-in, sign-out and refresh.
  supabaseBrowser().auth.onAuthStateChange((_event, session) => {
    const next = session?.user ? { user: toUser(session.user) } : null;
    if (state.data?.user.id === next?.user.id && state.data?.user.name === next?.user.name && !state.isPending) return;
    state = { data: next, isPending: false };
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in user, shared by every component on the page. */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state, () => PENDING);
}

const err = (e: { message: string; status?: number } | null): AuthError =>
  e ? { message: e.message, status: e.status } : null;

const callbackUrl = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

export const signIn = {
  async email({ email, password }: { email: string; password: string }) {
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    return { error: err(error) };
  },
  async social({ provider, callbackURL }: { provider: "google"; callbackURL: string }) {
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl(callbackURL) },
    });
    return { error: err(error) };
  },
};

export const signUp = {
  /** `confirm` is true when the project requires email confirmation before the first sign-in. */
  async email({ name, email, password, next }: { name: string; email: string; password: string; next: string }) {
    const { data, error } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: callbackUrl(next) },
    });
    return { error: err(error), confirm: !error && !data.session };
  },
};

export async function signOut() {
  await supabaseBrowser().auth.signOut();
}
