import { createStore, type StoreApi } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import type { TestResult } from "@/sim";
import { DEFAULT_CONFIGS } from "./run";
import type { Endpoint, Lab, LabConfigs, LabGraph, LabNode, LabSave, RunSummary, SchemaDesign, Step } from "./types";

export function storageKey(lab: Pick<Lab, "slug" | "version">) {
  return `wirebox:lab:${lab.slug}:v${lab.version}`;
}

export function emptySave(lab: Lab): LabSave {
  const schema = lab.steps.find((s) => s.type === "schema");
  return {
    version: lab.version,
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

export type LabActions = {
  go: (index: number) => void;
  pass: (stepId: string) => void;
  setApi: (reqId: string, e: Endpoint) => void;
  setSchema: (s: SchemaDesign) => void;
  setGraph: (g: LabGraph) => void;
  addNode: (n: LabNode) => void;
  updateNode: (id: string, patch: Partial<LabNode>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  removeNodes: (ids: string[]) => void;
  addEdge: (from: string, to: string) => void;
  removeEdges: (ids: string[]) => void;
  setConfigs: (patch: { [K in keyof LabConfigs]?: Partial<LabConfigs[K]> }) => void;
  choose: (stepId: string, option: string) => void;
  recordRun: (stepId: string, run: LiveRun, summary: RunSummary) => void;
  openHint: (stepId: string) => void;
  complete: () => void;
  reset: () => void;
  /** Replace everything with a save from the server. */
  hydrateFrom: (save: LabSave) => void;
};

export type LabState = LabSave & { live: Record<string, LiveRun>; hydrated: boolean } & LabActions;
export type LabStore = StoreApi<LabState>;

const stores = new Map<string, LabStore>();

export function getLabStore(lab: Lab): LabStore {
  const key = storageKey(lab);
  const existing = stores.get(key);
  if (existing) return existing;

  const store = createStore<LabState>()(
    persist(
      (set, get) => {
        const touch = <T extends Partial<LabState>>(patch: T) =>
          set({ ...patch, updatedAt: Date.now(), startedAt: get().startedAt ?? Date.now() });

        return {
          ...emptySave(lab),
          live: {},
          hydrated: false,
          go: (index) => set({ current: Math.max(0, Math.min(lab.steps.length - 1, index)) }),
          pass: (stepId) => {
            if (get().passed.includes(stepId)) return;
            touch({ passed: [...get().passed, stepId] });
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
          reset: () => set({ ...emptySave(lab), live: {}, updatedAt: Date.now() }),
          hydrateFrom: (save) => set({ ...emptySave(lab), ...save, live: {} }),
        };
      },
      {
        name: key,
        version: lab.version,
        storage: createJSONStorage(() => localStorage),
        partialize: (s): LabSave => saveOf(s),
        merge: (persisted, current) => ({ ...current, ...(persisted as Partial<LabSave>) }),
      },
    ),
  );

  // Storage may be unavailable (private mode); the store still works in memory.
  if (store.persist.hasHydrated()) store.setState({ hydrated: true });
  else store.persist.onFinishHydration(() => store.setState({ hydrated: true }));
  stores.set(key, store);
  return store;
}

export function saveOf(s: LabState): LabSave {
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
