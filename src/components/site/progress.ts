"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useSession } from "@/lib/auth-client";

/**
 * Read-only view of the learner's progress for the site pages (/labs, /me).
 * The writers live elsewhere: /learn owns `wirebox:lessons:v1` and
 * GET /api/progress; the lab player owns `wirebox:lab:<slug>:v<version>` and
 * GET /api/labs/progress. Local and server progress are merged, so it works
 * signed out and syncs once signed in.
 */

export const LESSONS_KEY = "wirebox:lessons:v1";
const LAB_KEY = /^wirebox:lab:(.+):v(\d+)$/;

export type LabProgress = {
  slug: string;
  stepsDone: number;
  totalSteps: number | null;
  completedAt: string | null;
  updatedAt: string | null;
};

type ServerLab = { slug: string; stepsDone: number; totalSteps: number; completedAt: string | null; updatedAt: string };

// --- localStorage snapshot (stable between changes for useSyncExternalStore) ---

let cache: { raw: string; lessons: string[]; labs: LabProgress[] } | null = null;
const EMPTY = { lessons: [] as string[], labs: [] as LabProgress[] };

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

function parseLab(slug: string, v: unknown): LabProgress | null {
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
      if (k && (k === LESSONS_KEY || LAB_KEY.test(k))) entries.push([k, localStorage.getItem(k) ?? ""]);
    }
  } catch {
    return EMPTY;
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  raw = JSON.stringify(entries);
  if (cache && cache.raw === raw) return cache;

  let lessons: string[] = [];
  const labs = new Map<string, { v: number; p: LabProgress }>();
  for (const [k, val] of entries) {
    if (k === LESSONS_KEY) {
      lessons = parseLessons(safeParse(val));
      continue;
    }
    const m = LAB_KEY.exec(k);
    if (!m) continue;
    const p = parseLab(m[1], safeParse(val));
    const v = Number(m[2]);
    if (p && (!labs.has(m[1]) || labs.get(m[1])!.v < v)) labs.set(m[1], { v, p });
  }
  cache = { raw, lessons, labs: [...labs.values()].map((x) => x.p) };
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
  const labs = useQuery({
    queryKey: ["site", "progress", "labs", session?.user.id],
    queryFn: () => getJson<{ labs: ServerLab[] }>("/api/labs/progress"),
    enabled: signedIn,
  });
  return {
    signedIn,
    sessionPending: isPending,
    user: session?.user ?? null,
    loading: signedIn && (lessons.isPending || labs.isPending),
    lessons: lessons.data?.lessons ?? [],
    labs: labs.data?.labs ?? [],
  };
}

/** Local and server progress merged. */
export function useProgress() {
  const local = useLocalProgress();
  const server = useServerProgress();

  const lessons = new Set([...local.lessons, ...server.lessons]);

  const labs = new Map<string, LabProgress>();
  for (const l of local.labs) labs.set(l.slug, l);
  for (const s of server.labs) {
    const l = labs.get(s.slug);
    labs.set(s.slug, {
      slug: s.slug,
      stepsDone: Math.max(s.stepsDone, l?.stepsDone ?? 0),
      totalSteps: s.totalSteps ?? l?.totalSteps ?? null,
      completedAt: s.completedAt ?? l?.completedAt ?? null,
      updatedAt: [s.updatedAt, l?.updatedAt].filter(Boolean).sort().pop() ?? null,
    });
  }

  return { ...server, lessons, labs };
}

export function labPercent(p: LabProgress | undefined) {
  if (!p) return 0;
  if (p.completedAt) return 100;
  if (!p.totalSteps) return p.stepsDone > 0 ? 5 : 0;
  return Math.min(100, Math.round((p.stepsDone / p.totalSteps) * 100));
}
