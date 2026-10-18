"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getLesson } from "@/content/course";
import { track } from "@/lib/analytics";
import { useSession } from "@/lib/auth-client";
import { fetchProgress, putProgress, type ProgressResponse, type ProgressUpdate } from "./api";
import {
  MERGED_USER_KEY,
  getCompleted,
  getServerCompleted,
  markLocal,
  readKey,
  setCompleted,
  subscribe,
  writeKey,
} from "./store";

const MUTATION_KEY = ["progress", "put"] as const;
export const progressQueryKey = (userId: string | undefined) => ["progress", userId ?? "anon"] as const;

/** One merge per user per page load, however many components use the hook. */
let mergingFor: string | null = null;

const noopSubscribe = () => () => {};

/**
 * Completed lessons for the current reader.
 *
 * Signed out: localStorage only. Signed in: the first time this browser sees
 * a user, local and server progress are union-merged (so nothing done before
 * signing in is lost). After that the server is the source of truth and the
 * local copy mirrors it, so un-completing a lesson on one device sticks.
 */
export function useLessonProgress() {
  const completed = useSyncExternalStore(subscribe, getCompleted, getServerCompleted);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const session = useSession();
  const userId = session.data?.user.id;
  const qc = useQueryClient();
  const pending = useIsMutating({ mutationKey: MUTATION_KEY });

  const query = useQuery({
    queryKey: progressQueryKey(userId),
    queryFn: fetchProgress,
    enabled: !!userId,
  });

  const mutation = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: (update: ProgressUpdate) => putProgress(update),
    onSuccess: (data) => qc.setQueryData<ProgressResponse>(progressQueryKey(userId), data),
  });
  const { mutate } = mutation;

  // Signed out: forget which user we merged with, so the next sign-in merges again.
  useEffect(() => {
    if (!session.isPending && !session.data) writeKey(MERGED_USER_KEY, null);
  }, [session.isPending, session.data]);

  useEffect(() => {
    if (!userId || !query.data || pending > 0) return;
    const server = new Set(query.data.lessons);
    if (readKey(MERGED_USER_KEY) === userId) {
      setCompleted(server);
      return;
    }
    if (mergingFor === userId) return;
    mergingFor = userId;
    const local = getCompleted();
    const missing = [...local].filter((s) => !server.has(s));
    setCompleted([...server, ...local]);
    const done = () => {
      writeKey(MERGED_USER_KEY, userId);
      mergingFor = null;
      track("progress_synced", { items: missing.length });
    };
    if (missing.length === 0) done();
    else mutate({ lessons: missing }, { onSuccess: done, onError: () => (mergingFor = null) });
  }, [userId, query.data, pending, mutate]);

  const setDone = useCallback(
    (slug: string, done: boolean) => {
      if (getCompleted().has(slug) === done) return;
      markLocal(slug, done);
      const moduleSlug = getLesson(slug)?.module.slug ?? "unknown";
      track(done ? "lesson_completed" : "lesson_uncompleted", { lesson: slug, module: moduleSlug });
      if (userId) mutate({ lesson: slug, done });
    },
    [userId, mutate],
  );

  const isDone = useCallback((slug: string) => completed.has(slug), [completed]);

  return {
    /** Completed slugs. Empty until hydrated. */
    completed,
    /** False during prerender and the first client render. */
    hydrated,
    signedIn: !!userId,
    syncing: query.isFetching || pending > 0,
    isDone,
    setDone,
    toggle: useCallback((slug: string) => setDone(slug, !getCompleted().has(slug)), [setDone]),
  };
}
