"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useSession } from "@/lib/auth-client";

/**
 * Read-only view of the learner's progress for the site pages (/drills, /me).
 * The writers live elsewhere: /learn owns `wirebox:lessons:v1` and
 * GET /api/progress; the drill player owns `wirebox:drill:<slug>:v<version>` and
 * GET /api/drills/progress. Local and server progress are merged, so it works
 * signed out and syncs once signed in.
 */

export const LESSONS_KEY = "wirebox:lessons:v1";
const DRILL_KEY = /^wirebox:drill:(.+):v(\d+)$/;

export type DrillProgress = {
  slug: string;
  stepsDone: number;
  totalSteps: number | null;
  completedAt: string | null;
  updatedAt: string | null;
};

type ServerDrill = { slug: string; stepsDone: number; totalSteps: number; completedAt: string | null; updatedAt: string };

// --- localStorage snapshot (stable between changes for useSyncExternalStore) ---

let cache: { raw: string; lessons: string[]; drills: DrillProgress[] } | null = null;
const EMPTY = { lessons: [] as string[], drills: [] as DrillProgress[] };

function safeParse(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function parseLessons(v: unknown): string[] {
  if (!v) return [];
  const inner = (v as { state?: unknown }).state ?? v;
  if (Array.isArray(inner)) return inner.filter((x): x is string => typeof x === "string");
  if (typeof inner === "object" && inner) {
    const o = inner as Record<string, unknown>;
    for (const k of ["lessons", "completed", "done"]) if (Array.isArray(o[k])) return parseLessons(o[k]);
    return Object.entries(o)
      .filter(([, val]) => !!val)
      .map(([k]) => k);
  }
  return [];
}

function count(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (Array.isArray(v)) return v.length;
  return null;
}

function parseDrill(slug: string, v: unknown): DrillProgress | null {
  if (!v || typeof v !== "object") return null;
  const o = ((v as { state?: unknown }).state ?? v) as Record<string, unknown>;
  const done =
    count(o.stepsDone) ?? count(o.completedSteps) ?? count(o.passed) ?? count(o.done) ?? count(o.completed) ?? 0;
  const total = count(o.totalSteps) ?? count(o.steps);
  const str = (x: unknown) => (typeof x === "string" ? x : typeof x === "number" ? new Date(x).toISOString() : null);
  return { slug, stepsDone: done, totalSteps: total, completedAt: str(o.completedAt), updatedAt: str(o.updatedAt) };
}

function readLocal() {
  if (typeof window === "undefined") return EMPTY;
  let raw = "";
  const entries: [string, string][] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k === LESSONS_KEY || DRILL_KEY.test(k))) entries.push([k, localStorage.getItem(k) ?? ""]);
    }
  } catch {
    return EMPTY;
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  raw = JSON.stringify(entries);
  if (cache && cache.raw === raw) return cache;

  let lessons: string[] = [];
  const drills = new Map<string, { v: number; p: DrillProgress }>();
  for (const [k, val] of entries) {
    if (k === LESSONS_KEY) {
      lessons = parseLessons(safeParse(val));
      continue;
    }
    const m = DRILL_KEY.exec(k);
    if (!m) continue;
    const p = parseDrill(m[1], safeParse(val));
    const v = Number(m[2]);
    if (p && (!drills.has(m[1]) || drills.get(m[1])!.v < v)) drills.set(m[1], { v, p });
  }
  cache = { raw, lessons, drills: [...drills.values()].map((x) => x.p) };
  return cache;
}

function subscribe(cb: () => void) {
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onStorage);
  };
}

export function useLocalProgress() {
  return useSyncExternalStore(subscribe, readLocal, () => EMPTY);
}

// --- server ---

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export function useServerProgress() {
  const { data: session, isPending } = useSession();
  const signedIn = !!session?.user;
  const lessons = useQuery({
    queryKey: ["site", "progress", "lessons", session?.user.id],
    queryFn: () => getJson<{ lessons: string[] }>("/api/progress"),
    enabled: signedIn,
  });
  const drills = useQuery({
    queryKey: ["site", "progress", "drills", session?.user.id],
    queryFn: () => getJson<{ drills: ServerDrill[] }>("/api/drills/progress"),
    enabled: signedIn,
  });
  return {
    signedIn,
    sessionPending: isPending,
    user: session?.user ?? null,
    loading: signedIn && (lessons.isPending || drills.isPending),
    lessons: lessons.data?.lessons ?? [],
    drills: drills.data?.drills ?? [],
  };
}

/** Local and server progress merged. */
export function useProgress() {
  const local = useLocalProgress();
  const server = useServerProgress();

  const lessons = new Set([...local.lessons, ...server.lessons]);

  const drills = new Map<string, DrillProgress>();
  for (const l of local.drills) drills.set(l.slug, l);
  for (const s of server.drills) {
    const l = drills.get(s.slug);
    drills.set(s.slug, {
      slug: s.slug,
      stepsDone: Math.max(s.stepsDone, l?.stepsDone ?? 0),
      totalSteps: s.totalSteps ?? l?.totalSteps ?? null,
      completedAt: s.completedAt ?? l?.completedAt ?? null,
      updatedAt: [s.updatedAt, l?.updatedAt].filter(Boolean).sort().pop() ?? null,
    });
  }

  return { ...server, lessons, drills };
}

export function drillPercent(p: DrillProgress | undefined) {
  if (!p) return 0;
  if (p.completedAt) return 100;
  if (!p.totalSteps) return p.stepsDone > 0 ? 5 : 0;
  return Math.min(100, Math.round((p.stepsDone / p.totalSteps) * 100));
}
