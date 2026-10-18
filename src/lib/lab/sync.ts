"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { saveOf, type LabStore } from "./store";
import type { Lab, LabSave } from "./types";

export type ServerProgress = {
  state: LabSave;
  version: number;
  stepsDone: number;
  completedAt: string | null;
  updatedAt: string;
} | null;

export type SyncStatus = "local" | "loading" | "saving" | "saved" | "error";

async function put(lab: Lab, save: LabSave) {
  const res = await fetch(`/api/labs/${lab.slug}/progress`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      version: lab.version,
      state: save,
      stepsDone: save.passed.length,
      completedAt: save.completedAt ? new Date(save.completedAt).toISOString() : null,
    }),
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
}

/**
 * Signed-in learners get their lab saved on the server. On load the newer of
 * the local and server copies wins; after that every change is pushed,
 * debounced.
 */
export function useLabSync(lab: Lab, store: LabStore, hydrated: boolean): SyncStatus {
  const { data: session, isPending } = useSession();
  const signedIn = !!session;
  const qc = useQueryClient();
  const reconciled = useRef(false);
  const [status, setStatus] = useState<SyncStatus>("saved");

  const query = useQuery({
    queryKey: ["lab-progress", lab.slug],
    enabled: signedIn && hydrated,
    staleTime: Infinity,
    queryFn: async (): Promise<ServerProgress> => {
      const res = await fetch(`/api/labs/${lab.slug}/progress`);
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      return res.json();
    },
  });

  const save = useMutation({
    mutationFn: (s: LabSave) => put(lab, s),
    onMutate: () => setStatus("saving"),
    onSuccess: () => {
      setStatus("saved");
      void qc.invalidateQueries({ queryKey: ["lab-progress-all"] });
    },
    onError: () => setStatus("error"),
  });
  const saveRef = useRef(save.mutate);
  useEffect(() => {
    saveRef.current = save.mutate;
  }, [save.mutate]);

  // Reconcile once: newest wins.
  useEffect(() => {
    if (!signedIn || !query.isSuccess || reconciled.current) return;
    reconciled.current = true;
    const local = saveOf(store.getState());
    const remote = query.data;
    if (remote && remote.version === lab.version && (remote.state.updatedAt ?? 0) > local.updatedAt) {
      store.getState().hydrateFrom(remote.state);
    } else if (local.updatedAt > 0 && (!remote || remote.state.updatedAt !== local.updatedAt)) {
      saveRef.current(local);
    }
  }, [signedIn, query.isSuccess, query.data, store, lab.version]);

  // Push changes, debounced.
  useEffect(() => {
    if (!signedIn) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = store.subscribe((s, prev) => {
      if (!reconciled.current || s.updatedAt === prev.updatedAt) return;
      clearTimeout(timer);
      timer = setTimeout(() => saveRef.current(saveOf(store.getState())), 1200);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [signedIn, store]);

  if (isPending) return "local";
  if (!signedIn) return "local";
  if (query.isLoading) return "loading";
  if (query.isError) return "error";
  return status;
}
