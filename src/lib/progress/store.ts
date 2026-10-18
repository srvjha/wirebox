"use client";

/**
 * Lesson progress kept in the browser, so the course works without an
 * account. The value is a JSON array of completed lesson slugs.
 *
 * Exposed as an external store for `useSyncExternalStore`: one snapshot
 * object per change, shared by every subscriber, and kept in step across
 * tabs through the `storage` event.
 */

export const LESSONS_STORAGE_KEY = "wirebox:lessons:v1";
/** The user whose server progress this browser has already merged with. */
export const MERGED_USER_KEY = "wirebox:lessons:merged-user:v1";
/** The last lesson opened, for "continue where you left off". */
export const LAST_LESSON_KEY = "wirebox:last-lesson:v1";

const EMPTY: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> | null = null;

function parse(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function load(): ReadonlySet<string> {
  try {
    return parse(window.localStorage.getItem(LESSONS_STORAGE_KEY));
  } catch {
    return new Set();
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getCompleted(): ReadonlySet<string> {
  snapshot ??= load();
  return snapshot;
}

export function getServerCompleted(): ReadonlySet<string> {
  return EMPTY;
}

export function setCompleted(next: Iterable<string>) {
  const set = new Set(next);
  const prev = getCompleted();
  if (set.size === prev.size && [...set].every((s) => prev.has(s))) return;
  snapshot = set;
  try {
    window.localStorage.setItem(LESSONS_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Private mode or full storage: progress still works for this page view.
  }
  emit();
}

export function markLocal(slug: string, done: boolean) {
  const next = new Set(getCompleted());
  if (done) next.add(slug);
  else next.delete(slug);
  setCompleted(next);
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== LESSONS_STORAGE_KEY) return;
    snapshot = parse(e.newValue);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeKey(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {}
}
