import { createStore, type StoreApi } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import type { TestResult } from "@/sim";
import { track } from "@/lib/analytics";
import { DEFAULT_CONFIGS } from "./run";
import type { Endpoint, Drill, DrillConfigs, DrillGraph, DrillNode, DrillSave, RunSummary, SchemaDesign, Step } from "./types";

export function storageKey(drill: Pick<Drill, "slug" | "version">) {
  return `wirebox:drill:${drill.slug}:v${drill.version}`;
}

export function emptySave(drill: Drill): DrillSave {
  const schema = drill.steps.find((s) => s.type === "schema");
  return {
    version: drill.version,
    startedAt: null,
    completedAt: null,
    updatedAt: 0,
    current: 0,
    passed: [],
    api: {},
    schema: schema?.type === "schema" ? structuredClone(schema.starter) : { engine: null, tables: [] },
    graph: { nodes: [], edges: [] },
    configs: structuredClone(DEFAULT_CONFIGS),
    choices: {},
    runs: {},
    hints: {},
  };
}

/** Not persisted: the latest load test per step, so results survive switching steps. */
export type LiveRun = { result: TestResult; dbLabel: string; clientCached: number; at: number };

export type DrillActions = {
  go: (index: number) => void;
  pass: (stepId: string) => void;
  setApi: (reqId: string, e: Endpoint) => void;
  setSchema: (s: SchemaDesign) => void;
  setGraph: (g: DrillGraph) => void;
  addNode: (n: DrillNode) => void;
  updateNode: (id: string, patch: Partial<DrillNode>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  removeNodes: (ids: string[]) => void;
  addEdge: (from: string, to: string) => void;
  removeEdges: (ids: string[]) => void;
  setConfigs: (patch: { [K in keyof DrillConfigs]?: Partial<DrillConfigs[K]> }) => void;
  choose: (stepId: string, option: string) => void;
  recordRun: (stepId: string, run: LiveRun, summary: RunSummary) => void;
  openHint: (stepId: string) => void;
  complete: () => void;
  reset: () => void;
  /** Replace everything with a save from the server. */
  hydrateFrom: (save: DrillSave) => void;
};

export type DrillState = DrillSave & { live: Record<string, LiveRun>; hydrated: boolean } & DrillActions;
export type DrillStore = StoreApi<DrillState>;

const stores = new Map<string, DrillStore>();

export function getDrillStore(drill: Drill): DrillStore {
  const key = storageKey(drill);
  const existing = stores.get(key);
  if (existing) return existing;

  const store = createStore<DrillState>()(
    persist(
      (set, get) => {
        const touch = <T extends Partial<DrillState>>(patch: T) =>
          set({ ...patch, updatedAt: Date.now(), startedAt: get().startedAt ?? Date.now() });

        return {
          ...emptySave(drill),
          live: {},
          hydrated: false,
          go: (index) => set({ current: Math.max(0, Math.min(drill.steps.length - 1, index)) }),
          pass: (stepId) => {
            if (get().passed.includes(stepId)) return;
            touch({ passed: [...get().passed, stepId] });
            const index = drill.steps.findIndex((s) => s.id === stepId);
            track("drill_step_completed", { drill: drill.slug, step: index, type: drill.steps[index]?.type ?? "unknown" });
          },
          setApi: (reqId, e) => touch({ api: { ...get().api, [reqId]: e } }),
          setSchema: (schema) => touch({ schema }),
          setGraph: (graph) => touch({ graph }),
          addNode: (n) => touch({ graph: { ...get().graph, nodes: [...get().graph.nodes, n] } }),
          updateNode: (id, patch) =>
            touch({
              graph: { ...get().graph, nodes: get().graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
            }),
          moveNode: (id, x, y) =>
            touch({
              graph: { ...get().graph, nodes: get().graph.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) },
            }),
          removeNodes: (ids) => {
            const gone = new Set(ids);
            const g = get().graph;
            touch({
              graph: {
                nodes: g.nodes.filter((n) => !gone.has(n.id)),
                edges: g.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to)),
              },
            });
          },
          addEdge: (from, to) => {
            const g = get().graph;
            if (g.edges.some((e) => e.from === from && e.to === to)) return;
            touch({ graph: { ...g, edges: [...g.edges, { id: `${from}>${to}`, from, to }] } });
          },
          removeEdges: (ids) => {
            const gone = new Set(ids);
            const g = get().graph;
            touch({ graph: { ...g, edges: g.edges.filter((e) => !gone.has(e.id)) } });
          },
          setConfigs: (patch) => {
            const c = get().configs;
            touch({
              configs: {
                cache: { ...c.cache, ...patch.cache },
                limiter: { ...c.limiter, ...patch.limiter },
                resilience: { ...c.resilience, ...patch.resilience },
                custom: { ...c.custom, ...(patch.custom as Record<string, string> | undefined) },
              },
            });
          },
          choose: (stepId, option) => touch({ choices: { ...get().choices, [stepId]: option } }),
          recordRun: (stepId, run, summary) => {
            set({ live: { ...get().live, [stepId]: run } });
            if (summary.pass) touch({ runs: { ...get().runs, [stepId]: summary } });
          },
          openHint: (stepId) => touch({ hints: { ...get().hints, [stepId]: (get().hints[stepId] ?? 0) + 1 } }),
          complete: () => {
            if (!get().completedAt) touch({ completedAt: Date.now() });
          },
          reset: () => set({ ...emptySave(drill), live: {}, updatedAt: Date.now() }),
          hydrateFrom: (save) => set({ ...emptySave(drill), ...save, live: {} }),
        };
      },
      {
        name: key,
        version: drill.version,
        storage: createJSONStorage(() => localStorage),
        partialize: (s): DrillSave => saveOf(s),
        merge: (persisted, current) => ({ ...current, ...(persisted as Partial<DrillSave>) }),
      },
    ),
  );

  // Storage may be unavailable (private mode); the store still works in memory.
  if (store.persist.hasHydrated()) store.setState({ hydrated: true });
  else store.persist.onFinishHydration(() => store.setState({ hydrated: true }));
  stores.set(key, store);
  return store;
}

export function saveOf(s: DrillState): DrillSave {
  return {
    version: s.version,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    updatedAt: s.updatedAt,
    current: s.current,
    passed: s.passed,
    api: s.api,
    schema: s.schema,
    graph: s.graph,
    configs: s.configs,
    choices: s.choices,
    runs: s.runs,
    hints: s.hints,
  };
}

/** Index of the first step not yet passed: everything after it is locked. */
export function frontier(steps: Step[], passed: string[]) {
  const i = steps.findIndex((s) => s.type !== "finish" && !passed.includes(s.id));
  return i === -1 ? steps.length - 1 : i;
}

export function isUnlocked(steps: Step[], passed: string[], index: number) {
  return index <= frontier(steps, passed);
}
